// Module 5 (stories) — end-to-end against Supabase and /api.
// Needs `pnpm dev` (or CHRONOS_API=<url>). Run: node tests/m5-stories.e2e.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const API = process.env.CHRONOS_API ?? 'http://127.0.0.1:5173'
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }
const s = Date.now().toString(36)
async function account(tag) {
  const c = client()
  const { data, error } = await c.auth.signUp({ email: `m5${tag}-${s}@example.com`, password: 'test-pass-123' })
  if (error) throw error
  await c.rpc('complete_onboarding', { p_username: `m5${tag}_${s}`, p_interests: ['travel', 'food', 'art'] })
  return { c, id: data.user.id, token: data.session.access_token }
}
const A = await account('a'), B = await account('b'), C = await account('c')
await B.c.from('follows').insert({ follower_id: B.id, followee_id: A.id })
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const path = `${A.id}/story-${s}.png`
await A.c.storage.from('media').upload(path, png, { contentType: 'image/png' })
const url = A.c.storage.from('media').getPublicUrl(path).data.publicUrl

// ── Posting a story ─────────────────────────────────────────────────────
const yearLater = new Date(Date.now() + 365 * 864e5).toISOString()
const st = await A.c.from('posts').insert({ author_id: A.id, image_url: url, caption: 'Sunset!', type: 'story', expires_at: yearLater, tags: ['travel'] })
  .select('id, expires_at, tags').single()
check('post a story', !!st.data, st.error?.message)
const hours = (new Date(st.data.expires_at) - Date.now()) / 36e5
check('story always expires after 24 h (app asked for a year)', hours > 23.9 && hours <= 24.01, `${hours.toFixed(2)} h`)
check('stories carry no topics (never ranked as posts)', st.data.tags.length === 0)
const post = await A.c.from('posts').insert({ author_id: A.id, image_url: url, caption: 'normal post', expires_at: yearLater }).select('id, expires_at').single()
check('normal posts never expire (app cannot set an expiry)', post.data?.expires_at === null)
check('cannot post a story as someone else', !!(await B.c.from('posts').insert({ author_id: A.id, image_url: url, type: 'story' })).error)

// ── Who sees it, and where it never shows up ───────────────────────────
const live = await B.c.from('posts').select('id').eq('type', 'story').eq('author_id', A.id).gt('expires_at', new Date().toISOString())
check('a follower sees the live story', live.data?.some((r) => r.id === st.data.id))
const feedB = (await (await fetch(`${API}/api/feed?surface=feed`, { headers: { Authorization: `Bearer ${B.token}` } })).json()).posts ?? []
check('stories never appear in the feed as posts', !feedB.some((p) => p.id === st.data.id) && feedB.some((p) => p.id === post.data.id), `${feedB.length} feed posts`)
const exploreC = (await (await fetch(`${API}/api/feed?surface=explore`, { headers: { Authorization: `Bearer ${C.token}` } })).json()).posts ?? []
check('stories never appear in explore', !exploreC.some((p) => p.id === st.data.id))
const grid = await B.c.from('posts').select('id').eq('author_id', A.id).eq('type', 'post')
check("stories don't appear in the profile grid", !grid.data.some((r) => r.id === st.data.id))

// ── Seen tracking ───────────────────────────────────────────────────────
check('viewer records that they saw it', !(await B.c.from('story_views').insert({ story_id: st.data.id, viewer_id: B.id })).error)
check('seeing it twice is harmless (no duplicate)', (await B.c.from('story_views').insert({ story_id: st.data.id, viewer_id: B.id })).error?.code === '23505')
check('cannot record a view for someone else', !!(await B.c.from('story_views').insert({ story_id: st.data.id, viewer_id: C.id })).error)
check('cannot mark a normal post as a "story view"', !!(await B.c.from('story_views').insert({ story_id: post.data.id, viewer_id: B.id })).error)
const seenByA = await A.c.from('story_views').select('viewer:profiles!story_views_viewer_id_fkey(username)').eq('story_id', st.data.id)
check('author sees who viewed the story', seenByA.data?.length === 1 && seenByA.data[0].viewer.username === `m5b_${s}`)
await C.c.from('story_views').insert({ story_id: st.data.id, viewer_id: C.id })
const peek = await C.c.from('story_views').select('viewer_id').eq('story_id', st.data.id)
check("other viewers can't see who else viewed it", peek.data?.length === 1 && peek.data[0].viewer_id === C.id, `${peek.data?.length} visible`)

// ── Editing / deleting ──────────────────────────────────────────────────
check('cannot extend a story by editing its expiry', !!(await A.c.from('posts').update({ expires_at: yearLater }).eq('id', st.data.id)).error)
check("cannot delete someone else's story", ((await B.c.from('posts').delete().eq('id', st.data.id).select()).data ?? []).length === 0)
check('delete your own story', ((await A.c.from('posts').delete().eq('id', st.data.id).select()).data ?? []).length === 1)
check('its views are removed too', ((await A.c.from('story_views').select('*').eq('story_id', st.data.id)).data ?? []).length === 0)
await A.c.from('posts').delete().eq('id', post.data.id)
await A.c.storage.from('media').remove([path])

// ── Demo stories exist for the demo ─────────────────────────────────────
const demo = await A.c.from('posts').select('author_id').eq('type', 'story').gt('expires_at', new Date().toISOString())
check('demo stories are live (run supabase/demo-stories.sql before a demo)', (demo.data ?? []).length >= 20, `${demo.data?.length} live stories`)

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
