import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { WifiOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/time'
import type { Profile } from '../lib/types'
import { useAuth } from '../store/auth'
import { useMessages } from '../store/messages'
import Avatar from '../components/Avatar'
import { Status } from './Feed'

export default function Messages() {
  const me = useAuth((s) => s.me)
  const { threads, people, online } = useMessages()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])

  useEffect(() => {
    const q = query.trim().replace(/[%_,()@]/g, '')
    if (!q) return setResults([])
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id, username, full_name, avatar_url, bio').ilike('username', `%${q}%`).neq('id', me?.id ?? '').limit(6)
      setResults((data ?? []) as Profile[])
    }, 250)
    return () => clearTimeout(t)
  }, [query, me])

  const list = Object.entries(threads)
    .map(([partner, msgs]) => ({ partner, last: msgs[msgs.length - 1], unread: msgs.filter((m) => m.recipient_id === me?.id && !m.seen_at).length }))
    .filter((t) => t.last)
    .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at))

  return (
    <div>
      {!online && <p className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900"><WifiOff size={16} /> You're offline. Messages will send when you reconnect.</p>}
      <div className="p-3">
        <input className="input" placeholder="Search people to message…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {results.map((u) => (
          <Link key={u.id} to={`/messages/${u.id}`} className="flex items-center gap-3 px-1 py-2 hover:bg-neutral-50">
            <Avatar src={u.avatar_url} name={u.username} size={36} /><span className="text-sm font-semibold">{u.username}</span>
          </Link>
        ))}
      </div>
      {!list.length && !query && <Status text="No messages yet. Search for someone to start a conversation." />}
      {list.map(({ partner, last, unread }) => {
        const p = people[partner]
        return (
          <Link key={partner} to={`/messages/${partner}`} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50">
            <Avatar src={p?.avatar_url} name={p?.username} size={48} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${unread ? 'font-bold' : 'font-semibold'}`}>{p?.username ?? '…'}</p>
              <p className={`truncate text-sm ${unread ? 'font-semibold text-neutral-900' : 'text-neutral-500'}`}>
                {last.sender_id === me?.id ? 'You: ' : ''}{last.body} · {timeAgo(last.created_at)}
              </p>
            </div>
            {unread > 0 && <span className="rounded-full bg-rose-500 px-2 text-xs font-semibold text-white">{unread}</span>}
          </Link>
        )
      })}
    </div>
  )
}
