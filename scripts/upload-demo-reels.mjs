// One-off: uploads the demo reels (Wikimedia Commons clips cut to 9:16, see
// supabase/demo-video-credits.json) and their cover frames into Supabase
// Storage under the @chronos account's folder.
// Usage: node scripts/upload-demo-reels.mjs <folder-with-mp4-and-jpg>
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
if (!env.DEMO_MEDIA_PASSWORD) throw new Error('Set DEMO_MEDIA_PASSWORD in .env.local first.')
const { data, error } = await sb.auth.signInWithPassword({ email: 'chronos-official@example.com', password: env.DEMO_MEDIA_PASSWORD })
if (error) throw error

const uid = data.user.id
const dir = process.argv[2]
let ok = 0
for (const file of readdirSync(dir).filter((f) => f.endsWith('.mp4')).sort()) {
  const name = file.replace(/\.mp4$/, '')
  const uploads = [
    sb.storage.from('videos').upload(`${uid}/demo/${file}`, readFileSync(join(dir, file)), { contentType: 'video/mp4', cacheControl: '31536000' }),
    sb.storage.from('media').upload(`${uid}/demo/reel-${name}.jpg`, readFileSync(join(dir, `${name}.jpg`)), { contentType: 'image/jpeg', cacheControl: '31536000' }),
  ]
  const failed = (await Promise.all(uploads)).filter((r) => r.error && !/exists|Duplicate/i.test(r.error.message))
  if (failed.length) console.log('FAIL', file, failed.map((r) => r.error.message).join('; '))
  else ok++
}
console.log(JSON.stringify({ uid, uploaded: ok }))
