// /p/:id/likes — who liked a post, newest first, with follow buttons.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { useAuth } from '../store/auth'
import Avatar from '../components/Avatar'
import FollowButton from '../components/FollowButton'
import { Status } from './Feed'

export default function LikesList() {
  const { id = '' } = useParams()
  const me = useAuth((s) => s.me)
  const navigate = useNavigate()
  const [people, setPeople] = useState<Profile[] | null>(null)
  const [iFollow, setIFollow] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!me) return
    let cancelled = false
    void (async () => {
      const [{ data }, mine] = await Promise.all([
        supabase.from('likes').select('who:profiles!likes_user_id_fkey(id, username, full_name, avatar_url, bio)')
          .eq('post_id', id).order('created_at', { ascending: false }).limit(300),
        supabase.from('follows').select('followee_id').eq('follower_id', me.id),
      ])
      if (cancelled) return
      setPeople(((data ?? []) as unknown as { who: Profile }[]).map((r) => r.who).filter(Boolean))
      setIFollow(new Set((mine.data ?? []).map((r) => r.followee_id)))
    })()
    return () => { cancelled = true }
  }, [id, me])

  return (
    <div>
      <div className="sticky top-[57px] z-10 flex items-center gap-3 border-b bg-white px-4 py-3">
        <button onClick={() => navigate(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <h1 className="font-semibold">Likes</h1>
      </div>
      {!people ? <Status text="Loading…" />
        : !people.length ? <Status text="No likes yet." action={<Link to={`/p/${id}`} className="btn-secondary">Back to the post</Link>} />
        : (
          <ul>
            {people.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <Link to={`/u/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar src={p.avatar_url} name={p.username} size={44} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{p.username}</span>
                    <span className="block truncate text-xs text-neutral-500">{p.full_name !== p.username ? p.full_name : p.bio}</span>
                  </span>
                </Link>
                <FollowButton userId={p.id} initial={iFollow.has(p.id)} size="sm" />
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
