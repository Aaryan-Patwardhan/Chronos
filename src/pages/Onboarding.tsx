// Sign-up steps 2 and 3, shown once: username (pre-filled) + 3–6 interests,
// then accounts that share those interests. Nothing is followed
// automatically — the user picks (or skips).
import { useEffect, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { INTERESTS, suggestUsername } from '../lib/interests'
import { useAuth } from '../store/auth'
import { friendly } from '../lib/errors'
import SuggestedAccounts from '../components/SuggestedAccounts'

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
  const [step, setStep] = useState<'basics' | 'people'>('basics')
  const [followCount, setFollowCount] = useState(0)

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

  // Saves username + interests, then shows suggestions. The app opens only
  // after "Continue", so this screen stays up for step 3.
  async function saveBasics() {
    setError('')
    setBusy(true)
    const { error } = await supabase.rpc('complete_onboarding', { p_username: username, p_interests: picked })
    setBusy(false)
    if (error) return setError(friendly(error, "We couldn't finish setting up your account. Please try again."))
    setStep('people')
  }

  async function finish() {
    useAuth.setState({ settingUp: true })
    try { await useAuth.getState().loadProfile() } finally { useAuth.setState({ settingUp: false }) }
  }

  if (step === 'people') return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 pt-10">
      <h1 className="text-2xl font-bold tracking-tight">Accounts you might like</h1>
      <p className="mt-1 text-sm text-neutral-500">Step 3 of 3 · they share your interests. Follow any you like — or skip, you can always find people in Explore.</p>
      <div className="mt-6 flex-1"><SuggestedAccounts layout="list" limit={10} onCount={setFollowCount} /></div>
      {/* Always on screen, even with a long list. */}
      <div className="sticky bottom-0 -mx-6 mt-4 border-t border-neutral-200 bg-white px-6 pb-4 pt-3">
        <button onClick={finish} className="btn-primary w-full py-3 text-base">
          {followCount ? `Continue · following ${followCount}` : 'Continue'}
        </button>
        {followCount === 0 && <button onClick={finish} className="mt-1 w-full py-2 text-sm font-semibold text-neutral-500">Skip for now</button>}
      </div>
    </div>
  )

  const ready = available === 'ok' && picked.length >= MIN && !busy
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Make it yours</h1>
      <p className="mt-1 text-sm text-neutral-500">Step 2 of 3 · two quick choices, then pick people to follow.</p>

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
      <button onClick={saveBasics} disabled={!ready} className="btn-primary mt-auto w-full py-3 text-base">
        {busy ? 'Saving…' : picked.length < MIN ? `Pick ${MIN - picked.length} more` : 'Next'}
      </button>
    </div>
  )
}
