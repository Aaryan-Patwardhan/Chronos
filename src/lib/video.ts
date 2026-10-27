// Reel videos: checked in the browser before upload (type, size, length),
// and a cover photo is taken from the video itself.
export const MAX_VIDEO_MB = 30
export const MAX_REEL_SECONDS = 90
const TYPES: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' }

export class VideoError extends Error {}

export type PreparedVideo = {
  type: string
  ext: string
  duration: number
  aspect: number
  cover: Blob
}

/** Quick check when a file is picked. Returns a plain-English problem, or ''. */
export function checkVideoFile(file: File): string {
  if (file.type.startsWith('image/')) return 'That is a photo. To share a photo, use Post instead.'
  if (!TYPES[videoType(file)]) return 'Please choose a video (MP4, MOV or WebM).'
  const mb = file.size / 1024 / 1024
  if (mb > MAX_VIDEO_MB) return `This video is ${Math.round(mb)} MB. Reels can be up to ${MAX_VIDEO_MB} MB — a shorter clip usually fits.`
  return ''
}

// Some systems leave the type empty for .mov / .mp4 files.
function videoType(file: File) {
  if (file.type) return file.type
  if (/\.(mp4|m4v)$/i.test(file.name)) return 'video/mp4'
  if (/\.mov$/i.test(file.name)) return 'video/quicktime'
  if (/\.webm$/i.test(file.name)) return 'video/webm'
  return ''
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/** Opens the video to read its length and shape and grab a cover frame.
 *  Throws VideoError with a plain-English message if it can't be used. */
export async function prepareVideo(file: File, url: string): Promise<PreparedVideo> {
  const type = videoType(file)
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  v.src = url
  const unreadable = "We couldn't open this video. Please choose an MP4 — most phones can save or share one."
  await once(v, 'loadeddata', unreadable)
  const duration = v.duration
  if (!Number.isFinite(duration) || !v.videoWidth) throw new VideoError(unreadable)
  if (duration < 1) throw new VideoError('This video is too short. Reels need at least 1 second.')
  if (duration > MAX_REEL_SECONDS + 0.5) throw new VideoError(`This video is ${fmt(duration)} long. Reels can be up to ${MAX_REEL_SECONDS} seconds — please trim it first.`)

  v.currentTime = Math.min(0.5, duration / 3)
  await once(v, 'seeked', unreadable)
  const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(v.videoWidth * scale)
  canvas.height = Math.round(v.videoHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new VideoError(unreadable)
  ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
  const aspect = Math.max(0.3, Math.min(3.5, v.videoWidth / v.videoHeight || 0.5625))
  const cover = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85))
  v.removeAttribute('src'); v.load()
  if (!cover) throw new VideoError(unreadable)
  return { type, ext: TYPES[type], duration: Math.round(duration * 10) / 10, aspect, cover }
}

function once(v: HTMLVideoElement, event: string, message: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => done(new VideoError(message)), 15_000)
    const ok = () => done()
    const fail = () => done(new VideoError(message))
    function done(err?: Error) {
      clearTimeout(timer)
      v.removeEventListener(event, ok); v.removeEventListener('error', fail)
      if (err) reject(err); else resolve()
    }
    v.addEventListener(event, ok, { once: true })
    v.addEventListener('error', fail, { once: true })
  })
}
