// Direct messages live in their own store with their own cache, like Meta's
// separate messaging store: the inbox opens instantly from cache, then syncs.
// Unsent messages wait in an outbox (saved locally) and are retried when the
// connection returns. client_id makes every retry safe (no duplicates).
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Message, Profile } from '../lib/types'

type State = {
  me: string | null
  threads: Record<string, Message[]>
  people: Record<string, Profile>
  online: boolean
  start: (me: string) => () => void
  send: (partner: string, body: string) => void
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
    if (i >= 0) list[i] = { ...list[i], ...m, pending: m.pending ?? false }
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

    start: (me) => {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey(me)) ?? 'null')
        set({ me, threads: cached?.threads ?? {}, people: cached?.people ?? {} })
      } catch {
        set({ me, threads: {}, people: {} })
      }

      void (async () => {
        const { data } = await supabase.from('messages').select('*')
          .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
          .order('created_at', { ascending: false }).limit(500)
        if (data) {
          set({ threads: merge(get().threads, me, data as Message[]) })
          await get().loadPeople(Object.keys(get().threads))
          persist()
        }
        await get().flush()
      })()

      const onChange = (payload: { new: Message }) => {
        set({ threads: merge(get().threads, me, [{ ...payload.new, pending: false }]) })
        void get().loadPeople([partnerOf(payload.new, me)])
        persist()
      }
      const channel = supabase.channel(`dm:${me}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${me}` }, onChange)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${me}` }, onChange)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender_id=eq.${me}` }, onChange)
        .subscribe()

      const goOnline = () => { set({ online: true }); void get().flush() }
      const goOffline = () => set({ online: false })
      window.addEventListener('online', goOnline)
      window.addEventListener('offline', goOffline)
      return () => {
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

    flush: async () => {
      const me = get().me
      if (!me || !navigator.onLine) return
      const pending = Object.values(get().threads).flat().filter((m) => m.pending && m.sender_id === me)
      for (const m of pending) {
        const { error } = await supabase.from('messages').insert({
          client_id: m.client_id, sender_id: m.sender_id, recipient_id: m.recipient_id, body: m.body,
        })
        if (!error || error.code === '23505') {
          set({ threads: merge(get().threads, me, [{ ...m, pending: false }]) })
        } else {
          break // still offline or server unreachable; retry on the next 'online' event
        }
      }
      persist()
    },

    markSeen: async (partner) => {
      const me = get().me
      if (!me) return
      const unseen = (get().threads[partner] ?? []).filter((m) => m.recipient_id === me && !m.seen_at)
      if (!unseen.length) return
      const now = new Date().toISOString()
      set({ threads: merge(get().threads, me, unseen.map((m) => ({ ...m, seen_at: now }))) })
      persist()
      await supabase.rpc('mark_seen', { partner })
    },

    loadPeople: async (ids) => {
      const missing = ids.filter((id) => !get().people[id])
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
