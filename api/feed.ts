// GET /api/feed?surface=feed|explore — ranked posts. Only the order and the
// posts are returned; ranking traces stay on the server until /api/why asks.
// Two network steps: (signals ∥ general sources) → personal sources. The
// traces are saved after the response is sent (waitUntil on Vercel).
import { waitUntil } from '@vercel/functions'
import { rank, cleanWeights, type Surface } from './_lib/rank.js'
import { check, handle, loadSignals, retrieveGeneral, retrievePersonal, userClient, HttpError } from './_lib/server.js'

type Ranked = { id: string; report_count?: number; sources?: unknown }

export default handle(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Use GET.')
  const surface: Surface = req.query.surface === 'explore' ? 'explore' : 'feed'
  const { sb, me } = await userClient(req)

  const general = retrieveGeneral(sb)
  const [{ signals, liked, saved }, prefs] = await Promise.all([
    loadSignals(sb, me),
    sb.from('feed_prefs').select('weights').eq('user_id', me).maybeSingle(),
  ])
  if (prefs.error) check(prefs)
  const weights = cleanWeights((prefs.data as { weights?: unknown } | null)?.weights)
  const candidates = await retrievePersonal(sb, signals, surface, general)
  const { ordered, traces } = rank(candidates, signals, weights, surface)

  if (ordered.length) {
    const now = new Date().toISOString()
    const write = Promise.resolve(sb.from('feed_traces').upsert(
      ordered.map((c) => ({ user_id: me, post_id: c.id, surface, trace: traces.get(c.id), created_at: now })),
      { onConflict: 'user_id,post_id,surface' },
    )).then(({ error }) => { if (error) console.error('feed_traces write failed:', error.message) })
    waitUntil(write)
  }

  // Never send ranking internals (sources, report counts) to the browser.
  const posts = (ordered as Ranked[]).map(({ report_count: _r, sources: _s, ...p }) => ({
    ...p, liked: liked.has(p.id), saved: saved.has(p.id),
  }))
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ posts })
})
