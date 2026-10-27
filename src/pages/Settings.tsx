// Feed preferences are hidden here until the user opens them. Saved on the
// server (/api/prefs) and used by the next feed load.
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, supabase } from '../lib/supabase'
import { friendly } from '../lib/errors'
import { DEFAULT_WEIGHTS, type Weights } from '../lib/types'

const SLIDERS: { key: keyof Weights; label: string; hint: string }[] = [
  { key: 'following', label: 'People you follow', hint: 'More posts from accounts you follow' },
  { key: 'similar', label: 'Similar to what you like', hint: 'More posts on topics you engage with' },
  { key: 'trending', label: 'Popular right now', hint: 'More of what many people are liking' },
  { key: 'fresh', label: 'Newest first', hint: 'Prefer recent posts' },
  { key: 'like', label: 'Posts you’ll probably like', hint: 'Weight of the predicted chance you like a post' },
  { key: 'save', label: 'Posts worth saving', hint: 'Weight of the predicted chance you save a post' },
  { key: 'seeLess', label: 'Avoid what I said “see less” to', hint: 'How strongly to push those topics and accounts down' },
]

export default function Settings() {
  const [open, setOpen] = useState(false)
  const [weights, setWeights] = useState<Weights | null>(null)
  const [state, setState] = useState('')

  useEffect(() => {
    if (open && !weights) api<{ weights: Weights }>('/api/prefs').then((r) => setWeights(r.weights)).catch((e) => setState(friendly(e, "We couldn't load your preferences. Please try again.")))
  }, [open, weights])

  async function save(next: Weights) {
    setState('Saving…')
    try {
      const r = await api<{ weights: Weights }>('/api/prefs', { method: 'PUT', body: JSON.stringify({ weights: next }) })
      setWeights(r.weights)
      setState('Saved. Your feed will use these next time it loads.')
    } catch (e) {
      setState(friendly(e, "We couldn't save your preferences. Please try again."))
    }
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Settings</h1>
      <Link to="/settings/profile" className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3">
        <span><span className="block text-sm font-semibold">Edit profile</span><span className="text-xs text-neutral-500">Photo, name, username and bio</span></span>
        <span className="text-sm text-neutral-500">Open</span>
      </Link>
      <section className="rounded-xl border border-neutral-200">
        <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left">
          <span><span className="block text-sm font-semibold">Feed preferences</span><span className="text-xs text-neutral-500">Choose what your feed puts first</span></span>
          <span className="text-sm text-neutral-500">{open ? 'Hide' : 'Open'}</span>
        </button>
        {open && (
          <div className="space-y-4 border-t px-4 py-4">
            {!weights ? <p className="text-sm text-neutral-500">{state || 'Loading…'}</p> : <>
              {SLIDERS.map((s) => (
                <label key={s.key} className="block">
                  <span className="flex justify-between text-sm"><span className="font-medium">{s.label}</span><span className="text-neutral-500">{weights[s.key].toFixed(1)}</span></span>
                  <input type="range" min={0} max={3} step={0.1} value={weights[s.key]} className="w-full accent-neutral-900"
                    onChange={(e) => setWeights({ ...weights, [s.key]: Number(e.target.value) })} />
                  <span className="text-xs text-neutral-500">{s.hint}</span>
                </label>
              ))}
              <div className="flex gap-2">
                <button className="btn-primary flex-1" onClick={() => save(weights)}>Save preferences</button>
                <button className="btn-secondary" onClick={() => save(DEFAULT_WEIGHTS)}>Reset</button>
              </div>
              {state && <p className="text-sm text-neutral-600">{state}</p>}
            </>}
          </div>
        )}
      </section>
      <button className="btn-secondary w-full" onClick={() => supabase.auth.signOut()}>Log out</button>
    </div>
  )
}

