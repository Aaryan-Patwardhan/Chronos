import { createClient } from '@supabase/supabase-js'
import { UserFacingError } from './errors'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

/** Calls one of our server functions (/api/...) with the user's login token. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  })
  const body = await res.json().catch(() => ({}))
  // Our /api only returns plain-English messages; anything else becomes generic.
  if (!res.ok) throw body.error && res.status < 500 ? new UserFacingError(body.error) : new Error(`api ${res.status}`)
  return body as T
}
