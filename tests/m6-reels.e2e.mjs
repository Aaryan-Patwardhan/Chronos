// Module 6 (reels) — end-to-end against Supabase and /api.
// Needs `pnpm dev` (or CHRONOS_API=<url>). Run: node tests/m6-reels.e2e.mjs
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
  const { data, error } = await c.auth.signUp({ email: `m6${tag}-${s}@example.com`, password: 'test-pass-123' })
  if (error) throw error
  await c.rpc('complete_onboarding', { p_username: `m6${tag}_${s}`, p_interests: ['pets', 'music', 'art'] })
  return { c, id: data.user.id, token: data.session.access_token }
}
const feed = async (who, surface) =>
  (await (await fetch(`${API}/api/feed?surface=${surface}`, { headers: { Authorization: `Bearer ${who.token}` } })).json()).posts ?? []

const A = await account('a'), B = await account('b')
const mp4 = readFileSync(new URL('./fixtures/tiny.mp4', import.meta.url))
const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64')

// ── Storage: the videos bucket ──────────────────────────────────────────
const vPath = `${A.id}/reel-${s}.mp4`, cPath = `${A.id}/reel-${s}-cover.jpg`
check('upload a video to your own folder', !(await A.c.storage.from('videos').upload(vPath, mp4, { contentType: 'video/mp4' })).error)
check("cannot upload into someone else's folder", !!(await B.c.storage.from('videos').upload(`${A.id}/x-${s}.mp4`, mp4, { contentType: 'video/mp4' })).error)
check('videos bucket refuses non-video files', !!(await A.c.storage.from('videos').upload(`${A.id}/x-${s}.txt`, Buffer.from('hi'), { contentType: 'text/plain' })).error)
check('photo bucket still refuses videos', !!(await A.c.storage.from('media').upload(`${A.id}/x-${s}.mp4`, mp4, { contentType: 'video/mp4' })).error)
await A.c.storage.from('media').upload(cPath, jpg, { contentType: 'image/jpeg' })
const videoUrl = A.c.storage.from('videos').getPublicUrl(vPath).data.publicUrl
const coverUrl = A.c.storage.from('media').getPublicUrl(cPath).data.publicUrl
check('the video is public to play', (await fetch(videoUrl, { method: 'HEAD' })).headers.get('content-type') === 'video/mp4')

// ── Database rules ──────────────────────────────────────────────────────
const base = { author_id: A.id, type: 'reel', image_url: coverUrl, video_url: videoUrl, duration: 4, aspect: 0.5625, tags: ['pets'] }
check('a reel must have a video', !!(await A.c.from('posts').insert({ ...base, video_url: null })).error)
check('the video must be in our storage', !!(await A.c.from('posts').insert({ ...base, video_url: 'https://example.com/v.mp4' })).error)
check('reels can be at most 90 seconds', !!(await A.c.from('posts').insert({ ...base, duration: 120 })).error)
check('photo posts cannot carry a video', !!(await A.c.from('posts').insert({ ...base, type: 'post' })).error)
check('cannot post a reel as someone else', !!(await B.c.from('posts').insert({ ...base })).error)
const reel = await A.c.from('posts').insert({ ...base, caption: 'Test reel #m6' }).select('id').single()
check('post a reel', !!reel.data, reel.error?.message)
const id = reel.data?.id

// ── Where reels show up ─────────────────────────────────────────────────
const reelsB = await feed(B, 'reels')
const mine = reelsB.find((r) => r.id === id)
check('the reel is in Reels for someone else', !!mine, `${reelsB.length} reels`)
check('Reels only has reels (every item has a video)', reelsB.length > 0 && reelsB.every((r) => r.video_url && r.duration))
check('Reels never sends ranking internals', reelsB.every((r) => !('sources' in r) && !('report_count' in r)))
check('reels never appear in the photo feed', !(await feed(B, 'feed')).some((r) => r.id === id || r.video_url))
check('reels never appear in the Explore grid', !(await feed(B, 'explore')).some((r) => r.id === id || r.video_url))
check("your own reels aren't ranked back to you", !(await feed(A, 'reels')).some((r) => r.id === id))
await new Promise((r) => setTimeout(r, 1500)) // traces are saved just after the response
const why = await fetch(`${API}/api/why?post=${id}&surface=reels`, { headers: { Authorization: `Bearer ${B.token}` } })
const trace = why.ok ? (await why.json()).trace : null
check('"Why am I seeing this?" works for reels', trace?.surface === 'reels' && trace.finalPosition > 0, `status ${why.status}`)
const tags = await A.c.rpc('search_tags', { q: 'm6' })
check("reel hashtags don't count as photo topics", !(tags.data ?? []).some((t) => t.tag === 'm6'))

// ── Engagement works like posts ─────────────────────────────────────────
check('like a reel', !(await B.c.from('likes').insert({ user_id: B.id, post_id: id })).error)
check('comment on a reel', !(await B.c.from('comments').insert({ user_id: B.id, post_id: id, body: 'Nice!' })).error)
check('save a reel', !(await B.c.from('saves').insert({ user_id: B.id, post_id: id })).error)
const counts = await B.c.from('posts').select('like_count, comment_count').eq('id', id).single()
check('like and comment counts update', counts.data?.like_count === 1 && counts.data?.comment_count === 1)
const notes = await A.c.from('notifications').select('kind').eq('post_id', id)
check('the author is notified', (notes.data ?? []).length >= 2, `${notes.data?.length} notifications`)

// ── Editing / deleting ──────────────────────────────────────────────────
check('cannot swap the video after posting', !!(await A.c.from('posts').update({ video_url: videoUrl + '?x' }).eq('id', id)).error)
check('edit the caption', !(await A.c.from('posts').update({ caption: 'Edited' }).eq('id', id)).error)
check("cannot delete someone else's reel", ((await B.c.from('posts').delete().eq('id', id).select()).data ?? []).length === 0)
check('delete your own reel', ((await A.c.from('posts').delete().eq('id', id).select()).data ?? []).length === 1)
check('and its video file', !(await A.c.storage.from('videos').remove([vPath])).error && ((await A.c.storage.from('videos').list(A.id)).data ?? []).length === 0)
await A.c.storage.from('media').remove([cPath])

// ── Demo reels exist for the demo ───────────────────────────────────────
const demo = await A.c.from('posts').select('id').eq('type', 'reel')
check('demo reels are installed (supabase/demo-reels.sql)', (demo.data ?? []).length >= 19, `${demo.data?.length} reels`)

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
