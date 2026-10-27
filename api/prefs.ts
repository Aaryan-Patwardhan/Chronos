// GET/PUT /api/prefs — the user's feed weights (Settings → Feed preferences).
import { cleanWeights } from './_lib/rank.js'
import { check, handle, userClient, HttpError } from './_lib/server.js'

export default handle(async (req, res) => {
  const { sb, me } = await userClient(req)
  if (req.method === 'GET') {
    const { data } = await sb.from('feed_prefs').select('weights').eq('user_id', me).maybeSingle()
    res.status(200).json({ weights: cleanWeights(data?.weights) })
    return
  }
  if (req.method === 'PUT') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}
    const weights = cleanWeights(body.weights)
    check(await sb.from('feed_prefs').upsert({ user_id: me, weights, updated_at: new Date().toISOString() }))
    res.status(200).json({ weights })
    return
  }
  throw new HttpError(405, 'Use GET or PUT.')
})
