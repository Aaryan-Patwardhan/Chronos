import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/time'
import type { Notification } from '../lib/types'
import { useAuth } from '../store/auth'
import { useNotifications } from '../store/notifications'
import Avatar from '../components/Avatar'
import { Status } from './Feed'

const TEXT = { like: 'liked your post.', comment: 'commented on your post.', follow: 'started following you.' }

export default function Notifications() {
  const me = useAuth((s) => s.me)
  const markAllRead = useNotifications((s) => s.markAllRead)
  const [items, setItems] = useState<Notification[] | null>(null)

  useEffect(() => {
    if (!me) return
    void supabase.from('notifications')
      .select('id, kind, post_id, read, created_at, actor:profiles!notifications_actor_id_fkey(id, username, avatar_url, full_name, bio)')
      .eq('user_id', me.id).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { setItems((data ?? []) as unknown as Notification[]); void markAllRead(me.id) })
  }, [me, markAllRead])

  if (!items) return <Status text="Loading notifications…" />
  if (!items.length) return <Status text="No notifications yet. Likes, comments and new followers will show up here." />
  return (
    <ul>
      {items.map((n) => (
        <li key={n.id} className={`flex items-center gap-3 px-4 py-3 ${n.read ? '' : 'bg-sky-50'}`}>
          <Avatar src={n.actor?.avatar_url} name={n.actor?.username} size={40} />
          <p className="flex-1 text-sm">
            <Link to={`/u/${n.actor?.username}`} className="font-semibold">{n.actor?.username}</Link> {TEXT[n.kind]}
            <span className="ml-1 text-neutral-400">{timeAgo(n.created_at)}</span>
          </p>
          {n.post_id && <Link to={`/p/${n.post_id}`} className="text-sm font-semibold text-sky-600">View</Link>}
        </li>
      ))}
    </ul>
  )
}
