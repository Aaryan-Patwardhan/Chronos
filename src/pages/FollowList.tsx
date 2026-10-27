// /u/:username/followers and /u/:username/following
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { useAuth } from '../store/auth'
import Avatar from '../components/Avatar'
import FollowButton from '../components/FollowButton'
import { Status } from './Feed'

export default function FollowList({ kind }: { kind: 'followers' | 'following' }) {
  const { username = '' } = useParams()
  const me = useAuth((s) => s.me)
  const [people, setPeople] = useState<Profile[] | null>(null)
  const [iFollow, setIFollow] = useState<Set<string>>(new Set())
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!me) return
    let cancelled = false
    setPeople(null)
    void (async () => {
      const { data: owner } = await supabase.from('profiles').select('id').eq('username', username.toLowerCase()).maybeSingle()
      if (cancelled) return
      if (!owner) return setMissing(true)
      const query = kind === 'followers'
        ? supabase.from('follows').select('who:profiles!follows_follower_id_fkey(id, username, full_name, avatar_url, bio)').eq('followee_id', owner.id)
        : supabase.from('follows').select('who:profiles!follows_followee_id_fkey(id, username, full_name, avatar_url, bio)').eq('follower_id', owner.id)
      const [{ data }, mine] = await Promise.all([
        query.order('created_at', { ascending: false }).limit(200),
        supabase.from('follows').select('followee_id').eq('follower_id', me.id),
      ])
      if (cancelled) return
      setPeople(((data ?? []) as unknown as { who: Profile }[]).map((r) => r.who).filter(Boolean))
      setIFollow(new Set((mine.data ?? []).map((r) => r.followee_id)))
    })()
    return () => { cancelled = true }
  }, [username, kind, me])

  const title = kind === 'followers' ? 'Followers' : 'Following'
  return (
    <div>
      <div className="sticky top-[57px] z-10 flex items-center gap-3 border-b bg-white px-4 py-3">
        <Link to={`/u/${username}`} aria-label="Back to profile"><ArrowLeft size={22} /></Link>
        <h1 className="font-semibold">{title} <span className="font-normal text-neutral-500">· @{username}</span></h1>
      </div>
      {missing ? <Status text={`There's no account called @${username}.`} />
        : !people ? <Status text="Loading…" />
        : !people.length ? <Status text={kind === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'} action={<Link to="/explore" className="btn-secondary">Find people</Link>} />
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
