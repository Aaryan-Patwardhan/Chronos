// Module 3 (posts + media uploads) — backend checks against the real
// Supabase project with two fresh accounts. Run: node tests/m3-posts.e2e.mjs
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
  const { data, error } = await c.auth.signUp({ email: `m3${tag}-${s}@example.com`, password: 'test-pass-123' })
  if (error) throw error
  await c.rpc('complete_onboarding', { p_username: `m3${tag}_${s}`, p_interests: ['food', 'tech', 'art'] })
  return { c, id: data.user.id }
}
const A = await account('a'), B = await account('b')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

// Storage rules
const path = `${A.id}/post-${s}.png`
const up = await A.c.storage.from('media').upload(path, png, { contentType: 'image/png' })
check('upload a photo', !up.error, up.error?.message)
const txt = await A.c.storage.from('media').upload(`${A.id}/note-${s}.txt`, Buffer.from('hello'), { contentType: 'text/plain' })
check('non-photo files refused', !!txt.error, txt.error?.message)
const big = await A.c.storage.from('media').upload(`${A.id}/big-${s}.jpg`, Buffer.alloc(6 * 1024 * 1024, 1), { contentType: 'image/jpeg' })
check('files over 5 MB refused', !!big.error, big.error?.message)
const url = A.c.storage.from('media').getPublicUrl(path).data.publicUrl
const peekList = await B.c.storage.from('media').list(A.id)
check("cannot list someone else's files", (peekList.data ?? []).length === 0, `${peekList.data?.length ?? 0} visible`)
const ownList = await A.c.storage.from('media').list(A.id)
check('can list own files', (ownList.data ?? []).some((f) => f.name === `post-${s}.png`))

// Creating posts
const p1 = await A.c.from('posts').insert({ author_id: A.id, image_url: url, caption: 'First post #food', tags: ['food'] }).select().single()
check('create a post with an uploaded photo', !!p1.data, p1.error?.message)
const postId = p1.data?.id
const ext = await A.c.from('posts').insert({ author_id: A.id, image_url: 'https://evil.example.com/pixel.png', caption: 'x' })
check('photos from outside sites refused', ext.error?.message?.includes('posts_image_from_storage'), ext.error?.message)
const longCap = await A.c.from('posts').insert({ author_id: A.id, image_url: url, caption: 'a'.repeat(2201) })
check('caption over 2200 characters refused', longCap.error?.message?.includes('posts_caption_len'))
const manyTags = await A.c.from('posts').insert({ author_id: A.id, image_url: url, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })
check('more than 10 tags refused', manyTags.error?.message?.includes('posts_tags_max'))
const asB = await B.c.from('posts').insert({ author_id: A.id, image_url: url, caption: 'fake' })
check('cannot post as someone else', !!asB.error)
const counts = await A.c.from('posts').select('like_count, comment_count').eq('id', postId).single()
check('new post starts with 0 likes and comments', counts.data?.like_count === 0 && counts.data?.comment_count === 0)

// Editing
const ed1 = await A.c.from('posts').update({ caption: 'Edited caption' }).eq('id', postId).select('caption').single()
check('edit own caption', ed1.data?.caption === 'Edited caption', ed1.error?.message)
const ed2 = await A.c.from('posts').update({ like_count: 9999 }).eq('id', postId)
check('cannot fake the like count', !!ed2.error, ed2.error?.code)
const ed3 = await A.c.from('posts').update({ image_url: url.replace('post-', 'other-') }).eq('id', postId)
check('cannot swap the photo after posting', !!ed3.error, ed3.error?.code)
const ed4 = await B.c.from('posts').update({ caption: 'hacked' }).eq('id', postId).select()
check("cannot edit someone else's caption", (ed4.data ?? []).length === 0)

// Reading
const seen = await B.c.from('posts').select('id, caption').eq('id', postId).single()
check('other users can see the post', seen.data?.caption === 'Edited caption')
const onProfile = await B.c.from('posts').select('id').eq('author_id', A.id)
check("post appears on the author's profile list", onProfile.data?.some((p) => p.id === postId))

// Deleting
const del1 = await B.c.from('posts').delete().eq('id', postId).select()
check("cannot delete someone else's post", (del1.data ?? []).length === 0)
const rmOther = await B.c.storage.from('media').remove([path])
const still = await fetch(url)
check("cannot delete someone else's photo file", still.ok, `remove returned ${rmOther.data?.length ?? 0} files`)
await B.c.from('likes').insert({ user_id: B.id, post_id: postId })
const del2 = await A.c.from('posts').delete().eq('id', postId).select()
check('delete own post', (del2.data ?? []).length === 1, del2.error?.message)
const likesLeft = await B.c.from('likes').select('*').eq('post_id', postId)
check('likes of a deleted post are removed too', (likesLeft.data ?? []).length === 0)
const rmOwn = await A.c.storage.from('media').remove([path])
check('delete own photo file', (rmOwn.data ?? []).length === 1, rmOwn.error?.message)

// Demo photos are served from our own Storage
const sample = await A.c.from('posts').select('image_url').eq('type', 'post').like('image_url', '%/demo/%').limit(300)
const urls = [...new Set(sample.data.map((r) => r.image_url))]
const statuses = await Promise.all(urls.slice(0, 15).map((u) => fetch(u, { method: 'HEAD' }).then((r) => r.status)))
check('demo photos load from our own storage (15 sampled)', statuses.every((st) => st === 200), statuses.join(','))
check('all demo posts use our storage', sample.data.every((r) => r.image_url.includes('.supabase.co/storage/')), `${urls.length} distinct photos`)
check('every demo post has its own photo (no repeats in Explore)', urls.length === sample.data.length, `${urls.length} photos for ${sample.data.length} posts`)

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
