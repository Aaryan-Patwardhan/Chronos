// GET /api/feed?surface=feed|explore — ranked posts. Only the order and the
// posts are returned; ranking traces stay on the server until /api/why asks.
import { rank, cleanWeights, type Surface } from './_lib/rank.js'
import { check, handle, hydrate, loadSignals, retrieve, userClient, HttpError } from './_lib/server.js'

export default handle(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Use GET.')
  const surface: Surface = req.query.surface === 'explore' ? 'explore' : 'feed'
  const { sb, me } = await userClient(req)

  const [signals, prefs] = await Promise.all([
    loadSignals(sb, me),
    sb.from('feed_prefs').select('weights').eq('user_id', me).maybeSingle(),
  ])
  const weights = cleanWeights(prefs.data?.weights)
  const candidates = await retrieve(sb, signals, surface)
  const { ordered, traces } = rank(candidates, signals, weights, surface)

  if (ordered.length) {
    check(await sb.from('feed_traces').upsert(
      ordered.map((c) => ({ user_id: me, post_id: c.id, surface, trace: traces.get(c.id), created_at: new Date().toISOString() })),
      { onConflict: 'user_id,post_id,surface' },
    ))
  }
  const posts = await hydrate(sb, me, ordered as never)
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ posts })
})
