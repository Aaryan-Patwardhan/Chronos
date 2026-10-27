// "Why am I seeing this?" — fetched from the server only when the user asks.
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../lib/supabase'
import { friendly } from '../lib/errors'
import type { Trace } from '../lib/types'

const SOURCE_TEXT: Record<string, string> = {
  following: 'You follow this account',
  similar: 'Matches topics you picked or engage with',
  trending: 'Popular in the last few days',
  fresh: 'Recently posted',
}
const pct = (n: number) => `${Math.round(n * 100)}%`

export default function WhyModal({ postId, surface, onClose }: { postId: string; surface: 'feed' | 'explore'; onClose: () => void }) {
  const [trace, setTrace] = useState<Trace | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ trace: Trace }>(`/api/why?post=${postId}&surface=${surface}`)
      .then((r) => setTrace(r.trace))
      .catch((e) => setError(friendly(e, "We couldn't load the explanation. Please try again.")))
  }, [postId, surface])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Why am I seeing this post?">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Why you're seeing this post</h2>
          <button onClick={onClose} aria-label="Close" className="p-1"><X size={20} /></button>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {!trace && !error && <p className="text-sm text-neutral-500">Loading explanation…</p>}
        {trace && (
          <div className="space-y-4 text-sm">
            <section>
              <h3 className="font-semibold">1 · Where it came from</h3>
              <ul className="mt-1 list-disc pl-5 text-neutral-700">
                {trace.sources.map((s) => <li key={s}>{SOURCE_TEXT[s] ?? s}</li>)}
              </ul>
            </section>
            <section>
              <h3 className="font-semibold">2 · First filter</h3>
              <p className="text-neutral-700">Kept in the top {trace.firstStage.kept} of {trace.firstStage.of} candidate posts.</p>
            </section>
            <section>
              <h3 className="font-semibold">3 · What we predicted</h3>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {([['You like it', trace.predictions.like], ['You save it', trace.predictions.save], ['You comment', trace.predictions.comment], ['You say "see less"', trace.predictions.seeLess]] as const).map(([label, v]) => (
                  <div key={label} className="rounded-lg bg-neutral-100 px-3 py-2">
                    <div className="text-xs text-neutral-500">{label}</div>
                    <div className="font-semibold">{pct(v)}</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                Based on: your interest in this account {pct(trace.features.authorAffinity)}, in its topics {pct(trace.features.tagAffinity)},
                popularity {pct(trace.features.popularity)}, posted {trace.features.ageHours}h ago{trace.features.following ? ', you follow them' : ''}.
              </p>
            </section>
            <section>
              <h3 className="font-semibold">4 · Final order</h3>
              <p className="text-neutral-700">Score {trace.value.toFixed(2)} · ranked #{trace.scoreRank} by score, shown at #{trace.finalPosition}.</p>
              {trace.rules.length > 0
                ? <ul className="mt-1 list-disc pl-5 text-neutral-700">{trace.rules.map((r) => <li key={r}>{r}</li>)}</ul>
                : <p className="text-neutral-500">No rules changed its position.</p>}
            </section>
            <p className="border-t pt-3 text-xs text-neutral-500">
              Chronos ranks posts on the server in four stages, modelled on Instagram's Explore system. You can change what matters to you in Settings → Feed preferences.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
