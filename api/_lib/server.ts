// Server-side helpers for /api functions. Every query runs with the
// caller's own login token, so Row Level Security applies here too.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { mergeSources, type Candidate, type Signals, type Surface } from './rank.js'

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

const SESSION_EXPIRED = 'Your session has expired. Please log in again.'

/** Reads the user id from the login token without a network call. The
 *  token's signature is still verified by the database on EVERY query we
 *  make with it (and RLS applies), so a forged token gets no data. */
function readClaims(token: string): { sub?: string; exp?: number } | null {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch {
    return null
  }
}

export async function userClient(req: VercelRequest): Promise<{ sb: SupabaseClient; me: string }> {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw new HttpError(401, 'Please log in.')
  const claims = readClaims(token)
  if (!claims?.sub || !/^[0-9a-f-]{36}$/.test(claims.sub) || !claims.exp || claims.exp * 1000 < Date.now()) {
    throw new HttpError(401, SESSION_EXPIRED)
  }
  const sb = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return { sb, me: claims.sub }
}

export function handle(fn: (req: VercelRequest, res: VercelResponse) => Promise<void>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      await fn(req, res)
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      if (status === 500) console.error(e)
      res.status(status).json({ error: e instanceof HttpError ? e.message : 'Something went wrong on the server.' })
    }
  }
}

function check<T>(result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) {
    // The database rejected the token (bad signature, expired, revoked).
    if (result.error.code?.startsWith('PGRST3') || /jwt/i.test(result.error.message)) throw new HttpError(401, SESSION_EXPIRED)
    throw new Error(result.error.message)
  }
  return (result.data ?? []) as T
}

type Engagement = { post_id: string; posts: { author_id: string; tags: string[] } | null }

const add = (map: Map<string, number>, key: string, by: number) => map.set(key, (map.get(key) ?? 0) + by)

/** Everything the ranking knows about you, plus which posts you already
 *  liked/saved (reused for the like/save buttons — no extra query). */
export async function loadSignals(sb: SupabaseClient, me: string): Promise<{ signals: Signals; liked: Set<string>; saved: Set<string> }> {
  const [profile, follows, likes, saves, seeLess, reports] = await Promise.all([
    sb.from('profiles').select('interests').eq('id', me).maybeSingle(),
    sb.from('follows').select('followee_id').eq('follower_id', me),
    sb.from('likes').select('post_id, posts(author_id, tags)').eq('user_id', me).limit(500),
    sb.from('saves').select('post_id, posts(author_id, tags)').eq('user_id', me).limit(500),
    sb.from('see_less').select('post_id, posts(author_id, tags)').eq('user_id', me).limit(500),
    sb.from('reports').select('post_id').eq('user_id', me),
  ])
  const signals: Signals = {
    me,
    following: new Set(check(follows).map((f: { followee_id: string }) => f.followee_id)),
    authorAffinity: new Map(),
    tagAffinity: new Map(),
    seeLessAuthors: new Map(),
    seeLessTags: new Map(),
    hidden: new Set(check(reports).map((r: { post_id: string }) => r.post_id)),
  }
  const engage = (rows: Engagement[], by: number) => {
    for (const r of rows) {
      if (!r.posts) continue
      add(signals.authorAffinity, r.posts.author_id, by)
      for (const t of r.posts.tags ?? []) add(signals.tagAffinity, t, by)
    }
  }
  // Cold start: interests picked at onboarding count like a few likes each,
  // so a brand-new account gets a relevant feed before its first tap.
  for (const t of (profile.data?.interests as string[] | undefined) ?? []) add(signals.tagAffinity, t, 2)
  const likeRows = check(likes) as unknown as Engagement[]
  const saveRows = check(saves) as unknown as Engagement[]
  engage(likeRows, 1)
  engage(saveRows, 1.5)
  for (const r of check(seeLess) as unknown as Engagement[]) {
    signals.hidden.add(r.post_id)
    if (!r.posts) continue
    add(signals.seeLessAuthors, r.posts.author_id, 1)
    for (const t of r.posts.tags ?? []) add(signals.seeLessTags, t, 1)
  }
  return { signals, liked: new Set(likeRows.map((r) => r.post_id)), saved: new Set(saveRows.map((r) => r.post_id)) }
}

// Authors come embedded in the same query (no separate profiles lookup).
const POST_COLUMNS = 'id, author_id, image_url, caption, tags, like_count, comment_count, report_count, created_at, ' +
  'author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url)'
type PostRow = Omit<Candidate, 'sources'> & { image_url: string; caption: string; author: unknown }
type Result = { data: unknown; error: { message: string; code?: string } | null }
const empty: Result = { data: [], error: null }

/** Stage 1a: sources that don't depend on who you are — start them at once,
 *  in parallel with loading your signals. */
export function retrieveGeneral(sb: SupabaseClient): Promise<[Result, Result]> {
  const since = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString()
  return Promise.all([
    sb.from('posts').select(POST_COLUMNS).eq('type', 'post').gte('created_at', since).order('like_count', { ascending: false }).limit(100),
    sb.from('posts').select(POST_COLUMNS).eq('type', 'post').order('created_at', { ascending: false }).limit(60),
  ]) as unknown as Promise<[Result, Result]>
}

/** Stage 1b: personal sources (people you follow, topics you like), then
 *  merge everything. A post found by several sources keeps all of them. */
export async function retrievePersonal(sb: SupabaseClient, signals: Signals, surface: Surface, general: Promise<[Result, Result]>): Promise<Candidate[]> {
  const topTags = [...signals.tagAffinity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t)
  const following = [...signals.following]
  const [byFollowing, bySimilar, [byTrending, byFresh]] = await Promise.all([
    surface === 'feed' && following.length
      ? sb.from('posts').select(POST_COLUMNS).eq('type', 'post').in('author_id', following).order('created_at', { ascending: false }).limit(150)
      : Promise.resolve(empty),
    topTags.length
      ? sb.from('posts').select(POST_COLUMNS).eq('type', 'post').overlaps('tags', topTags).order('created_at', { ascending: false }).limit(150)
      : Promise.resolve(empty),
    general,
  ])
  let merged = mergeSources([
    ['following', check(byFollowing as Result) as PostRow[]],
    ['similar', check(bySimilar as Result) as PostRow[]],
    ['trending', check(byTrending) as PostRow[]],
    ['fresh', check(byFresh) as PostRow[]],
  ])
  if (surface === 'explore') merged = merged.filter((c) => !signals.following.has(c.author_id))
  return merged
}

export { check }
