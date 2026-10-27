// Module 2 (profiles + followers) — backend checks against the real Supabase
// project with two fresh accounts. Run: node tests/m2-profiles.e2e.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

const s = Date.now().toString(36)
async function account(tag, interests) {
  const c = client()
  const { data, error } = await c.auth.signUp({ email: `m2${tag}-${s}@example.com`, password: 'test-pass-123' })
  if (error) throw error
  await c.rpc('complete_onboarding', { p_username: `m2${tag}_${s}`, p_interests: interests })
  return { c, id: data.user.id, username: `m2${tag}_${s}` }
}
const A = await account('a', ['food', 'tech', 'art'])
const B = await account('b', ['music', 'pets', 'travel'])

// Editing your own profile
const e1 = await A.c.from('profiles').update({ full_name: 'Tester Aye', bio: 'Hello from module 2' }).eq('id', A.id).select().single()
check('edit own name and bio', e1.data?.full_name === 'Tester Aye' && e1.data?.bio === 'Hello from module 2', e1.error?.message)
const e2 = await A.c.from('profiles').update({ bio: 'x'.repeat(151) }).eq('id', A.id)
check('bio over 150 characters refused', e2.error?.message?.includes('profiles_bio_len'), e2.error?.message)
const e3 = await A.c.from('profiles').update({ full_name: 'y'.repeat(51) }).eq('id', A.id)
check('name over 50 characters refused', e3.error?.message?.includes('profiles_full_name_len'), e3.error?.message)
const e4 = await A.c.from('profiles').update({ is_demo: true }).eq('id', A.id)
check('cannot make yourself a demo account', !!e4.error, e4.error?.code)
const e5 = await A.c.from('profiles').update({ id: B.id }).eq('id', A.id)
check('cannot change your account id', !!e5.error, e5.error?.code)

// Username change
const newName = `m2a_renamed_${s}`.slice(0, 30)
const u1 = await A.c.from('profiles').update({ username: newName }).eq('id', A.id).select().single()
check('change own username', u1.data?.username === newName, u1.error?.message)
const u2 = await A.c.from('profiles').update({ username: B.username }).eq('id', A.id)
check("cannot take someone else's username", u2.error?.code === '23505', u2.error?.message)
const u3 = await A.c.from('profiles').update({ username: 'Bad Name' }).eq('id', A.id)
check('invalid username refused', !!u3.error, u3.error?.message)

// Someone else's profile
const x1 = await B.c.from('profiles').update({ bio: 'hacked' }).eq('id', A.id).select()
check("cannot edit another user's profile", (x1.data ?? []).length === 0)

// Follow / unfollow
const before = (await A.c.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', B.id)).count
const f1 = await A.c.from('follows').insert({ follower_id: A.id, followee_id: B.id })
check('follow another user', !f1.error, f1.error?.message)
const afterFollow = (await A.c.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', B.id)).count
check('follower count goes up by 1', afterFollow === before + 1, `${before} → ${afterFollow}`)
const f2 = await A.c.from('follows').insert({ follower_id: A.id, followee_id: B.id })
check('following twice is refused (no duplicates)', f2.error?.code === '23505')
const f3 = await A.c.from('follows').insert({ follower_id: A.id, followee_id: A.id })
check('cannot follow yourself', !!f3.error, f3.error?.message)
const f4 = await B.c.from('follows').insert({ follower_id: A.id, followee_id: B.id })
check('cannot follow on behalf of someone else', !!f4.error)
const n1 = await B.c.from('notifications').select('kind, actor_id').eq('kind', 'follow').eq('actor_id', A.id)
check('followed user gets a "follow" notification', n1.data?.length === 1)
const list = await B.c.from('follows').select('who:profiles!follows_follower_id_fkey(username)').eq('followee_id', B.id)
check("B's followers list shows A", list.data?.some((r) => r.who.username === newName))
const f5 = await B.c.from('follows').delete().eq('follower_id', A.id).eq('followee_id', B.id).select()
check("B cannot remove A's follow", (f5.data ?? []).length === 0)
const f6 = await A.c.from('follows').delete().eq('follower_id', A.id).eq('followee_id', B.id).select()
check('unfollow', (f6.data ?? []).length === 1)
const afterUnfollow = (await A.c.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', B.id)).count
check('follower count back down', afterUnfollow === before)

// Profile photo upload (Storage)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const p1 = await A.c.storage.from('media').upload(`${A.id}/avatar-test-${s}.png`, png, { contentType: 'image/png' })
check('upload a photo into your own folder', !p1.error, p1.error?.message)
const p2 = await A.c.storage.from('media').upload(`${B.id}/avatar-evil-${s}.png`, png, { contentType: 'image/png' })
check("cannot upload into someone else's folder", !!p2.error, p2.error?.message)
const url = A.c.storage.from('media').getPublicUrl(`${A.id}/avatar-test-${s}.png`).data.publicUrl
const r = await fetch(url)
check('uploaded photo is publicly viewable', r.ok, String(r.status))
const p3 = await A.c.from('profiles').update({ avatar_url: url }).eq('id', A.id).select('avatar_url').single()
check('profile photo saved', p3.data?.avatar_url === url)

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
