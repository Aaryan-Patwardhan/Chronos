// Turns any technical error into one short, plain-English sentence.
// Raw error text is never shown to users; it goes to the console for us.
/** Errors whose message is already written for users (from our /api). */
export class UserFacingError extends Error {}

const RULES: [RegExp, string][] = [
  [/invalid login credentials/i, "That email and password don't match. Please try again."],
  [/already registered|already exists|user_already_exists/i, 'This email already has an account. Try logging in.'],
  [/weak.?password|password should/i, 'Please choose a password with at least 6 characters.'],
  [/invalid.*email|email.*invalid|unable to validate email/i, 'Please enter a valid email address.'],
  [/email not confirmed/i, 'Please confirm your email first, then log in.'],
  [/rate limit|too many|429/i, 'Too many tries. Please wait a minute and try again.'],
  [/failed to fetch|networkerror|load failed|network request failed/i, "You seem to be offline. Check your connection and try again."],
  [/username_taken/, 'That username is taken. Try another one.'],
  [/profiles_username_key|duplicate key.*username/i, 'That username is taken. Try another one.'],
  [/profiles_username_check/i, 'Usernames can use 3–30 letters, numbers, dots or underscores.'],
  [/profiles_bio_len/i, 'Your bio can be up to 150 characters.'],
  [/profiles_full_name_len/i, 'Your name can be up to 50 characters.'],
  [/follows_check|follower_id <> followee_id/i, "You can't follow yourself."],
  [/username_invalid/, 'Usernames can use 3–30 letters, numbers, dots or underscores.'],
  [/not_logged_in|jwt|session.*(expired|missing)|please log in/i, 'Please log in again.'],
  [/signups? not allowed|signups?.*disabled/i, 'New sign-ups are paused right now. Please try again later.'],
  [/payload too large|exceeded the maximum allowed size|entity too large/i, 'That file is too big. Please choose a smaller one.'],
  [/mime type|not supported/i, "That file type isn't supported. Please choose a photo."],
]

export function friendly(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof UserFacingError) return error.message
  const raw = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : String(error ?? '')
  if (raw) console.warn('[chronos]', raw)
  for (const [pattern, text] of RULES) if (pattern.test(raw)) return text
  return fallback
}
