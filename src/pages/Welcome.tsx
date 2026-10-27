// Welcome → Create account (email + password) or Log in. After sign-up the
// app shows Onboarding (username + interests) once, then the feed.
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/errors'

type View = 'home' | 'signup' | 'login'

export default function Welcome() {
  const [view, setView] = useState<View>('home')
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // Logged-out visitors always start at "/", so the next person to log in
  // lands on their own home feed, not the page the last user left open.
  useEffect(() => { if (pathname !== '/') navigate('/', { replace: true }) }, [pathname, navigate])
  if (view !== 'home') return <AccountForm mode={view} onSwitch={setView} />
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-between px-6 py-12">
      <div className="pt-16 text-center">
        <h1 className="text-5xl font-bold tracking-tight">Chronos</h1>
        <p className="mt-3 text-lg text-neutral-600">Connect. Create. Discover.</p>
        <ul className="mx-auto mt-10 max-w-xs space-y-3 text-left text-sm text-neutral-700">
          <li>📸 Share photos with the people you follow</li>
          <li>🧭 A feed built around what you're into</li>
          <li>💬 Chat in real time, even on a patchy connection</li>
        </ul>
      </div>
      <div className="space-y-3">
        <button onClick={() => setView('signup')} className="btn-primary w-full py-3 text-base">Create account</button>
        <button onClick={() => setView('login')} className="btn-secondary w-full py-3 text-base">Log in</button>
        <p className="text-center text-xs text-neutral-500">Sign up takes under a minute.</p>
      </div>
    </div>
  )
}

function AccountForm({ mode, onSwitch }: { mode: 'signup' | 'login'; onSwitch: (v: View) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const signup = mode === 'signup'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setInfo('')
    setBusy(true)
    const clean = email.trim().toLowerCase()
    if (signup) {
      const { data, error } = await supabase.auth.signUp({ email: clean, password })
      setBusy(false)
      if (error) return setError(friendly(error, "We couldn't create your account. Please try again."))
      // An existing email can come back without an error but with no identities.
      if (data.user && data.user.identities?.length === 0) return setError('This email already has an account. Try logging in.')
      if (!data.session) setInfo('Check your inbox to confirm your email, then log in.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: clean, password })
      setBusy(false)
      if (error) setError(friendly(error, "We couldn't log you in. Please try again."))
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto flex min-h-screen max-w-md flex-col gap-3 px-6 py-10">
      <button type="button" onClick={() => onSwitch('home')} className="mb-4 self-start text-sm text-neutral-500">← Back</button>
      <h1 className="text-2xl font-bold tracking-tight">{signup ? 'Create your account' : 'Welcome back'}</h1>
      <p className="text-sm text-neutral-500">{signup ? 'Step 1 of 2 · then pick a username and your interests.' : 'Log in with your email and password.'}</p>
      <label className="mt-4 text-sm font-medium" htmlFor="email">Email</label>
      <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" inputMode="email" />
      <label className="text-sm font-medium" htmlFor="password">Password</label>
      <div className="relative">
        <input id="password" className="input pr-10" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
          required minLength={6} autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? 'At least 6 characters' : ''} />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && (
        <p className="text-sm text-rose-600">
          {error}{' '}
          {signup && error.includes('logging in') && <button type="button" className="font-semibold underline" onClick={() => onSwitch('login')}>Log in</button>}
        </p>
      )}
      {info && <p className="text-sm text-emerald-700">{info}</p>}
      <button disabled={busy} className="btn-primary mt-2 w-full py-3 text-base">{busy ? 'Please wait…' : signup ? 'Continue' : 'Log in'}</button>
      <button type="button" onClick={() => onSwitch(signup ? 'login' : 'signup')} className="text-sm text-neutral-600 hover:underline">
        {signup ? 'Already have an account? Log in' : 'New to Chronos? Create an account'}
      </button>
    </form>
  )
}
