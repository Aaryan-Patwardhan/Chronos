// GET /api/why?post=<id>&surface=feed|explore — the ranking trace for one
// post, only when the user asks "Why am I seeing this?".
import { handle, userClient, HttpError } from './_lib/server.js'

export default handle(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Use GET.')
  const post = String(req.query.post ?? '')
  const surface = req.query.surface === 'explore' ? 'explore' : 'feed'
  if (!/^[0-9a-f-]{36}$/.test(post)) throw new HttpError(400, 'Unknown post.')
  const { sb, me } = await userClient(req)
  const { data, error } = await sb.from('feed_traces').select('trace, created_at')
    .eq('user_id', me).eq('post_id', post).eq('surface', surface).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new HttpError(404, 'No explanation yet — this post was not ranked for you here. Refresh the feed and try again.')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json(data)
})
