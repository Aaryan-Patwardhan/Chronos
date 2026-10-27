import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { CheckCircle2, RefreshCw } from 'lucide-react'
import { api } from '../lib/supabase'
import { friendly } from '../lib/errors'
import PostCard, { type CardPost } from '../components/PostCard'
import StoriesBar from '../components/StoriesBar'
import StoryViewer from '../components/StoryViewer'
import type { StoryUser } from '../types/stories'
import { useAuth } from '../store/auth'
import { useStories } from '../store/stories'

export default function Feed() {
  const [posts, setPosts] = useState<CardPost[] | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const me = useAuth((s) => s.me)
  const loadStories = useStories((s) => s.load)
  const [viewer, setViewer] = useState<{ list: StoryUser[]; start: number } | null>(null)
  useEffect(() => { if (me) void loadStories(me.id) }, [me, loadStories])
  // First load shows skeletons; a refresh keeps the current posts on screen
  // until the new ranking arrives (stories reload too), then scrolls to top.
  const load = useCallback((refresh = false) => {
    setError('')
    if (refresh) { setRefreshing(true); if (me) void loadStories(me.id) }
    api<{ posts: CardPost[] }>('/api/feed?surface=feed')
      .then((r) => { setPosts(r.posts); if (refresh) window.scrollTo({ top: 0, behavior: 'smooth' }) })
      .catch((e) => setError(friendly(e, "We couldn't load your feed. Please try again.")))
      .finally(() => setRefreshing(false))
  }, [me, loadStories])
  useEffect(() => load(), [load])
  const remove = useCallback((id: string) => setPosts((list) => list?.filter((x) => x.id !== id) ?? null), [])

  if (error && !posts) return <Status text={error} action={<button className="btn-secondary" onClick={() => load()}>Try again</button>} />

  return (
    <div>
      <StoriesBar onOpen={(list, start) => setViewer({ list, start })} />
      {viewer && <StoryViewer users={viewer.list} start={viewer.start} onClose={() => { setViewer(null); if (me) void loadStories(me.id) }} />}
      {refreshing && <p className="sticky top-[57px] z-10 bg-white/95 py-2 text-center text-xs text-neutral-500" role="status">Refreshing your feed…</p>}
      {error && posts && <p role="alert" className="mx-4 my-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {!posts ? (
        <FeedSkeleton />
      ) : !posts.length ? (
        <Status text="Your feed is empty. Follow people or like posts in Explore to fill it." action={<Link to="/explore" className="btn-primary">Go to Explore</Link>} />
      ) : (
        <>
          {posts.map((p) => <PostCard key={p.id} post={p} surface="feed" onHide={remove} onDeleted={remove} />)}
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <CheckCircle2 size={36} className="text-emerald-600" />
            <p className="font-semibold">You're all caught up</p>
            <p className="text-sm text-neutral-500">You've seen the best posts for you right now.</p>
            <div className="flex gap-2">
              <button className="btn-secondary flex items-center gap-2" onClick={() => load(true)} disabled={refreshing}>
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />{refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <Link to="/explore" className="btn-primary">Explore more</Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your feed">
      {[0, 1].map((i) => (
        <div key={i} className="animate-pulse border-b border-neutral-200 pb-4">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="h-8 w-8 rounded-full bg-neutral-200" />
            <div className="h-3 w-28 rounded bg-neutral-200" />
          </div>
          <div className="aspect-square w-full bg-neutral-200" />
          <div className="space-y-2 px-4 pt-3">
            <div className="h-3 w-16 rounded bg-neutral-200" />
            <div className="h-3 w-3/4 rounded bg-neutral-200" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Status({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-20 text-center text-sm text-neutral-600">
      <p>{text}</p>
      {action}
    </div>
  )
}
