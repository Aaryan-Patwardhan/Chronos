// Module 1 (login + accounts) — backend checks against the real Supabase
// project. Creates two throwaway test accounts. Run: node tests/m1-accounts.e2e.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const URL_ = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

const stamp = Date.now().toString(36)
const A = { email: `m1a-${stamp}@example.com`, password: 'test-pass-123' }
const B = { email: `m1b-${stamp}@example.com`, password: 'test-pass-456' }

// 1. Sign up returns a session immediately (email confirmation is off).
const a = client()
const su = await a.auth.signUp(A)
check('sign up creates an account', !su.error, su.error?.message)
check('sign up logs in immediately (no email confirmation)', !!su.data.session, su.data.session ? '' : 'no session — "Confirm email" is ON in Supabase')
if (!su.data.session) { console.log('\nStopping: no session after sign-up.'); process.exit(1) }
const aId = su.data.user.id

// 2. Profile created by the trigger, not yet onboarded.
const prof = await a.from('profiles').select('*').eq('id', aId).single()
check('profile row created on sign-up', !!prof.data, prof.error?.message)
check('new profile starts not onboarded', prof.data?.onboarded === false)
check('username derived from email', prof.data?.username?.startsWith('m1a'), prof.data?.username)

// 3. Duplicate sign-up is refused (error or no identities).
const dup = await client().auth.signUp(A)
check('second sign-up with same email is refused', !!dup.error || dup.data.user?.identities?.length === 0, dup.error?.message ?? 'identities=0')

// 4. Username checks.
const takenName = (await a.from('profiles').select('username').eq('is_demo', true).limit(1).single()).data.username
const av1 = await a.rpc('username_available', { name: takenName })
check('taken username reported as unavailable', av1.data === false, `${takenName} → ${av1.data}`)
const av2 = await a.rpc('username_available', { name: `fresh_${stamp}` })
check('free username reported as available', av2.data === true)
const av3 = await a.rpc('username_available', { name: 'Bad Name!' })
check('invalid username reported as unavailable', av3.data === false)

// 5. complete_onboarding: rejects invalid / taken, accepts valid.
const ob1 = await a.rpc('complete_onboarding', { p_username: 'no', p_interests: ['food', 'tech', 'art'] })
check('onboarding rejects invalid username', ob1.error?.message === 'username_invalid', ob1.error?.message)
const ob2 = await a.rpc('complete_onboarding', { p_username: takenName, p_interests: ['food', 'tech', 'art'] })
check('onboarding rejects taken username', ob2.error?.message === 'username_taken', ob2.error?.message)
const nameA = `tester_a_${stamp}`.slice(0, 30)
const ob3 = await a.rpc('complete_onboarding', { p_username: nameA, p_interests: ['food', 'tech', 'art'] })
check('onboarding succeeds with valid input', !ob3.error, ob3.error?.message)
const after = (await a.from('profiles').select('*').eq('id', aId).single()).data
check('profile updated (username, interests, onboarded)', after.username === nameA && after.onboarded && after.interests.length === 3)
const follows = await a.from('follows').select('followee_id, profiles!follows_followee_id_fkey(interests)').eq('follower_id', aId)
check('cold start: auto-follows demo accounts (1–6)', follows.data?.length >= 1 && follows.data.length <= 6, `${follows.data?.length} follows`)
check('auto-follows share an interest', follows.data?.every((f) => f.profiles.interests.some((t) => ['food', 'tech', 'art'].includes(t))))

// 6. Log out → wrong password refused → right password works.
await a.auth.signOut()
const bad = await client().auth.signInWithPassword({ email: A.email, password: 'wrong-pass' })
check('wrong password refused', !!bad.error, bad.error?.message)
const good = await a.auth.signInWithPassword(A)
check('correct password logs in', !!good.data.session, good.error?.message)

// 7. Security (RLS) with a second account.
const b = client()
const sub = await b.auth.signUp(B)
const bId = sub.data.user.id
await b.rpc('complete_onboarding', { p_username: `tester_b_${stamp}`.slice(0, 30), p_interests: ['music', 'pets', 'travel'] })
const hijack = await b.from('profiles').update({ bio: 'hacked' }).eq('id', aId).select()
check("B cannot edit A's profile", (hijack.data ?? []).length === 0)
const bioA = (await a.from('profiles').select('bio').eq('id', aId).single()).data.bio
check("A's profile unchanged", bioA !== 'hacked')
const fakeFollow = await b.from('follows').insert({ follower_id: aId, followee_id: bId })
check('B cannot create a follow on behalf of A', !!fakeFollow.error)
await a.from('saves').insert({ user_id: aId, post_id: (await a.from('posts').select('id').limit(1).single()).data.id })
const peek = await b.from('saves').select('*').eq('user_id', aId)
check("B cannot read A's saves", (peek.data ?? []).length === 0)
const anonRead = await client().from('profiles').select('id').limit(1)
check('logged-out visitors cannot read profiles', (anonRead.data ?? []).length === 0, anonRead.error?.code ?? 'empty')
const anonRpc = await client().rpc('complete_onboarding', { p_username: 'x_anon', p_interests: [] })
check('logged-out visitors cannot call onboarding', !!anonRpc.error)

// Clean up: test accounts stay in auth (no admin key) but are clearly named.
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
console.log(JSON.stringify({ A: A.email, B: B.email, aId, bId }))
process.exit(failed.length ? 1 : 0)
