// Accounts that share your interests — you choose whom to follow (nothing
// is followed automatically). A list in onboarding, a row of cards in Explore.
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/errors'
import { INTERESTS } from '../lib/interests'
import Avatar from './Avatar'
import FollowButton from './FollowButton'

export type Suggestion = {
  id: string
  username: string
  full_name: string
  avatar_url: string
  bio: string
  shared: string[]
  followers: number
}

const label = (tag: string) => {
  const i = INTERESTS.find((x) => x.tag === tag)
  return i ? `${i.emoji} ${i.label}` : `#${tag}`
}

type Props = {
  layout: 'list' | 'row'
  limit?: number
  /** Called with the number of accounts followed so far. */
  onCount?: (n: number) => void
}

export default function SuggestedAccounts({ layout, limit = 12, onCount }: Props) {
  const [list, setList] = useState<Suggestion[] | null>(null)
  const [error, setError] = useState('')
  const [followed, setFollowed] = useState<Set<string>>(new Set())

  useEffect(() => {
    void supabase.rpc('suggested_accounts', { p_limit: limit }).then(({ data, error }) => {
      if (error) { setError(friendly(error, "We couldn't load suggestions right now.")); setList([]) }
      else setList((data ?? []) as Suggestion[])
    })
  }, [limit])

  function changed(id: string, on: boolean) {
    setFollowed((s) => {
      const next = new Set(s)
      if (on) next.add(id); else next.delete(id)
      onCount?.(next.size)
      return next
    })
  }

  if (layout === 'row') {
    if (!list?.length) return null
    return (
      <section aria-label="Suggested for you" className="border-b border-neutral-200 py-3">
        <h2 className="px-4 pb-2 text-sm font-semibold">Suggested for you</h2>
        <ul className="no-scrollbar flex gap-3 overflow-x-auto px-4">
          {list.map((u) => (
            <li key={u.id} className="flex w-36 shrink-0 flex-col items-center gap-1 rounded-xl border border-neutral-200 p-3 text-center">
              <Link to={`/u/${u.username}`} className="flex flex-col items-center gap-1">
                <Avatar src={u.avatar_url} name={u.username} size={56} />
                <span className="w-32 truncate text-sm font-semibold">{u.username}</span>
              </Link>
              <span className="w-32 truncate text-xs text-neutral-500">Into {u.shared.map(label).join(', ')}</span>
              <span className="mt-1"><FollowButton userId={u.id} initial={false} size="sm" onChange={(on) => changed(u.id, on)} /></span>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  if (!list) return (
    <ul className="space-y-3" aria-busy="true" aria-label="Loading suggestions">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex animate-pulse items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-neutral-200" />
          <div className="flex-1 space-y-2"><div className="h-3 w-28 rounded bg-neutral-200" /><div className="h-3 w-40 rounded bg-neutral-200" /></div>
        </li>
      ))}
    </ul>
  )
  if (error) return <p role="alert" className="text-sm text-rose-600">{error}</p>
  if (!list.length) return <p className="text-sm text-neutral-500">No suggestions yet — you can find people any time in Explore.</p>
  return (
    <ul className="space-y-3">
      {list.map((u) => (
        <li key={u.id} className="flex items-center gap-3">
          <Avatar src={u.avatar_url} name={u.username} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{u.username}</p>
            <p className="truncate text-xs text-neutral-500">
              {u.full_name && u.full_name !== u.username ? `${u.full_name} · ` : ''}{u.followers} {u.followers === 1 ? 'follower' : 'followers'}
            </p>
            <p className="mt-1 flex flex-wrap gap-1">
              {u.shared.map((t) => <span key={t} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700">{label(t)}</span>)}
            </p>
          </div>
          <FollowButton userId={u.id} initial={followed.has(u.id)} size="sm" onChange={(on) => changed(u.id, on)} />
        </li>
      ))}
    </ul>
  )
}
