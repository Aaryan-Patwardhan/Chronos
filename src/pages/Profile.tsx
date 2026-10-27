import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Bookmark, Grid3x3, Share2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Profile as P } from '../lib/types'
import { useAuth } from '../store/auth'
import Avatar from '../components/Avatar'
import FollowButton from '../components/FollowButton'
import PostImage from '../components/PostImage'
import { Status } from './Feed'

type Tile = { id: string; image_url: string; caption: string }

export default function Profile() {
  const { username = '' } = useParams()
  const me = useAuth((s) => s.me)
  const navigate = useNavigate()
  const [user, setUser] = useState<P | null | undefined>(undefined)
  const [posts, setPosts] = useState<Tile[]>([])
  const [counts, setCounts] = useState({ followers: 0, following: 0 })
  const [iFollow, setIFollow] = useState(false)
  const [note, setNote] = useState('')
  const [tab, setTab] = useState<'posts' | 'saved'>('posts')
  const [saved, setSaved] = useState<Tile[] | null>(null)

  useEffect(() => {
    if (!me) return
    let cancelled = false
    setUser(undefined)
    setTab('posts'); setSaved(null)
    void (async () => {
      const { data } = await supabase.from('profiles').select('*').eq('username', username.toLowerCase()).maybeSingle()
      if (cancelled) return
      if (!data) return setUser(null)
      const [list, followers, following, mine] = await Promise.all([
        supabase.from('posts').select('id, image_url, caption').eq('author_id', data.id).eq('type', 'post').order('created_at', { ascending: false }),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', data.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', data.id),
        supabase.from('follows').select('followee_id').eq('follower_id', me.id).eq('followee_id', data.id),
      ])
      if (cancelled) return
      setUser(data as P)
      setPosts((list.data ?? []) as Tile[])
      setCounts({ followers: followers.count ?? 0, following: following.count ?? 0 })
      setIFollow(!!mine.data?.length)
    })()
    return () => { cancelled = true }
  }, [username, me])

  // Saved posts are private: only loaded on your own profile, and RLS only
  // ever returns your own saves.
  async function openSaved() {
    setTab('saved')
    if (saved || !me) return
    const { data } = await supabase.from('saves').select('post:posts(id, image_url, caption)')
      .eq('user_id', me.id).order('created_at', { ascending: false }).limit(300)
    setSaved(((data ?? []) as unknown as { post: Tile | null }[]).map((r) => r.post).filter((p): p is Tile => !!p))
  }

  async function share() {
    const url = `${location.origin}/u/${user?.username}`
    try { await navigator.clipboard.writeText(url); setNote('Profile link copied.') } catch { setNote(url) }
    setTimeout(() => setNote(''), 2500)
  }

  if (user === undefined) return <Status text="Loading profile…" />
  if (user === null) return <Status text={`There's no account called @${username}.`} action={<Link to="/explore" className="btn-secondary">Find people</Link>} />
  const isMe = me?.id === user.id
  const showName = user.full_name && user.full_name !== user.username

  return (
    <div>
      <div className="flex items-center gap-6 px-4 pt-6">
        <Avatar src={user.avatar_url} name={user.username} size={84} />
        <div className="flex flex-1 justify-around text-center text-sm">
          <div><p className="text-lg font-semibold">{posts.length}</p>posts</div>
          <Link to={`/u/${user.username}/followers`} className="hover:opacity-70"><p className="text-lg font-semibold">{counts.followers}</p>followers</Link>
          <Link to={`/u/${user.username}/following`} className="hover:opacity-70"><p className="text-lg font-semibold">{counts.following}</p>following</Link>
        </div>
      </div>

      <div className="px-4 pt-3 text-sm">
        <h1 className="font-semibold">{showName ? user.full_name : `@${user.username}`}</h1>
        {showName && <p className="text-neutral-500">@{user.username}</p>}
        {user.bio && <p className="mt-1 whitespace-pre-line">{user.bio}</p>}
        {isMe && !user.bio && <Link to="/settings/profile" className="mt-1 inline-block text-neutral-500 hover:underline">+ Add a bio</Link>}
      </div>

      <div className="flex gap-2 px-4 py-4">
        {isMe ? (
          <>
            <Link to="/settings/profile" className="btn-secondary flex-1 text-center">Edit profile</Link>
            <button onClick={share} className="btn-secondary flex flex-1 items-center justify-center gap-2"><Share2 size={16} />Share profile</button>
          </>
        ) : (
          <>
            <div className="flex-1 [&>span]:w-full [&_button]:w-full">
              <FollowButton key={`${user.id}-${iFollow}`} userId={user.id} initial={iFollow}
                onChange={(f) => setCounts((c) => ({ ...c, followers: c.followers + (f ? 1 : -1) }))} />
            </div>
            <button onClick={() => navigate(`/messages/${user.id}`)} className="btn-secondary flex-1">Message</button>
          </>
        )}
      </div>
      {note && <p className="mx-4 mb-3 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700">{note}</p>}

      {isMe && (
        <div className="flex border-t border-neutral-200" role="tablist">
          <button role="tab" aria-selected={tab === 'posts'} onClick={() => setTab('posts')}
            className={`flex flex-1 items-center justify-center gap-2 py-3 text-xs font-semibold ${tab === 'posts' ? 'border-t-2 border-neutral-900 text-neutral-900' : 'text-neutral-400'}`}>
            <Grid3x3 size={16} />POSTS
          </button>
          <button role="tab" aria-selected={tab === 'saved'} onClick={openSaved}
            className={`flex flex-1 items-center justify-center gap-2 py-3 text-xs font-semibold ${tab === 'saved' ? 'border-t-2 border-neutral-900 text-neutral-900' : 'text-neutral-400'}`}>
            <Bookmark size={16} />SAVED
          </button>
        </div>
      )}
      {tab === 'saved' ? (
        !saved ? <Status text="Loading saved posts…" />
          : !saved.length ? <Status text="Nothing saved yet. Tap the bookmark on any post to save it here. Only you can see your saved posts." />
          : (
            <>
              <p className="px-4 py-2 text-xs text-neutral-500">Only you can see what you've saved.</p>
              <div className="grid grid-cols-3 gap-0.5">
                {saved.map((p) => (
                  <Link key={p.id} to={`/p/${p.id}`} className="aspect-square bg-neutral-100">
                    <PostImage src={p.image_url} alt={p.caption || 'Saved post'} className="h-full w-full" />
                  </Link>
                ))}
              </div>
            </>
          )
      ) : posts.length ? (
        <div className="grid grid-cols-3 gap-0.5">
          {posts.map((p) => (
            <Link key={p.id} to={`/p/${p.id}`} className="aspect-square bg-neutral-100">
              <PostImage src={p.image_url} alt={p.caption || 'Post'} className="h-full w-full" />
            </Link>
          ))}
        </div>
      ) : <Status text={isMe ? 'Share your first post.' : 'No posts yet.'} action={isMe ? <Link to="/new" className="btn-primary">Create a post</Link> : undefined} />}
    </div>
  )
}
