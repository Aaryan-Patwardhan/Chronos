// Module 4 (home feed: server ranking, "why", see less, report, preferences)
// End-to-end against the real Supabase project AND the /api functions.
// Needs the app running: `pnpm dev` (or set CHRONOS_API=https://your-deploy).
// Run: node tests/m4-feed.e2e.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const API = process.env.CHRONOS_API ?? 'http://127.0.0.1:5173'
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const s = Date.now().toString(36)

async function account(tag, interests) {
  const c = client()
  const { data, error } = await c.auth.signUp({ email: `m4${tag}-${s}@example.com`, password: 'test-pass-123' })
  if (error) throw error
  const r = await c.rpc('complete_onboarding', { p_username: `m4${tag}_${s}`, p_interests: interests })
  if (r.error) throw r.error
  return { c, id: data.user.id, token: data.session.access_token }
}
const call = (path, token, init = {}) => fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
const feed = async (u, surface = 'feed') => (await call(`/api/feed?surface=${surface}`, u.token)).body.posts ?? []

const D = await account('d', ['cricket', 'food', 'tech'])

// ── Security of the API ─────────────────────────────────────────────────
check('no token → 401', (await call('/api/feed', null)).status === 401)
check('garbage token → 401', (await call('/api/feed', 'abc.def.ghi')).status === 401)
const [h, , sig] = D.token.split('.')
const fakePayload = Buffer.from(JSON.stringify({ sub: D.id, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
const forged = await call('/api/feed', `${h}.${fakePayload}.${sig}`)
check('forged token (valid shape, wrong signature) → 401, no data', forged.status === 401 && !forged.body.posts, `status ${forged.status}`)
const expiredPayload = Buffer.from(JSON.stringify({ sub: D.id, exp: 1 })).toString('base64url')
check('expired token → 401', (await call('/api/feed', `${h}.${expiredPayload}.${sig}`)).status === 401)
const why401 = await call(`/api/why?post=${D.id}&surface=feed`, null)
check('"why" without login → 401', why401.status === 401)

// ── Cold-start feed for a brand-new user ───────────────────────────────
const t0 = performance.now()
const f1 = await feed(D)
const ms = Math.round(performance.now() - t0)
check('new user gets a full feed (≥ 30 posts)', f1.length >= 30, `${f1.length} posts`)
check('no duplicate posts', new Set(f1.map((p) => p.id)).size === f1.length)
check('own posts never in the feed', f1.every((p) => p.author_id !== D.id))
let sameAuthorRuns = 0
for (let i = 1; i < f1.length; i++) if (f1[i].author_id === f1[i - 1].author_id) sameAuthorRuns++
check('never the same author twice in a row', sameAuthorRuns === 0, `${sameAuthorRuns} repeats`)
const top10 = f1.slice(0, 10)
const relevant = top10.filter((p) => p.tags.some((t) => ['cricket', 'food', 'tech'].includes(t))).length
check('top 10 mostly match the interests picked at sign-up', relevant >= 6, `${relevant}/10`)
check('ranking internals are not sent to the browser', f1.every((p) => !('report_count' in p) && !('sources' in p)))
check('every post has its author attached', f1.every((p) => p.author?.username))
check('feed responds in under 2.5 s', ms < 2500, `${ms} ms`)

// ── "Why am I seeing this?" ─────────────────────────────────────────────
await sleep(1200)
const why = await call(`/api/why?post=${f1[0].id}&surface=feed`, D.token)
const tr = why.body.trace
check('"why" returns the explanation for a ranked post', why.status === 200 && !!tr)
check('explanation covers all 4 stages', tr && tr.sources?.length > 0 && tr.firstStage?.kept > 0 && tr.predictions?.like >= 0 && tr.finalPosition === 1)
const notRanked = await call(`/api/why?post=00000000-0000-4000-8000-000000000000&surface=feed`, D.token)
check('"why" for a post not in your feed → friendly 404', notRanked.status === 404 && /refresh/i.test(notRanked.body.error ?? ''))
const badId = await call(`/api/why?post=not-a-uuid&surface=feed`, D.token)
check('"why" with a bad id → 400', badId.status === 400)
const E = await account('e', ['art', 'music', 'pets'])
const peek = await E.c.from('feed_traces').select('*').eq('user_id', D.id)
check("another user cannot read your explanations", (peek.data ?? []).length === 0)

// ── Like / save state comes back with the feed ─────────────────────────
await D.c.from('likes').insert({ user_id: D.id, post_id: f1[2].id })
await D.c.from('saves').insert({ user_id: D.id, post_id: f1[3].id })
const f2 = await feed(D)
const p2 = f2.find((p) => p.id === f1[2].id), p3 = f2.find((p) => p.id === f1[3].id)
check('liked post comes back marked liked', !p2 || p2.liked === true, p2 ? '' : 'not in feed any more')
check('saved post comes back marked saved', !p3 || p3.saved === true, p3 ? '' : 'not in feed any more')

// ── "See fewer posts like this" ─────────────────────────────────────────
const target = f2[0]
await D.c.from('see_less').insert({ user_id: D.id, post_id: target.id })
const f3 = await feed(D)
check('"see less" post disappears from the feed', !f3.some((p) => p.id === target.id))
await sleep(1200)
const similar = f3.find((p) => p.author_id === target.author_id || p.tags.some((t) => target.tags.includes(t)))
if (similar) {
  const tr2 = (await call(`/api/why?post=${similar.id}&surface=feed`, D.token)).body.trace
  check('similar posts get a "see less" penalty', tr2?.features?.seeLessSimilarity > 0, `similarity ${tr2?.features?.seeLessSimilarity}`)
} else check('similar posts get a "see less" penalty', true, 'no similar post left (all pushed out)')

// ── Report ──────────────────────────────────────────────────────────────
const reportTarget = f3[1]
await D.c.from('reports').insert({ user_id: D.id, post_id: reportTarget.id })
check('a post you reported disappears from your feed', !(await feed(D)).some((p) => p.id === reportTarget.id))
// Post by A, reported by B and C, seen by F (who follows A) → moved down.
const A = await account('a', ['travel', 'nature', 'photography'])
const B = await account('b', ['food', 'art', 'pets']), C = await account('c', ['food', 'art', 'pets'])
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const path = `${A.id}/m4-${s}.png`
await A.c.storage.from('media').upload(path, png, { contentType: 'image/png' })
const url = A.c.storage.from('media').getPublicUrl(path).data.publicUrl
const post = (await A.c.from('posts').insert({ author_id: A.id, image_url: url, caption: 'm4 report test', tags: ['travel'] }).select('id').single()).data
await B.c.from('reports').insert({ user_id: B.id, post_id: post.id })
await C.c.from('reports').insert({ user_id: C.id, post_id: post.id })
const F = await account('f', ['travel', 'nature', 'photography'])
// Like a real user in onboarding step 3: follow a few suggested accounts.
for (const u of ((await F.c.rpc('suggested_accounts', { p_limit: 6 })).data ?? [])) await F.c.from('follows').insert({ follower_id: F.id, followee_id: u.id })
await F.c.from('follows').insert({ follower_id: F.id, followee_id: A.id })
const fF = await feed(F)
await sleep(1200)
const inF = fF.find((p) => p.id === post.id)
const trR = inF ? (await call(`/api/why?post=${post.id}&surface=feed`, F.token)).body.trace : null
// A fresh post from someone you follow would normally rank near the top;
// reported by 2 people it must drop far down (or out) — with the reason.
check('post reported by 2+ people is moved far down (or out of the feed)', !inF || trR?.finalPosition > 20, inF ? `position ${trR?.finalPosition}` : 'pushed out of the top 60')
check('…and when still shown, the reason is explained', !inF || trR.rules.some((r) => /reported by 2 people/.test(r)))

// ── Feed preferences ────────────────────────────────────────────────────
const g = await call('/api/prefs', F.token)
check('preferences load with defaults', g.status === 200 && g.body.weights?.following === 1)
const bad = await call('/api/prefs', F.token, { method: 'PUT', body: JSON.stringify({ weights: { following: 99, similar: -5, fresh: 'x' } }) })
check('preferences are cleaned (0–3)', bad.body.weights?.following === 3 && bad.body.weights?.similar === 0 && bad.body.weights?.fresh === 0.3)
const followShare = async () => {
  const list = (await feed(F)).slice(0, 15); await sleep(1200)
  let n = 0
  for (const p of list) { const t = (await call(`/api/why?post=${p.id}&surface=feed`, F.token)).body.trace; if (t?.features?.following) n++ }
  return n
}
await call('/api/prefs', F.token, { method: 'PUT', body: JSON.stringify({ weights: { following: 3, similar: 0, trending: 0, fresh: 0 } }) })
const followHeavy = await followShare()
await call('/api/prefs', F.token, { method: 'PUT', body: JSON.stringify({ weights: { following: 0, similar: 3, trending: 3, fresh: 3 } }) })
const discoveryHeavy = await followShare()
check('changing preferences changes the feed', followHeavy > discoveryHeavy, `followed accounts in top 15: ${followHeavy} → ${discoveryHeavy}`)
const other = await E.c.from('feed_prefs').select('*').eq('user_id', F.id)
check("another user cannot read your preferences", (other.data ?? []).length === 0)

// Clean up the reported test post (and its photo).
await A.c.from('posts').delete().eq('id', post.id)
await A.c.storage.from('media').remove([path])

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
