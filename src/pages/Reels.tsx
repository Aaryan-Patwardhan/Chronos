// Reels: full-screen short videos, ranked on the server by the same
// 4-stage pipeline as the feed (surface=reels). Swipe or scroll to move on;
// only the reel on screen plays, and the next one loads ahead of time.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Clapperboard, RefreshCw } from 'lucide-react'
import { api, supabase } from '../lib/supabase'
import { friendly } from '../lib/errors'
import type { CardPost } from '../components/PostCard'
import ReelItem from '../components/ReelItem'
import { useAuth } from '../store/auth'

export default function Reels() {
  const me = useAuth((s) => s.me)
  const [reels, setReels] = useState<CardPost[] | null>(null)
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)
  const [muted, setMuted] = useState(true)
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const scroller = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    setError('')
    api<{ posts: CardPost[] }>('/api/feed?surface=reels')
      .then((r) => { setReels(r.posts); setActive(0); scroller.current?.scrollTo({ top: 0 }) })
      .catch((e) => setError(friendly(e, "We couldn't load Reels. Please try again.")))
  }, [])

  useEffect(() => {
    load()
    if (me) void supabase.from('follows').select('followee_id').eq('follower_id', me.id)
      .then(({ data }) => setFollowing(new Set((data ?? []).map((r) => r.followee_id))))
  }, [load, me])

  // The reel that fills most of the screen is the active one.
  useEffect(() => {
    const root = scroller.current
    if (!root || !reels?.length) return
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index))
    }, { root, threshold: 0.6 })
    root.querySelectorAll('[data-index]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [reels])

  // Keyboard: ↑/↓ (or K/J) move between reels, M toggles sound.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const root = scroller.current
      if (!root || (e.target as HTMLElement).closest('input, textarea, [role="dialog"], [role="menu"]')) return
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); root.scrollBy({ top: root.clientHeight, behavior: 'smooth' }) }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); root.scrollBy({ top: -root.clientHeight, behavior: 'smooth' }) }
      else if (e.key === 'm') setMuted((m) => !m)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onFollow = useCallback((id: string, on: boolean) => setFollowing((s) => {
    const next = new Set(s)
    if (on) next.add(id); else next.delete(id)
    return next
  }), [])
  const onGone = useCallback((id: string) => setReels((list) => list?.filter((r) => r.id !== id) ?? null), [])

  return (
    // Fills the space between the top bar and the bottom tabs.
    <div className="relative -mb-20 h-[calc(100dvh-var(--chrome-top)-var(--chrome-bottom))] bg-black">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-3 text-white">
        <h1 className="text-lg font-semibold [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">Reels</h1>
        <Link to="/reels/new" className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-sm font-semibold">
          <Clapperboard size={16} /> New reel
        </Link>
      </div>

      {error && !reels ? (
        <Message text={error} action={<button className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900" onClick={load}>Try again</button>} />
      ) : !reels ? (
        <div className="flex h-full items-center justify-center" aria-busy="true" aria-label="Loading Reels">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      ) : !reels.length ? (
        <Message text="No reels yet. Be the first to share one." action={<Link to="/reels/new" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900">Create a reel</Link>} />
      ) : (
        <div ref={scroller} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain">
          {reels.map((r, i) => (
            <div key={r.id} data-index={i} className="h-full">
              <ReelItem reel={r} active={i === active} warm={Math.abs(i - active) === 1} muted={muted} onMute={setMuted}
                following={following.has(r.author_id)} onFollow={onFollow} onGone={onGone} />
            </div>
          ))}
          <div data-index={reels.length} className="flex h-full snap-start flex-col items-center justify-center gap-3 px-6 text-center text-white">
            <p className="text-lg font-semibold">You're all caught up</p>
            <p className="text-sm text-white/70">You've seen the best reels for you right now.</p>
            <div className="flex gap-2">
              <button className="flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold" onClick={load}><RefreshCw size={16} /> Refresh</button>
              <Link to="/reels/new" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900">Create a reel</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Message({ text, action }: { text: string; action: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-sm text-white">
      <p>{text}</p>
      {action}
    </div>
  )
}
