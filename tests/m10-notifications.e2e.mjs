// Module 10 (notifications) — end-to-end against Supabase.
// Run: node tests/m10-notifications.e2e.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }
const s = Date.now().toString(36)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function account(tag) {
  const c = client()
  const { data, error } = await c.auth.signUp({ email: `m10${tag}-${s}@example.com`, password: 'test-pass-123' })
  if (error) throw error
  await c.rpc('complete_onboarding', { p_username: `m10${tag}_${s}`, p_interests: ['art', 'music', 'pets'] })
  return { c, id: data.user.id }
}
const A = await account('a'), B = await account('b')
const mine = (kind, extra = {}) => {
  let q = A.c.from('notifications').select('id, kind, read, actor_id, post:posts(type, image_url)').eq('kind', kind).eq('actor_id', B.id)
  for (const [k, v] of Object.entries(extra)) q = q.eq(k, v)
  return q
}

// A posts a photo and a reel (files only need to be in our storage paths).
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const path = `${A.id}/n-${s}.png`
await A.c.storage.from('media').upload(path, png, { contentType: 'image/png' })
const img = A.c.storage.from('media').getPublicUrl(path).data.publicUrl
const vid = `${env.VITE_SUPABASE_URL}/storage/v1/object/public/videos/${A.id}/n-${s}.mp4`
const post = (await A.c.from('posts').insert({ author_id: A.id, image_url: img, caption: 'n' }).select('id').single()).data
const reel = (await A.c.from('posts').insert({ author_id: A.id, type: 'reel', image_url: img, video_url: vid, duration: 5 }).select('id').single()).data
check('test posts created', !!post && !!reel)

// ── Follow ──────────────────────────────────────────────────────────────
await B.c.from('follows').insert({ follower_id: B.id, followee_id: A.id })
check('follow → "started following you"', ((await mine('follow')).data ?? []).length === 1)
await B.c.from('follows').delete().eq('follower_id', B.id).eq('followee_id', A.id)
check('unfollow takes it back', ((await mine('follow')).data ?? []).length === 0)
await B.c.from('follows').insert({ follower_id: B.id, followee_id: A.id })
await B.c.from('follows').delete().eq('follower_id', B.id).eq('followee_id', A.id)
await B.c.from('follows').insert({ follower_id: B.id, followee_id: A.id })
check('follow, unfollow, follow again → only one notification', ((await mine('follow')).data ?? []).length === 1)

// ── Likes ───────────────────────────────────────────────────────────────
await B.c.from('likes').insert({ user_id: B.id, post_id: post.id })
const liked = (await mine('like', { post_id: post.id })).data ?? []
check('like → notification with the photo', liked.length === 1 && liked[0].post?.type === 'post' && liked[0].post.image_url === img)
await B.c.from('likes').delete().eq('user_id', B.id).eq('post_id', post.id)
check('unlike takes it back', ((await mine('like', { post_id: post.id })).data ?? []).length === 0)
for (let i = 0; i < 3; i++) {
  await B.c.from('likes').insert({ user_id: B.id, post_id: post.id })
  if (i < 2) await B.c.from('likes').delete().eq('user_id', B.id).eq('post_id', post.id)
}
check('like/unlike repeatedly → only one notification', ((await mine('like', { post_id: post.id })).data ?? []).length === 1)
check('like count stays correct', (await A.c.from('posts').select('like_count').eq('id', post.id).single()).data?.like_count === 1)
await B.c.from('likes').insert({ user_id: B.id, post_id: reel.id })
const reelNote = (await mine('like', { post_id: reel.id })).data ?? []
check('liking a reel says it is a reel', reelNote[0]?.post?.type === 'reel')
await A.c.from('likes').insert({ user_id: A.id, post_id: post.id })
check('liking your own post notifies nobody', ((await A.c.from('notifications').select('id').eq('actor_id', A.id)).data ?? []).length === 0)

// ── Comments ────────────────────────────────────────────────────────────
await B.c.from('comments').insert({ user_id: B.id, post_id: post.id, body: 'Lovely' })
check('comment → notification', ((await mine('comment', { post_id: post.id })).data ?? []).length === 1)

// ── Privacy and read state ──────────────────────────────────────────────
check("B can't see A's notifications", ((await B.c.from('notifications').select('id').eq('user_id', A.id)).data ?? []).length === 0)
check("B can't mark A's notifications read", ((await B.c.from('notifications').update({ read: true }).eq('user_id', A.id).select('id')).data ?? []).length === 0)
check("B can't create a fake notification", !!(await B.c.from('notifications').insert({ user_id: A.id, actor_id: B.id, kind: 'follow' })).error)
const unread = (await A.c.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', A.id).eq('read', false)).count
check('A has 4 unread (follow, like, reel like, comment)', unread === 4, `${unread}`)
await A.c.from('notifications').update({ read: true }).eq('user_id', A.id).eq('read', false)
check('A marks all read', (await A.c.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', A.id).eq('read', false)).count === 0)

// ── Live delivery ───────────────────────────────────────────────────────
let live = null
const ch = A.c.channel(`t:${s}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${A.id}` }, (p) => { live = p.new })
await new Promise((r) => ch.subscribe((st) => st === 'SUBSCRIBED' && r()))
await wait(500)
await B.c.from('comments').insert({ user_id: B.id, post_id: reel.id, body: 'Live!' })
for (let i = 0; i < 20 && !live; i++) await wait(250)
check('a new notification arrives live', live?.kind === 'comment' && live.post_id === reel.id)
await A.c.removeChannel(ch)

// ── Deleting the post removes its notifications ─────────────────────────
await A.c.from('posts').delete().in('id', [post.id, reel.id])
check("deleted posts' notifications disappear", ((await A.c.from('notifications').select('id').not('post_id', 'is', null)).data ?? []).length === 0)
await A.c.storage.from('media').remove([path])

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
