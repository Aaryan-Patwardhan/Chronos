// Direct messages live in their own store with their own cache, like Meta's
// separate messaging store: the inbox opens instantly from cache, then syncs.
// Unsent messages wait in an outbox (saved locally) and are retried when the
// connection returns. client_id makes every retry safe (no duplicates).
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/errors'
import type { Message, Profile } from '../lib/types'

// Network trouble → keep waiting and retry. Anything else is a real refusal.
const isNetworkError = (e: { message?: string; code?: string }) =>
  !e.code && /fetch|network|load failed|timeout/i.test(e.message ?? '')
const RETRY_MS = 8000
let flushing: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | undefined

type State = {
  me: string | null
  threads: Record<string, Message[]>
  people: Record<string, Profile>
  online: boolean
  /** 'loading' until the first sync; 'error' if it failed (cache may still show). */
  status: 'loading' | 'ready' | 'error'
  start: (me: string) => () => void
  sync: () => Promise<void>
  send: (partner: string, body: string) => void
  retry: (clientId: string) => void
  discard: (clientId: string) => void
  flush: () => Promise<void>
  markSeen: (partner: string) => Promise<void>
  loadPeople: (ids: string[]) => Promise<void>
  unreadCount: () => number
}

const cacheKey = (me: string) => `chronos:dm:${me}`
const partnerOf = (m: Message, me: string) => (m.sender_id === me ? m.recipient_id : m.sender_id)

function merge(threads: Record<string, Message[]>, me: string, incoming: Message[]) {
  const next = { ...threads }
  for (const m of incoming) {
    const p = partnerOf(m, me)
    const list = [...(next[p] ?? [])]
    const i = list.findIndex((x) => x.client_id === m.client_id)
    if (i >= 0) list[i] = { ...list[i], ...m, pending: m.pending ?? false, failed: m.failed }
    else list.push(m)
    list.sort((a, b) => a.created_at.localeCompare(b.created_at))
    next[p] = list.slice(-200)
  }
  return next
}

