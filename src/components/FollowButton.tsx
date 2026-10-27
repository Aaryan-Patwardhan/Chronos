// Follow / Following toggle. Updates instantly, then confirms with the
// server; if the server refuses, it switches back and says why.
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/errors'
import { useAuth } from '../store/auth'

type Props = {
  userId: string
  initial: boolean
  size?: 'sm' | 'md'
  /** 'dark' sits on top of a video (Reels). */
  tone?: 'light' | 'dark'
  onChange?: (following: boolean) => void
}

export default function FollowButton({ userId, initial, size = 'md', tone = 'light', onChange }: Props) {
  const me = useAuth((s) => s.me)
  const [following, setFollowing] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!me || me.id === userId) return null

  async function toggle() {
    if (!me || busy) return
    const next = !following
    setBusy(true); setError('')
    setFollowing(next); onChange?.(next)
    const { error } = next
      ? await supabase.from('follows').insert({ follower_id: me.id, followee_id: userId })
      : await supabase.from('follows').delete().eq('follower_id', me.id).eq('followee_id', userId)
    setBusy(false)
    if (error && error.code !== '23505') {
      setFollowing(!next); onChange?.(!next)
      setError(friendly(error, next ? "We couldn't follow this account. Please try again." : "We couldn't unfollow. Please try again."))
    }
  }

  const base = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
  const look = tone === 'dark'
    ? (following ? 'bg-white/20 text-white hover:bg-white/30' : 'border border-white/80 text-white hover:bg-white/10')
    : (following ? 'border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100' : 'bg-neutral-900 text-white hover:bg-neutral-700')
  return (
    <span className="inline-flex flex-col items-stretch">
      <button
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
        className={`rounded-lg font-semibold transition disabled:opacity-60 ${base} ${look}`}
      >
        {following ? 'Following' : 'Follow'}
      </button>
      {error && <span role="alert" className={`mt-1 text-xs ${tone === 'dark' ? 'text-rose-300' : 'text-rose-600'}`}>{error}</span>}
    </span>
  )
}
