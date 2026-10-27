// Likes, comments and new followers. Opening the page marks them read; new
// ones appear live while it's open.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/errors'
import { timeAgo } from '../lib/time'
import type { Notification } from '../lib/types'
import { useAuth } from '../store/auth'
import { useNotifications } from '../store/notifications'
import Avatar from '../components/Avatar'
import FollowButton from '../components/FollowButton'
import PostImage from '../components/PostImage'
import { Status } from './Feed'

function describe(n: Notification) {
  const what = n.post?.type === 'reel' ? 'reel' : n.post?.type === 'story' ? 'story' : 'post'
  if (n.kind === 'follow') return 'started following you.'
  return n.kind === 'like' ? `liked your ${what}.` : `commented on your ${what}.`
}

export default function Notifications() {
  const me = useAuth((s) => s.me)
  const markAllRead = useNotifications((s) => s.markAllRead)
  const arrived = useNotifications((s) => s.arrived)
  const [items, setItems] = useState<Notification[] | null>(null)
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!me) return
    setError('')
    const [list, follows] = await Promise.all([
      supabase.from('notifications')
        .select('id, kind, post_id, read, created_at, actor:profiles!notifications_actor_id_fkey(id, username, avatar_url, full_name, bio), post:posts(type, image_url)')
        .eq('user_id', me.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('follows').select('followee_id').eq('follower_id', me.id),
    ])
    if (list.error) return setError(friendly(list.error, "We couldn't load your notifications. Please try again."))
    setItems((list.data ?? []) as unknown as Notification[])
    setFollowing(new Set((follows.data ?? []).map((r) => r.followee_id)))
    void markAllRead(me.id)
  }, [me, markAllRead])

  // First load, and again whenever a new notification arrives.
  useEffect(() => { void load() }, [load, arrived])

  if (error && !items) return <Status text={error} action={<button className="btn-secondary" onClick={() => void load()}>Try again</button>} />
  if (!items) return (
    <ul aria-busy="true" aria-label="Loading notifications">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex animate-pulse items-center gap-3 px-4 py-3">
          <div className="h-10 w-10 rounded-full bg-neutral-200" /><div className="h-3 flex-1 rounded bg-neutral-200" />
        </li>
      ))}
    </ul>
  )
  if (!items.length) return <Status text="No notifications yet. Likes, comments and new followers will show up here." />
  return (
    <>
      {error && <p role="alert" className="mx-4 my-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <ul>
        {items.map((n) => (
          <li key={n.id} className={`flex items-center gap-3 px-4 py-3 ${n.read ? '' : 'bg-sky-50'}`}>
            <Link to={`/u/${n.actor?.username}`} className="shrink-0"><Avatar src={n.actor?.avatar_url} name={n.actor?.username} size={40} /></Link>
            <p className="min-w-0 flex-1 text-sm">
              <Link to={`/u/${n.actor?.username}`} className="font-semibold">{n.actor?.username}</Link> {describe(n)}
              <span className="ml-1 text-neutral-400">{timeAgo(n.created_at)}</span>
            </p>
            {n.kind === 'follow' && n.actor && (
              <FollowButton userId={n.actor.id} initial={following.has(n.actor.id)} size="sm" />
            )}
            {n.post_id && n.post && (
              <Link to={`/p/${n.post_id}`} aria-label={`Open the ${n.post.type}`} className="h-11 w-11 shrink-0 overflow-hidden rounded bg-neutral-100">
                <PostImage src={n.post.image_url} alt="" className="h-full w-full" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
