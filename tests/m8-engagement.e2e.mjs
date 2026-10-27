// Module 8 (likes, comments, saves) — backend checks against the real
// Supabase project with three fresh accounts. Run: node tests/m8-engagement.e2e.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }
const s = Date.now().toString(36)
async function account(tag) {
  const c = client()
  const { data, error } = await c.auth.signUp({ email: `m8${tag}-${s}@example.com`, password: 'test-pass-123' })
  if (error) throw error
  await c.rpc('complete_onboarding', { p_username: `m8${tag}_${s}`, p_interests: ['food', 'tech', 'art'] })
  return { c, id: data.user.id }
}
const A = await account('a'), B = await account('b'), C = await account('c')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const path = `${A.id}/m8-${s}.png`
await A.c.storage.from('media').upload(path, png, { contentType: 'image/png' })
const url = A.c.storage.from('media').getPublicUrl(path).data.publicUrl
const postId = (await A.c.from('posts').insert({ author_id: A.id, image_url: url, caption: 'm8 test', tags: ['food'] }).select('id').single()).data.id
const counts = async () => (await A.c.from('posts').select('like_count, comment_count').eq('id', postId).single()).data
const notes = async (kind) => (await A.c.from('notifications').select('kind, actor_id').eq('user_id', A.id).eq('kind', kind)).data ?? []

// ── Likes ───────────────────────────────────────────────────────────────
check('like a post', !(await B.c.from('likes').insert({ user_id: B.id, post_id: postId })).error)
check('like count goes up', (await counts()).like_count === 1)
check('liking twice is refused (no double count)', (await B.c.from('likes').insert({ user_id: B.id, post_id: postId })).error?.code === '23505')
check('like count still 1', (await counts()).like_count === 1)
check('cannot like on behalf of someone else', !!(await B.c.from('likes').insert({ user_id: C.id, post_id: postId })).error)
check('author gets a "like" notification', (await notes('like')).some((n) => n.actor_id === B.id))
await A.c.from('likes').insert({ user_id: A.id, post_id: postId })
check('liking your own post sends you no notification', !(await notes('like')).some((n) => n.actor_id === A.id))
const likers = await C.c.from('likes').select('who:profiles!likes_user_id_fkey(username)').eq('post_id', postId)
check('anyone can see who liked a post', likers.data?.length === 2, `${likers.data?.length} likers`)
check("cannot remove someone else's like", ((await C.c.from('likes').delete().eq('user_id', B.id).eq('post_id', postId).select()).data ?? []).length === 0)
check('unlike', ((await B.c.from('likes').delete().eq('user_id', B.id).eq('post_id', postId).select()).data ?? []).length === 1)
check('like count goes down', (await counts()).like_count === 1)
const again = await B.c.from('likes').delete().eq('user_id', B.id).eq('post_id', postId).select()
check('unliking twice changes nothing', (again.data ?? []).length === 0 && (await counts()).like_count === 1)
check('likes cannot be edited', !!(await A.c.from('likes').update({ post_id: postId }).eq('user_id', A.id)).error)

// ── Comments ────────────────────────────────────────────────────────────
const c1 = await B.c.from('comments').insert({ post_id: postId, user_id: B.id, body: 'Looks delicious!' }).select('id').single()
check('comment on a post', !!c1.data, c1.error?.message)
check('comment count goes up', (await counts()).comment_count === 1)
check('author gets a "comment" notification', (await notes('comment')).some((n) => n.actor_id === B.id))
check('empty comment refused', !!(await B.c.from('comments').insert({ post_id: postId, user_id: B.id, body: '' })).error)
check('comment of only spaces refused', !!(await B.c.from('comments').insert({ post_id: postId, user_id: B.id, body: '   ' })).error)
check('comment over 500 characters refused', !!(await B.c.from('comments').insert({ post_id: postId, user_id: B.id, body: 'x'.repeat(501) })).error)
check('cannot comment as someone else', !!(await B.c.from('comments').insert({ post_id: postId, user_id: C.id, body: 'fake' })).error)
check('comments cannot be edited', !!(await B.c.from('comments').update({ body: 'edited' }).eq('id', c1.data.id)).error)
const c2 = await C.c.from('comments').insert({ post_id: postId, user_id: C.id, body: 'Recipe please' }).select('id').single()
check("cannot delete someone else's comment on someone else's post", ((await B.c.from('comments').delete().eq('id', c2.data.id).select()).data ?? []).length === 0)
check('delete your own comment', ((await B.c.from('comments').delete().eq('id', c1.data.id).select()).data ?? []).length === 1)
check('post author can remove any comment on their post', ((await A.c.from('comments').delete().eq('id', c2.data.id).select()).data ?? []).length === 1)
check('comment count back to 0', (await counts()).comment_count === 0)

// ── Saves (private) ─────────────────────────────────────────────────────
check('save a post', !(await B.c.from('saves').insert({ user_id: B.id, post_id: postId })).error)
check('saving twice is refused', (await B.c.from('saves').insert({ user_id: B.id, post_id: postId })).error?.code === '23505')
const mySaves = await B.c.from('saves').select('post:posts(id)').eq('user_id', B.id)
check('saved post shows in your Saved list', mySaves.data?.some((r) => r.post?.id === postId))
check("others cannot see your saves (not even the author)", ((await A.c.from('saves').select('*').eq('post_id', postId)).data ?? []).length === 0)
check('saving sends no notification', (await A.c.from('notifications').select('kind').eq('user_id', A.id)).data.every((n) => ['like', 'comment', 'follow'].includes(n.kind)))
check('unsave', ((await B.c.from('saves').delete().eq('user_id', B.id).eq('post_id', postId).select()).data ?? []).length === 1)

// ── Deleting the post removes its likes, comments and saves ─────────────
await B.c.from('likes').insert({ user_id: B.id, post_id: postId })
await C.c.from('comments').insert({ post_id: postId, user_id: C.id, body: 'bye' })
await C.c.from('saves').insert({ user_id: C.id, post_id: postId })
await A.c.from('posts').delete().eq('id', postId)
await A.c.storage.from('media').remove([path])
const leftovers = [
  (await B.c.from('likes').select('*').eq('post_id', postId)).data.length,
  (await C.c.from('comments').select('*').eq('post_id', postId)).data.length,
  (await C.c.from('saves').select('*').eq('post_id', postId)).data.length,
]
check('deleting a post removes its likes, comments and saves', leftovers.every((n) => n === 0), leftovers.join('/'))

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
