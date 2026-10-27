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

export async function userClient(req: VercelRequest): Promise<{ sb: SupabaseClient; me: string }> {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw new HttpError(401, 'Please log in.')
  const sb = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Please log in again.')
  return { sb, me: data.user.id }
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

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return (result.data ?? []) as T
}

type Engagement = { post_id: string; posts: { author_id: string; tags: string[] } | null }

const add = (map: Map<string, number>, key: string, by: number) => map.set(key, (map.get(key) ?? 0) + by)

export async function loadSignals(sb: SupabaseClient, me: string): Promise<Signals> {
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
  engage(check(likes) as unknown as Engagement[], 1)
  engage(check(saves) as unknown as Engagement[], 1.5)
  for (const r of check(seeLess) as unknown as Engagement[]) {
    signals.hidden.add(r.post_id)
    if (!r.posts) continue
    add(signals.seeLessAuthors, r.posts.author_id, 1)
    for (const t of r.posts.tags ?? []) add(signals.seeLessTags, t, 1)
  }
  return signals
}

const POST_COLUMNS = 'id, author_id, image_url, caption, tags, like_count, comment_count, report_count, created_at'
type PostRow = Omit<Candidate, 'sources'> & { image_url: string; caption: string }

/** Stage 1: retrieval from several candidate sources. */
export async function retrieve(sb: SupabaseClient, signals: Signals, surface: Surface): Promise<Candidate[]> {
  const base = () => sb.from('posts').select(POST_COLUMNS).eq('type', 'post')
  const topTags = [...signals.tagAffinity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t)
  const since = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString()
  const following = [...signals.following]

  const [byFollowing, bySimilar, byTrending, byFresh] = await Promise.all([
    surface === 'feed' && following.length
      ? base().in('author_id', following).order('created_at', { ascending: false }).limit(150)
      : Promise.resolve({ data: [], error: null }),
    topTags.length
      ? base().overlaps('tags', topTags).order('created_at', { ascending: false }).limit(150)
      : Promise.resolve({ data: [], error: null }),
    base().gte('created_at', since).order('like_count', { ascending: false }).limit(100),
    base().order('created_at', { ascending: false }).limit(60),
  ])

  let merged = mergeSources([
    ['following', check(byFollowing) as PostRow[]],
    ['similar', check(bySimilar) as PostRow[]],
    ['trending', check(byTrending) as PostRow[]],
    ['fresh', check(byFresh) as PostRow[]],
  ])
  if (surface === 'explore') merged = merged.filter((c) => !signals.following.has(c.author_id))
  return merged
}

/** Loads authors and my like/save state for the posts we are returning. */
export async function hydrate(sb: SupabaseClient, me: string, posts: PostRow[]) {
  const ids = posts.map((p) => p.id)
  const authorIds = [...new Set(posts.map((p) => p.author_id))]
  if (!ids.length) return []
  const [authors, liked, saved] = await Promise.all([
    sb.from('profiles').select('id, username, full_name, avatar_url, bio').in('id', authorIds),
    sb.from('likes').select('post_id').eq('user_id', me).in('post_id', ids),
    sb.from('saves').select('post_id').eq('user_id', me).in('post_id', ids),
  ])
  const byId = new Map(check(authors).map((a: { id: string }) => [a.id, a]))
  const likedSet = new Set(check(liked).map((r: { post_id: string }) => r.post_id))
  const savedSet = new Set(check(saved).map((r: { post_id: string }) => r.post_id))
  return posts.map(({ report_count: _hidden, ...p }) => ({
    ...p,
    author: byId.get(p.author_id) ?? null,
    liked: likedSet.has(p.id),
    saved: savedSet.has(p.id),
  }))
}

export { check }
