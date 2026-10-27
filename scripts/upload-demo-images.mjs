// One-off: uploads the demo photos (Wikimedia Commons, see
// supabase/demo-image-credits.json) into Supabase Storage under the
// @chronos account's folder, so the demo never depends on outside sites.
// Usage: node scripts/upload-demo-images.mjs <folder-with-jpgs>
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const EMAIL = 'chronos-official@example.com'
const PASSWORD = env.DEMO_MEDIA_PASSWORD
if (!PASSWORD) throw new Error('Set DEMO_MEDIA_PASSWORD in .env.local first.')

let { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (error) {
  ;({ data, error } = await sb.auth.signUp({ email: EMAIL, password: PASSWORD, options: { data: { username: 'chronos' } } }))
  if (error) throw error
}
const uid = data.user.id
const dir = process.argv[2]
let ok = 0
for (const file of readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort()) {
  const { error } = await sb.storage.from('media').upload(`${uid}/demo/${file}`, readFileSync(join(dir, file)), { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' })
  if (error && !/exists|Duplicate/i.test(error.message)) console.log('FAIL', file, error.message)
  else ok++
}
console.log(JSON.stringify({ uid, uploaded: ok }))
