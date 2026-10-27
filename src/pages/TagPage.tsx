// /t/:tag — all posts with a topic, Top (most liked) or Recent.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Hash } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/errors'
import PostImage from '../components/PostImage'
import { Status } from './Feed'

type Tile = { id: string; image_url: string; caption: string }

export default function TagPage() {
  const { tag: raw = '' } = useParams()
  const tag = raw.toLowerCase().replace(/[^a-z0-9_]/g, '')
  const navigate = useNavigate()
  const [order, setOrder] = useState<'top' | 'recent'>('top')
  const [posts, setPosts] = useState<Tile[] | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!tag) return
    let cancelled = false
    setPosts(null); setError('')
    void (async () => {
      const [list, total] = await Promise.all([
        supabase.from('posts').select('id, image_url, caption').eq('type', 'post').contains('tags', [tag])
          .order(order === 'top' ? 'like_count' : 'created_at', { ascending: false }).limit(90),
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('type', 'post').contains('tags', [tag]),
      ])
      if (cancelled) return
      if (list.error) return setError(friendly(list.error, "We couldn't load this topic. Please try again."))
      setPosts((list.data ?? []) as Tile[])
      setCount(total.count ?? null)
    })()
    return () => { cancelled = true }
  }, [tag, order])

  if (!tag) return <Status text="That isn't a valid topic." action={<Link to="/explore" className="btn-secondary">Back to Explore</Link>} />
  const tab = (key: 'top' | 'recent', label: string) => (
    <button role="tab" aria-selected={order === key} onClick={() => setOrder(key)}
      className={`flex-1 py-3 text-sm font-semibold ${order === key ? 'border-b-2 border-neutral-900' : 'text-neutral-400'}`}>{label}</button>
  )
  return (
    <div>
      <div className="sticky top-[var(--chrome-top)] z-10 flex items-center gap-3 border-b bg-white px-4 py-3">
        <button onClick={() => navigate(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <h1 className="font-semibold">#{tag}</h1>
      </div>
      <div className="flex items-center gap-4 px-4 py-5">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-neutral-300"><Hash size={28} /></span>
        <div>
          <p className="text-lg font-semibold">#{tag}</p>
          <p className="text-sm text-neutral-500">{count === null ? ' ' : `${count} ${count === 1 ? 'post' : 'posts'}`}</p>
        </div>
      </div>
      <div className="flex border-b" role="tablist">{tab('top', 'Top')}{tab('recent', 'Recent')}</div>
      {error ? <Status text={error} />
        : !posts ? (
          <div className="grid grid-cols-3 gap-0.5" aria-busy="true">
            {Array.from({ length: 9 }, (_, i) => <div key={i} className="aspect-square animate-pulse bg-neutral-200" />)}
          </div>
        ) : !posts.length ? <Status text={`No posts with #${tag} yet. Be the first to share one.`} action={<Link to="/new" className="btn-primary">Create a post</Link>} />
        : (
          <div className="grid grid-cols-3 gap-0.5">
            {posts.map((p) => (
              <Link key={p.id} to={`/p/${p.id}`} className="aspect-square bg-neutral-100">
                <PostImage src={p.image_url} alt={p.caption || `#${tag} post`} className="h-full w-full" />
              </Link>
            ))}
          </div>
        )}
    </div>
  )
}
