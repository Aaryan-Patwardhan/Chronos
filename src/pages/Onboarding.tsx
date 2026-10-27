// Step 2 of sign-up, shown once: username (pre-filled) + 3–6 interests.
// Interests seed the first feed and pick a few accounts to follow.
import { useEffect, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { INTERESTS, suggestUsername } from '../lib/interests'
import { useAuth } from '../store/auth'
import { friendly } from '../lib/errors'

const MIN = 3
const MAX = 6
type Availability = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid'

export default function Onboarding() {
  const current = useAuth((s) => s.me)
  const [username, setUsername] = useState(() => (!current || current.username.startsWith('user_') ? suggestUsername() : current.username))
  const [picked, setPicked] = useState<string[]>([])
  const [available, setAvailable] = useState<Availability>('idle')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!/^[a-z0-9_.]{3,30}$/.test(username)) return setAvailable('invalid')
    setAvailable('checking')
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('username_available', { name: username })
      setAvailable(error ? 'idle' : data ? 'ok' : 'taken')
    }, 300)
    return () => clearTimeout(t)
  }, [username])

  const toggle = (tag: string) =>
    setPicked((p) => (p.includes(tag) ? p.filter((t) => t !== tag) : p.length >= MAX ? p : [...p, tag]))

  async function start() {
    setError('')
    setBusy(true)
    useAuth.setState({ settingUp: true })
    try {
      const { error } = await supabase.rpc('complete_onboarding', { p_username: username, p_interests: picked })
      if (error) throw error
      await useAuth.getState().loadProfile()
    } catch (e) {
      setError(friendly(e, "We couldn't finish setting up your account. Please try again."))
    } finally {
      setBusy(false)
      useAuth.setState({ settingUp: false })
    }
  }

  const ready = available === 'ok' && picked.length >= MIN && !busy
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Make it yours</h1>
      <p className="mt-1 text-sm text-neutral-500">Step 2 of 2 · two quick choices and you're in.</p>

      <label className="mt-8 block text-sm font-semibold" htmlFor="username">Your username</label>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-neutral-400">@</span>
        <input id="username" className="input" value={username} maxLength={30} autoComplete="username"
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))} />
        <span className="w-6" aria-live="polite">
          {available === 'checking' && <Loader2 size={18} className="animate-spin text-neutral-400" />}
          {available === 'ok' && <Check size={18} className="text-emerald-600" aria-label="Available" />}
          {(available === 'taken' || available === 'invalid') && <X size={18} className="text-rose-600" aria-label="Not available" />}
        </span>
      </div>
      <p className="mt-1 h-4 text-xs text-neutral-500">
        {available === 'taken' ? 'Taken — try another.' : available === 'invalid' ? '3–30 characters: letters, numbers, "." or "_".' : 'You can keep this one or change it.'}
      </p>

      <p className="mt-6 text-sm font-semibold">What are you into? <span className="font-normal text-neutral-500">Pick at least {MIN}</span></p>
      <div className="mt-3 flex flex-wrap gap-2">
        {INTERESTS.map((i) => {
          const on = picked.includes(i.tag)
          return (
            <button key={i.tag} type="button" onClick={() => toggle(i.tag)} aria-pressed={on}
              className={`rounded-full border px-4 py-2 text-sm transition ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white hover:border-neutral-500'}`}>
              {i.emoji} {i.label}
            </button>
          )
        })}
      </div>

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
      <button onClick={start} disabled={!ready} className="btn-primary mt-auto w-full py-3 text-base">
        {busy ? 'Setting up your feed…' : picked.length < MIN ? `Pick ${MIN - picked.length} more` : 'Start exploring'}
      </button>
    </div>
  )
}