export const useMessages = create<State>((set, get) => {
  const persist = () => {
    const { me, threads, people } = get()
    if (!me) return
    try { localStorage.setItem(cacheKey(me), JSON.stringify({ threads, people })) } catch { /* storage full or blocked */ }
  }

  return {
    me: null,
    threads: {},
    people: {},
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    status: 'loading',

    start: (me) => {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey(me)) ?? 'null')
        set({ me, threads: cached?.threads ?? {}, people: cached?.people ?? {} })
      } catch {
        set({ me, threads: {}, people: {} })
      }

      void get().sync()

      const onNewMsg = (payload: { new: Message }) => {
        set({ threads: merge(get().threads, me, [{ ...payload.new, pending: false }]) })
        void get().loadPeople([partnerOf(payload.new, me)])
        persist()
      }

      // UPDATE fires when the partner marks our outgoing message as seen,
      // or when mark_seen() resolves a batch. Both paths handled here.
      const onUpdate = (payload: { new: Message }) => {
        set({ threads: merge(get().threads, me, [{ ...payload.new, pending: false }]) })
        persist()
      }

      const channel = supabase.channel(`dm:${me}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${me}` }, onNewMsg)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${me}` }, onNewMsg)
        // Receive seen_at updates on messages we sent (partner marked them seen)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender_id=eq.${me}` }, onUpdate)
        // Receive seen_at updates on messages we received (our own mark_seen RPC confirmation)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `recipient_id=eq.${me}` }, onUpdate)
        .subscribe()

      const goOnline = () => { set({ online: true }); void get().flush() }
      const goOffline = () => set({ online: false })
      window.addEventListener('online', goOnline)
      window.addEventListener('offline', goOffline)
      return () => {
        clearTimeout(retryTimer)
        void supabase.removeChannel(channel)
        window.removeEventListener('online', goOnline)
        window.removeEventListener('offline', goOffline)
      }
    },

    send: (partner, body) => {
      const me = get().me
      const text = body.trim()
      if (!me || !text) return
      const msg: Message = {
        client_id: crypto.randomUUID(), sender_id: me, recipient_id: partner,
        body: text.slice(0, 2000), created_at: new Date().toISOString(), seen_at: null, pending: true,
      }
      set({ threads: merge(get().threads, me, [msg]) })
      persist()
      void get().flush()
    },

    sync: async () => {
      const me = get().me
      if (!me) return
      set({ status: 'loading' })
      const { data, error } = await supabase.from('messages').select('*')
        .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
        .order('created_at', { ascending: false }).limit(500)
      if (error) return set({ status: 'error' })
      set({ threads: merge(get().threads, me, data as Message[]), status: 'ready' })
      await get().loadPeople(Object.keys(get().threads))
      persist()
      await get().flush()
    },

    // One flush at a time; a send during a flush is picked up by a second pass.
    flush: async () => {
      if (flushing) { await flushing; return get().flush() }
      flushing = (async () => {
        const me = get().me
        // Use live navigator.onLine rather than stored state (avoids stale closures)
        if (!me || !navigator.onLine) return
        const pending = Object.values(get().threads).flat().filter((m) => m.pending && !m.failed && m.sender_id === me)
        for (const m of pending) {
          const { error } = await supabase.from('messages').insert({
            client_id: m.client_id, sender_id: m.sender_id, recipient_id: m.recipient_id, body: m.body,
          })
          if (!error || error.code === '23505') {
            // '23505' = unique_violation: already inserted by a previous retry, treat as success
            set({ threads: merge(get().threads, me, [{ ...m, pending: false, failed: undefined }]) })
          } else if (isNetworkError(error)) {
            // Can't reach the server: keep it waiting and try again shortly.
            clearTimeout(retryTimer)
            retryTimer = setTimeout(() => void get().flush(), RETRY_MS)
            break
          } else {
            // The server refused it — show why, and let the user retry or remove it.
            set({ threads: merge(get().threads, me, [{ ...m, failed: friendly(error, 'Tap Retry to try again.') }]) })
          }
        }
        persist()
      })()
      try { await flushing } finally { flushing = null }
    },

    retry: (clientId) => {
      const me = get().me
      const m = Object.values(get().threads).flat().find((x) => x.client_id === clientId)
      if (!me || !m) return
      set({ threads: merge(get().threads, me, [{ ...m, pending: true, failed: undefined }]) })
      void get().flush()
    },

    discard: (clientId) => {
      const me = get().me
      if (!me) return
      const threads = Object.fromEntries(Object.entries(get().threads)
        .map(([p, list]) => [p, list.filter((m) => !(m.client_id === clientId && (m.pending || m.failed)))]))
      set({ threads })
      persist()
    },

    markSeen: async (partner) => {
      const me = get().me
      if (!me) return
      const unseen = (get().threads[partner] ?? []).filter((m) => m.recipient_id === me && !m.seen_at)
      if (!unseen.length) return
      // Optimistic: stamp locally so the UI updates immediately
      const now = new Date().toISOString()
      set({ threads: merge(get().threads, me, unseen.map((m) => ({ ...m, seen_at: now }))) })
      persist()
      // Then persist via the DB function (only recipient can update seen_at — RLS)
      await supabase.rpc('mark_seen', { partner })
    },

    loadPeople: async (ids) => {
      const missing = ids.filter((id) => !get().people[id] && id !== get().me)
      if (!missing.length) return
      const { data } = await supabase.from('profiles').select('id, username, full_name, avatar_url, bio').in('id', missing)
      if (data) set({ people: { ...get().people, ...Object.fromEntries(data.map((p) => [p.id, p as Profile])) } })
    },

    unreadCount: () => {
      const me = get().me
      return Object.values(get().threads).flat().filter((m) => m.recipient_id === me && !m.seen_at).length
    },
  }
})

/** On log out: forget this device's copy of the messages (shared phones). */
export function clearMessageCache(userId: string | undefined) {
  if (userId) try { localStorage.removeItem(cacheKey(userId)) } catch { /* blocked */ }
  useMessages.setState({ me: null, threads: {}, people: {}, status: 'loading' })
}
