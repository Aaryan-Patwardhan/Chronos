// Full-screen story viewer. Tap the right side for next, left third for
// back, press and hold to pause. Own stories show "Seen by" and Delete;
// other people's stories can be answered with a direct message.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Eye, ImageOff, Send, Trash2, X } from 'lucide-react'
import Avatar from './Avatar'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/time'
import { friendly } from '../lib/errors'
import { storagePath } from '../lib/image'
import { useAuth } from '../store/auth'
import { useStories } from '../store/stories'
import { useMessages } from '../store/messages'
import type { StoryUser } from '../types/stories'

const DURATION = 5000
const firstUnseen = (u: StoryUser) => Math.max(0, u.stories.findIndex((s) => !s.viewed))
type Viewer = { username: string; avatar_url: string; full_name: string }

export default function StoryViewer({ users, start, onClose }: { users: StoryUser[]; start: number; onClose: () => void }) {
  const me = useAuth((s) => s.me)
  const markSeen = useStories((s) => s.markSeen)
  const removeStory = useStories((s) => s.remove)
  const sendMessage = useMessages((s) => s.send)
  const [list, setList] = useState(users)
  const [pos, setPos] = useState(() => ({ u: start, s: users[start] ? firstUnseen(users[start]) : 0 }))
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  // Which story's photo has loaded / failed. Keyed by story id (not a
  // true/false flag) because a preloaded photo fires "load" immediately —
  // before any reset could run — and a reset would then freeze the story.
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [note, setNote] = useState('')
  const [seenBy, setSeenBy] = useState<Viewer[] | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const elapsed = useRef(0)
  const last = useRef<number | null>(null)
  const holdTimer = useRef<number | null>(null)
  const held = useRef(false)
  const seenReq = useRef(0)

  const user = list[pos.u]
  const story = user?.stories[pos.s]
  const isMine = !!user && user.id === me?.id
  const loaded = !!story && (loadedId === story.id || failedId === story.id)
  const failed = !!story && failedId === story.id
  const blocked = paused || !loaded || !!seenBy || confirmDelete || reply.length > 0

  const go = useCallback((dir: 1 | -1) => {
    setPos(({ u, s }) => {
      const cur = list[u]
      if (!cur) return { u, s }
      if (dir === 1) return s + 1 < cur.stories.length ? { u, s: s + 1 } : { u: u + 1, s: list[u + 1] ? firstUnseen(list[u + 1]) : 0 }
      if (s > 0) return { u, s: s - 1 }
      return u > 0 ? { u: u - 1, s: list[u - 1].stories.length - 1 } : { u, s: 0 }
    })
  }, [list])

  // Finished the last story → close.
  useEffect(() => { if (pos.u >= list.length) onClose() }, [pos.u, list.length, onClose])

  // New story: reset the timer, mark it seen, preload the next photo.
  useEffect(() => {
    elapsed.current = 0; last.current = null
    setProgress(0); setNote('')
    if (story && me && !isMine && !story.viewed) markSeen(story.id, me.id)
    const next = user?.stories[pos.s + 1] ?? list[pos.u + 1]?.stories[0]
    if (next) new Image().src = next.media_url
  }, [story?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Progress keeps its place while paused and resumes from there.
  useEffect(() => {
    if (blocked || !story) { last.current = null; return }
    let raf = 0
    const tick = (t: number) => {
      if (last.current !== null) elapsed.current += t - last.current
      last.current = t
      const p = Math.min(1, elapsed.current / DURATION)
      setProgress(p)
      if (p >= 1) { go(1); return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); last.current = null }
  }, [blocked, story, go])

  // Keyboard: ← → to move, Space to pause, Esc to close (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') { if (e.key === 'Escape') (e.target as HTMLElement).blur(); return }
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'Escape') onClose()
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p) }
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [go, onClose])

  // One handler set (pointer events) → one tap is exactly one step.
  function onPointerDown() {
    held.current = false
    holdTimer.current = window.setTimeout(() => { held.current = true; setPaused(true) }, 200)
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
    if (held.current) { held.current = false; setPaused(false); return }
    const rect = e.currentTarget.getBoundingClientRect()
    go(e.clientX - rect.left < rect.width / 3 ? -1 : 1)
  }
  function onPointerCancel() {
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
    if (held.current) { held.current = false; setPaused(false) }
  }

  // The list loads after the sheet opens; if it was closed meanwhile, a late
  // answer must not re-open it (each open gets a request number).
  async function openSeenBy() {
    if (!story) return
    const req = ++seenReq.current
    setSeenBy([])
    const { data } = await supabase.from('story_views')
      .select('viewer:profiles!story_views_viewer_id_fkey(username, avatar_url, full_name)')
      .eq('story_id', story.id).order('viewed_at', { ascending: false })
    if (req !== seenReq.current) return
    setSeenBy(((data ?? []) as unknown as { viewer: Viewer }[]).map((r) => r.viewer).filter(Boolean))
  }
  const closeSeenBy = () => { seenReq.current++; setSeenBy(null) }

  async function deleteStory() {
    if (!story || !me) return
    const { error } = await supabase.from('posts').delete().eq('id', story.id)
    setConfirmDelete(false)
    if (error) return setNote(friendly(error, "We couldn't delete this story. Please try again."))
    const path = storagePath(story.media_url)
    if (path?.startsWith(`${me.id}/`)) void supabase.storage.from('media').remove([path])
    removeStory(story.id)
    const left = user.stories.filter((s) => s.id !== story.id)
    // Deleted your last story → back to the feed (only your own stories
    // can be deleted, so don't roll on into other people's).
    if (!left.length) return onClose()
    else {
      setList(list.map((u, i) => (i === pos.u ? { ...u, stories: left } : u)))
      setPos({ u: pos.u, s: Math.min(pos.s, left.length - 1) })
    }
  }

  function sendReply(e: React.FormEvent) {
    e.preventDefault()
    const text = reply.trim()
    if (!text || !user) return
    sendMessage(user.id, `Replied to your story: ${text}`)
    setReply('')
    setNote(`Sent to ${user.username}`)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  if (!user || !story) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black" role="dialog" aria-modal="true" aria-label={`${user.username}'s story`}>
      <div className="relative h-full w-full max-w-md overflow-hidden">
        {failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-white/70"><ImageOff size={32} />Photo unavailable</div>
        ) : (
          <img key={story.id} src={story.media_url} alt={story.caption || `${user.username}'s story`} draggable={false}
            ref={(el) => { if (el?.complete && el.naturalWidth > 0) setLoadedId(story.id) }}
            onLoad={() => setLoadedId(story.id)} onError={() => setFailedId(story.id)}
            className={`h-full w-full select-none object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`} />
        )}
        {!loaded && <div className="absolute inset-0 flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" /></div>}

        {/* Tap layer: left third = back, rest = next, hold = pause */}
        <div className="absolute inset-0 touch-none" onPointerDown={onPointerDown} onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel} onPointerLeave={onPointerCancel} onContextMenu={(e) => e.preventDefault()} />

        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-3 pb-8 pt-3">
          <div className="flex gap-1" aria-hidden>
            {user.stories.map((s, i) => (
              <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/35">
                <div className="h-full bg-white" style={{ width: `${i < pos.s ? 100 : i === pos.s ? progress * 100 : 0}%` }} />
              </div>
            ))}
          </div>
          <div className="pointer-events-auto mt-3 flex items-center gap-2 text-white">
            <Link to={`/u/${user.username}`} onClick={onClose} className="flex min-w-0 items-center gap-2">
              <Avatar src={user.avatar_url} name={user.username} size={32} />
              <span className="truncate text-sm font-semibold">{isMine ? 'Your story' : user.username}</span>
            </Link>
            <span className="text-xs text-white/70">{timeAgo(story.created_at)}</span>
            {paused && <span className="text-xs text-white/70">· Paused</span>}
            <span className="ml-auto flex items-center gap-1">
              {isMine && <button onClick={() => setConfirmDelete(true)} aria-label="Delete this story" className="rounded-full p-2 hover:bg-white/10"><Trash2 size={20} /></button>}
              <button onClick={onClose} aria-label="Close stories" className="rounded-full p-2 hover:bg-white/10"><X size={24} /></button>
            </span>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-5 pt-10">
          {story.caption && <p className="pointer-events-none text-center text-sm text-white">{story.caption}</p>}
          {note && <p role="status" className="text-center text-xs text-white/80">{note}</p>}
          {isMine ? (
            <button onClick={openSeenBy} className="flex items-center gap-2 text-sm text-white"><Eye size={18} />Seen by</button>
          ) : (
            <form onSubmit={sendReply} className="flex items-center gap-2">
              <input value={reply} onChange={(e) => setReply(e.target.value)} maxLength={500} aria-label={`Reply to ${user.username}`}
                placeholder={`Reply to ${user.username}…`} className="w-full rounded-full border border-white/50 bg-transparent px-4 py-2.5 text-sm text-white placeholder:text-white/70 outline-none focus:border-white" />
              <button disabled={!reply.trim()} aria-label="Send reply" className="p-2 text-white disabled:opacity-40"><Send size={22} /></button>
            </form>
          )}
        </div>

        {seenBy && (
          <div className="absolute inset-0 z-10 flex items-end bg-black/50" onClick={closeSeenBy}>
            <div className="max-h-[60%] w-full overflow-y-auto rounded-t-2xl bg-white p-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Seen by">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-semibold">Seen by {seenBy.length}</p>
                <button onClick={closeSeenBy} className="text-sm font-semibold text-sky-600">Done</button>
              </div>
              {!seenBy.length && <p className="text-sm text-neutral-500">No one has seen this story yet.</p>}
              <ul className="space-y-3">
                {seenBy.map((v) => (
                  <li key={v.username}><Link to={`/u/${v.username}`} onClick={onClose} className="flex items-center gap-3">
                    <Avatar src={v.avatar_url} name={v.username} size={36} /><span className="text-sm font-semibold">{v.username}</span>
                  </Link></li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {confirmDelete && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 px-6">
            <div role="dialog" aria-label="Delete story" className="w-full rounded-2xl bg-white p-5 text-center">
              <p className="font-semibold">Delete this story?</p>
              <p className="mt-1 text-sm text-neutral-500">It will disappear for everyone straight away.</p>
              <div className="mt-4 flex flex-col gap-2">
                <button onClick={deleteStory} className="rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white">Delete</button>
                <button onClick={() => setConfirmDelete(false)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
