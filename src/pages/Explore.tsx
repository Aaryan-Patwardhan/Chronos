import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Search } from 'lucide-react'
import { api, supabase } from '../lib/supabase'
import { friendly } from '../lib/errors'
import type { Profile } from '../lib/types'
import type { CardPost } from '../components/PostCard'
import Avatar from '../components/Avatar'
import PostImage from '../components/PostImage'
import { Status } from './Feed'

export default function Explore() {
  const [posts, setPosts] = useState<CardPost[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<Profile[]>([])
  const [tagPosts, setTagPosts] = useState<CardPost[] | null>(null)

  useEffect(() => {
    api<{ posts: CardPost[] }>('/api/feed?surface=explore').then((r) => setPosts(r.posts)).catch((e) => setError(friendly(e, "We couldn't load Explore. Please try again.")))
  }, [])

  useEffect(() => {
    const q = query.trim().toLowerCase().replace(/^[#@]/, '')
    if (!q) { setPeople([]); setTagPosts(null); return }
    const t = setTimeout(async () => {
      const safe = q.replace(/[%_,()]/g, '')
      const [users, tagged] = await Promise.all([
        supabase.from('profiles').select('id, username, full_name, avatar_url, bio').or(`username.ilike.%${safe}%,full_name.ilike.%${safe}%`).limit(8),
        supabase.from('posts').select('id, author_id, image_url, caption, tags, like_count, comment_count, created_at').eq('type', 'post').contains('tags', [safe]).order('like_count', { ascending: false }).limit(30),
      ])
      setPeople((users.data ?? []) as Profile[])
      setTagPosts(((tagged.data ?? []) as CardPost[]))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const grid = (list: CardPost[], fromExplore: boolean) => (
    <div className="grid grid-cols-3 gap-0.5">
      {list.map((p) => (
        <Link key={p.id} to={`/p/${p.id}${fromExplore ? '?from=explore' : ''}`} className="aspect-square bg-neutral-100">
          <PostImage src={p.image_url} alt={p.caption || 'Post'} className="h-full w-full" />
        </Link>
      ))}
    </div>
  )

  return (
    <div>
      <div className="sticky top-[57px] z-10 bg-white p-3">
        <label className="flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2">
          <Search size={18} className="text-neutral-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people or #tags" className="w-full bg-transparent text-sm outline-none" />
        </label>
      </div>
      {query.trim() ? (
        <div>
          {people.map((u) => (
            <Link key={u.id} to={`/u/${u.username}`} className="flex items-center gap-3 px-4 py-2 hover:bg-neutral-50">
              <Avatar src={u.avatar_url} name={u.username} size={40} />
              <div><p className="text-sm font-semibold">{u.username}</p><p className="text-xs text-neutral-500">{u.full_name}</p></div>
            </Link>
          ))}
          {tagPosts && tagPosts.length > 0 && <><p className="px-4 pb-2 pt-4 text-sm font-semibold">#{query.trim().replace(/^#/, '').toLowerCase()}</p>{grid(tagPosts, false)}</>}
          {!people.length && !tagPosts?.length && <Status text="No people or tags found." />}
        </div>
      ) : error ? <Status text={error} /> : !posts ? <Status text="Finding posts for you…" /> : grid(posts, true)}
    </div>
  )
}
