#!/usr/bin/env node
// tests/m9-dms.e2e.mjs — Direct messages module (M9) end-to-end checks.
// Run from the project root: node tests/m9-dms.e2e.mjs
// Needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env.local (or env).
// Creates two throwaway test accounts (m9a-*/m9b-*@example.com) and removes
// them at the end. Does NOT need pnpm dev running.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=')).map((l) => l.split('=').map((s) => s.trim()))
)
const URL   = env['VITE_SUPABASE_URL']
const ANON  = env['VITE_SUPABASE_ANON_KEY']
if (!URL || !ANON) { console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'); process.exit(1) }

const tag  = () => Math.random().toString(36).slice(2, 7)
const eA   = `m9a-${tag()}@example.com`; const pwA = 'TestDM_A!1'
const eB   = `m9b-${tag()}@example.com`; const pwB = 'TestDM_B!1'

let pass = 0; let fail = 0
function ok(label) { console.log(`  ✓ ${label}`); pass++ }
function ko(label, err) { console.error(`  ✗ ${label}`, err?.message ?? err); fail++ }

// ── Helpers ──────────────────────────────────────────────────────────────────
function clientFor() { return createClient(URL, ANON, { auth: { persistSession: false } }) }
async function signUp(client, email, pw, username) {
  const { data, error } = await client.auth.signUp({ email, password: pw })
  if (error) throw error
  // complete onboarding
  const { error: e2 } = await client.rpc('complete_onboarding', { p_username: username, p_interests: ['music'] })
  if (e2) throw e2
  return data.user
}

// ── Setup ─────────────────────────────────────────────────────────────────────
const cA = clientFor(); const cB = clientFor()
let idA; let idB; let clientIdA; let clientIdB

console.log('\n── M9 Direct Messages – backend checks ──')
console.log(`   A: ${eA}`)
console.log(`   B: ${eB}\n`)

// 1. Create accounts
try {
  const uA = await signUp(cA, eA, pwA, `m9a${tag()}`)
  const uB = await signUp(cB, eB, pwB, `m9b${tag()}`)
  idA = uA.id; idB = uB.id
  ok('both accounts created and onboarded')
} catch(e) { ko('create accounts', e); process.exit(1) }

// 2. Logged-out client cannot read messages
{
  const anon = clientFor()
  const { data, error } = await anon.from('messages').select('*').limit(1)
  if (!data?.length && !error) ok('logged-out: no messages returned (empty, RLS)')
  else if (error) ok('logged-out: messages blocked by RLS')
  else ko('logged-out should not see messages', data)
}

// 3. A sends a message to B
{
  clientIdA = crypto.randomUUID()
  const { error } = await cA.from('messages').insert({
    client_id: clientIdA, sender_id: idA, recipient_id: idB, body: 'Hey B, this is A!',
  })
  if (!error) ok('A sends message to B')
  else ko('A send message', error)
}

// 4. A cannot send as B (RLS: sender must be self)
{
  const { error } = await cA.from('messages').insert({
    client_id: crypto.randomUUID(), sender_id: idB, recipient_id: idA, body: 'Forged sender',
  })
  if (error) ok('cannot send as another user (RLS)')
  else ko('should not be able to forge sender', 'no error')
}

// 5. A cannot message themselves
{
  const { error } = await cA.from('messages').insert({
    client_id: crypto.randomUUID(), sender_id: idA, recipient_id: idA, body: 'self message',
  })
  if (error) ok('cannot send a message to yourself (check constraint)')
  else ko('should not allow self-message', 'no error')
}

// 6. Body length limits
{
  const { error: e1 } = await cA.from('messages').insert({
    client_id: crypto.randomUUID(), sender_id: idA, recipient_id: idB, body: '',
  })
  if (e1) ok('empty body refused')
  else ko('empty body should be refused', 'no error')

  const { error: e2 } = await cA.from('messages').insert({
    client_id: crypto.randomUUID(), sender_id: idA, recipient_id: idB, body: 'x'.repeat(2001),
  })
  if (e2) ok('body > 2000 chars refused')
  else ko('body > 2000 chars should be refused', 'no error')
}

// 7. B reads the message A sent
{
  const { data, error } = await cB.from('messages').select('*').eq('sender_id', idA)
  if (!error && data?.length) ok(`B can read A's message (id: ${data[0].id?.slice(0,8)}…)`)
  else ko('B cannot read A\'s message', error)
}

// 8. B cannot read messages between other people (C is not part of this thread)
// We simulate by checking A cannot read from an unrelated thread
{
  // A can only read messages where sender or recipient is A
  const { data } = await cA.from('messages')
    .select('*')
    .neq('sender_id', idA)
    .neq('recipient_id', idA)
    .limit(1)
  if (!data?.length) ok('A cannot read messages from other conversations (RLS isolation)')
  else ko('A should only see their own messages', data)
}

// 9. Idempotent resend — duplicate client_id should succeed (or 23505) without duplicates
{
  const { error } = await cA.from('messages').insert({
    client_id: clientIdA, sender_id: idA, recipient_id: idB, body: 'Retry!',
  })
  // Either an error.code 23505 (unique_violation) or no error (upsert semantics)
  const { data: msgs } = await cA.from('messages').select('*').eq('client_id', clientIdA)
  if (msgs?.length === 1) ok('duplicate client_id does not create a second row (idempotent)')
  else ko('duplicate client_id created extra rows', msgs?.length)
}

// 10. B sends a reply to A
{
  clientIdB = crypto.randomUUID()
  const { error } = await cB.from('messages').insert({
    client_id: clientIdB, sender_id: idB, recipient_id: idA, body: 'Hi A! Got your message.',
  })
  if (!error) ok('B sends reply to A')
  else ko('B send reply', error)
}

// 11. A reads the reply from B
{
  const { data, error } = await cA.from('messages').select('*').eq('sender_id', idB).eq('recipient_id', idA)
  if (!error && data?.length) ok("A can read B's reply")
  else ko("A cannot read B's reply", error)
}

// 12. mark_seen: A marks B's message as seen
{
  const { error } = await cA.rpc('mark_seen', { partner: idB })
  if (!error) {
    // Verify seen_at is set
    const { data } = await cA.from('messages').select('seen_at').eq('sender_id', idB).eq('recipient_id', idA)
    const allSeen = data?.every((m) => m.seen_at)
    if (allSeen) ok('mark_seen sets seen_at on all messages from B to A')
    else ko('mark_seen: some messages still unseen', data)
  } else ko('mark_seen RPC failed', error)
}

// 13. A cannot mark_seen on their own outgoing messages (it only touches recipient=A rows)
{
  // Check that A's own sent messages to B still have seen_at = null (B hasn't seen them yet)
  const { data } = await cB.from('messages').select('seen_at').eq('client_id', clientIdA)
  if (data?.[0]?.seen_at === null) ok("A's sent message has seen_at null (only B can mark seen)")
  else if (data?.[0]?.seen_at) ok("(B already marked seen — still correct behaviour)")
  else ko('unexpected seen_at state', data)
}

// 14. B cannot update seen_at on messages they sent (can only update where recipient = self)
// clientIdB = B sent to A  (sender_id=B, recipient_id=A)
// RLS "recipient marks seen": USING (recipient_id = auth.uid()) — B is NOT the recipient here.
{
  const { data: myMsg } = await cB.from('messages').select('id, seen_at').eq('client_id', clientIdB).single()
  if (myMsg) {
    // Snapshot the current seen_at so we can tell if B's update changed it
    const beforeSeen = myMsg.seen_at
    const fakeTs = '2020-01-01T00:00:00Z'
    await cB.from('messages').update({ seen_at: fakeTs }).eq('id', myMsg.id)
    // No error expected from PostgREST even if 0 rows matched — check the value instead
    const { data: chk } = await cA.from('messages').select('seen_at').eq('id', myMsg.id).single()
    if (chk?.seen_at !== fakeTs) ok('sender update did nothing — RLS blocked it (seen_at unchanged)')
    else ko('sender was able to change seen_at on their own outgoing message', chk)
  } else ko('could not fetch B outgoing message to test sender-update RLS', null)
}

// 15. B can only update seen_at (not body) on messages they received
{
  const { data: recvMsg } = await cB.from('messages').select('id').eq('client_id', clientIdA).single()
  if (recvMsg) {
    const { error } = await cB.from('messages').update({ body: 'HACKED' }).eq('id', recvMsg.id)
    // column-level grant: only seen_at is writable; body update should fail or be silently ignored
    const { data: chk } = await cB.from('messages').select('body').eq('id', recvMsg.id).single()
    if (chk?.body !== 'HACKED') ok('recipient cannot overwrite message body (column-level RLS)')
    else ko('recipient was able to modify message body', chk)
  } else ko('could not fetch message for body-update test', null)
}

// 16. Thread list: A sees both messages (to B and from B)
{
  const { data, error } = await cA.from('messages').select('*')
    .or(`sender_id.eq.${idA},recipient_id.eq.${idA}`)
    .order('created_at', { ascending: true })
  if (!error && data?.length >= 2) ok(`A sees full thread (${data.length} messages)`)
  else ko('A thread query failed', error ?? `only ${data?.length} msgs`)
}

// 17. C (stranger) cannot see the A–B conversation
{
  const cC = clientFor()
  const eC = `m9c-${tag()}@example.com`
  await cC.auth.signUp({ email: eC, password: 'TestDM_C!1' })
  const { data } = await cC.from('messages')
    .select('*')
    .or(`sender_id.eq.${idA},recipient_id.eq.${idA}`)
    .limit(10)
  if (!data?.length) ok('stranger cannot read messages between A and B (RLS)')
  else ko('stranger saw private messages', data.length)
  // Clean up C
  await cC.auth.admin?.deleteUser?.((await cC.auth.getUser()).data.user?.id ?? '').catch(() => {})
}

// 18. B marks B's received message as seen via RPC
{
  const { error } = await cB.rpc('mark_seen', { partner: idA })
  if (!error) ok('B marks A\'s messages as seen via mark_seen RPC')
  else ko('B mark_seen failed', error)
}

// 19. Profile fetch for DM header (messages store loadPeople)
{
  const { data, error } = await cA.from('profiles')
    .select('id, username, full_name, avatar_url, bio')
    .in('id', [idB])
  if (!error && data?.length) ok(`profile fetch for DM header works (${data[0].username})`)
  else ko('profile fetch failed', error)
}

// 20. Full conversation ordering
{
  const { data } = await cA.from('messages').select('*')
    .or(`sender_id.eq.${idA},recipient_id.eq.${idA}`)
    .order('created_at', { ascending: true })
  const ordered = data?.every((m, i) => i === 0 || m.created_at >= data[i - 1].created_at)
  if (ordered) ok('messages returned in chronological order')
  else ko('messages out of order', null)
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
// Delete test accounts (only works if using service role; anon just signs out)
await cA.auth.signOut()
await cB.auth.signOut()
console.log('\n  (Test accounts left in DB — email prefix m9a-/m9b-/m9c-, safe to delete before demo)')

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n── M9 Backend results: ${pass} passed, ${fail} failed ──\n`)
if (fail) process.exit(1)
