import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Edit, WifiOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/errors'
import { timeAgo } from '../lib/time'
import type { Profile } from '../lib/types'
import { useAuth } from '../store/auth'
import { useMessages } from '../store/messages'
import Avatar from '../components/Avatar'
import { Status } from './Feed'

export default function Messages() {
  const me = useAuth((s) => s.me)
  const { threads, people, online, status, sync } = useMessages()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  useEffect(() => {
    const q = query.trim().replace(/[%_,()@]/g, '')
    if (!q) { setResults([]); setSearchError(''); return }
    setSearching(true)
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, bio')
        .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
        .eq('onboarded', true)
        .neq('id', me?.id ?? '')
        .limit(8)
      setSearchError(error ? friendly(error, "Search isn't working right now. Please try again.") : '')
      setResults((data ?? []) as Profile[])
      setSearching(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query, me])

  const list = Object.entries(threads)
    .map(([partner, msgs]) => ({
      partner,
      last: msgs[msgs.length - 1],
      unread: msgs.filter((m) => m.recipient_id === me?.id && !m.seen_at).length,
    }))
    .filter((t) => t.last)
    .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at))

  return (
    <div>
      {/* Offline banner */}
      {!online && (
        <p className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          <WifiOff size={16} /> You're offline. Messages will send when you reconnect.
        </p>
      )}

      {/* Search bar */}
      <div className="border-b px-4 py-3">
        <input
          className="input"
          placeholder="Search people to message…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>

      {/* Search results */}
      {query.trim() && (
        <div className="border-b">
          {searching && (
            <p className="px-4 py-3 text-sm text-neutral-500">Searching…</p>
          )}
          {searchError && <p role="alert" className="px-4 py-3 text-sm text-rose-600">{searchError}</p>}
          {!searching && !searchError && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-neutral-500">No accounts found for "{query}".</p>
          )}
          {results.map((u) => (
            <Link
              key={u.id}
              to={`/messages/${u.id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50"
              onClick={() => setQuery('')}
            >
              <Avatar src={u.avatar_url} name={u.username} size={40} />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">{u.full_name || u.username}</p>
                <p className="text-xs text-neutral-500">@{u.username}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Thread list */}
      {!query.trim() && (
        <>
          {status === 'error' && (
            <p role="alert" className="mx-4 my-2 flex items-center justify-between gap-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {list.length ? "Couldn't refresh your messages." : "We couldn't load your messages."}
              <button className="font-semibold underline" onClick={() => void sync()}>Try again</button>
            </p>
          )}
          {!list.length && status === 'loading' && (
            <ul aria-busy="true" aria-label="Loading messages">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex animate-pulse items-center gap-3 px-4 py-3">
                  <div className="h-[50px] w-[50px] rounded-full bg-neutral-200" />
                  <div className="flex-1 space-y-2"><div className="h-3 w-28 rounded bg-neutral-200" /><div className="h-3 w-44 rounded bg-neutral-200" /></div>
                </li>
              ))}
            </ul>
          )}
          {!list.length && status === 'ready' && (
            <Status
              text="No messages yet."
              action={
                <p className="mt-1 text-sm text-neutral-400">
                  Search for someone above to start a conversation.
                </p>
              }
            />
          )}
          {list.map(({ partner, last, unread }) => {
            const p = people[partner]
            const isMe = last.sender_id === me?.id
            return (
              <Link
                key={partner}
                to={`/messages/${partner}`}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 border-b border-neutral-100 ${unread ? 'bg-sky-50/40' : ''}`}
              >
                <div className="relative shrink-0">
                  <Avatar src={p?.avatar_url} name={p?.username} size={50} />
                  {unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-rose-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`truncate text-sm ${unread ? 'font-bold text-neutral-900' : 'font-semibold'}`}>
                      {p?.full_name || p?.username || '…'}
                    </p>
                    <span className="shrink-0 text-xs text-neutral-400">{timeAgo(last.created_at)}</span>
                  </div>
                  <p className={`truncate text-sm ${unread ? 'font-semibold text-neutral-900' : 'text-neutral-500'}`}>
                    {last.failed ? <span className="text-rose-600">Not sent · </span> : isMe ? 'You: ' : ''}{last.body}
                  </p>
                </div>
                {unread > 0 && (
                  <span className="shrink-0 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </Link>
            )
          })}
        </>
      )}

      {/* New message floating hint */}
      {!query.trim() && list.length > 0 && (
        <div className="px-4 pt-4 pb-8 text-center">
          <button
            className="flex items-center gap-1.5 mx-auto text-sm text-neutral-400 hover:text-neutral-700"
            onClick={() => document.querySelector<HTMLInputElement>('.input')?.focus()}
          >
            <Edit size={14} /> Start a new conversation
          </button>
        </div>
      )}
    </div>
  )
}
