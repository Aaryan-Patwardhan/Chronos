// Module 7 (explore + search) — end-to-end against Supabase and /api.
// Needs `pnpm dev` (or CHRONOS_API=<deployed url>). Run: node tests/m7-explore.e2e.mjs
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

const c = client()
const { data: su, error } = await c.auth.signUp({ email: `m7-${s}@example.com`, password: 'test-pass-123' })
if (error) throw error
await c.rpc('complete_onboarding', { p_username: `m7_${s}`, p_interests: ['music', 'art', 'pets'] })
const me = su.user.id, token = su.session.access_token
const explore = async () => (await (await fetch(`${API}/api/feed?surface=explore`, { headers: { Authorization: `Bearer ${token}` } })).json()).posts ?? []
const follows = new Set(((await c.from('follows').select('followee_id').eq('follower_id', me)).data ?? []).map((r) => r.followee_id))

// ── Explore grid ────────────────────────────────────────────────────────
const t0 = performance.now()
const ex = await explore()
const ms = Math.round(performance.now() - t0)
check('explore returns posts', ex.length >= 30, `${ex.length} posts in ${ms} ms`)
check('no posts from accounts you follow', ex.every((p) => !follows.has(p.author_id)), `${follows.size} followed accounts`)
check('none of your own posts', ex.every((p) => p.author_id !== me))
check('no duplicates', new Set(ex.map((p) => p.id)).size === ex.length)
let repeats = 0
for (let i = 1; i < ex.length; i++) if (ex[i].author_id === ex[i - 1].author_id) repeats++
check('never the same author twice in a row', repeats === 0, `${repeats} repeats`)
const relevant = ex.slice(0, 12).filter((p) => p.tags.some((t) => ['music', 'art', 'pets'].includes(t))).length
check('top of explore leans to your interests', relevant >= 6, `${relevant}/12`)
await sleep(1200)
const why = await (await fetch(`${API}/api/why?post=${ex[0].id}&surface=explore`, { headers: { Authorization: `Bearer ${token}` } })).json()
check('explore posts explain themselves (surface "explore")', why.trace?.surface === 'explore' && !why.trace.sources.includes('following'))
await c.from('see_less').insert({ user_id: me, post_id: ex[0].id })
check('"see less" also removes the post from explore', !(await explore()).some((p) => p.id === ex[0].id))
const followTarget = ex.find((p) => p.author_id !== ex[0].author_id)
await c.from('follows').insert({ follower_id: me, followee_id: followTarget.author_id })
check('after following someone, their posts leave explore', !(await explore()).some((p) => p.author_id === followTarget.author_id))

// ── Topic search ────────────────────────────────────────────────────────
const popular = await c.rpc('search_tags', { q: '' })
check('popular topics (empty search)', popular.data?.length >= 5 && popular.data[0].posts >= popular.data.at(-1).posts, popular.data?.slice(0, 3).map((t) => `${t.tag}:${t.posts}`).join(' '))
const cr = await c.rpc('search_tags', { q: 'cri' })
check('prefix search finds #cricket with a post count', cr.data?.[0]?.tag === 'cricket' && cr.data[0].posts > 0, JSON.stringify(cr.data?.[0]))
const hashed = await c.rpc('search_tags', { q: '#Foo' })
check('"#Foo" is cleaned to "foo" (finds food)', hashed.data?.some((t) => t.tag === 'food'))
const weird = await c.rpc('search_tags', { q: "%'); drop table posts;--" })
check('odd input is harmless (no error, no match-all)', !weird.error && (weird.data ?? []).every((t) => t.tag.startsWith('droptableposts')), weird.error?.message ?? `${weird.data?.length} results`)
const none = await c.rpc('search_tags', { q: 'zzzqqq' })
check('unknown topic → empty list', !none.error && none.data.length === 0)
check('logged-out visitors cannot search topics', !!(await client().rpc('search_tags', { q: 'food' })).error)

// ── Topic page data ─────────────────────────────────────────────────────
const top = await c.from('posts').select('id, like_count, tags').eq('type', 'post').contains('tags', ['cricket']).order('like_count', { ascending: false }).limit(90)
check('topic page: every post has the topic', top.data?.length > 0 && top.data.every((p) => p.tags.includes('cricket')), `${top.data?.length} posts`)
check('topic page "Top" is sorted by likes', top.data.every((p, i, a) => i === 0 || a[i - 1].like_count >= p.like_count))
const cnt = await c.from('posts').select('*', { count: 'exact', head: true }).eq('type', 'post').contains('tags', ['cricket'])
check('topic post count matches topic search', cnt.count === cr.data[0].posts, `${cnt.count} vs ${cr.data[0].posts}`)

// ── People search ───────────────────────────────────────────────────────
const byUser = await c.from('profiles').select('username').or('username.ilike.%aarav%,full_name.ilike.%aarav%').limit(20)
check('find people by username', byUser.data?.some((u) => u.username.startsWith('aarav')))
const byName = await c.from('profiles').select('username, full_name').or('username.ilike.%Mehta%,full_name.ilike.%Mehta%').limit(20)
check('find people by full name (any case)', byName.data?.length > 0 && byName.data.every((u) => /mehta/i.test(u.username + u.full_name)))
check('logged-out visitors cannot search people', ((await client().from('profiles').select('username').ilike('username', '%a%')).data ?? []).length === 0)

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
