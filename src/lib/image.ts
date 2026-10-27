// Shrinks a photo in the browser before upload: max 1440 px (posts,
// stories) or 640 px (profile photos) on the long side, JPEG ~85 %. A 6 MB phone photo usually becomes ~300–600 KB, so
// posting is fast on mobile data. GIFs are kept as-is (to keep animation).
export const MAX_INPUT_MB = 20
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export class ImageError extends Error {}

/** maxSide: longest side in pixels (1440 for posts/stories, 640 for profile photos). */
export async function prepareImage(file: File, { maxSide = 1440 }: { maxSide?: number } = {}): Promise<{ blob: Blob; type: string; ext: string; aspect: number | null }> {
  if (!file.type.startsWith('image/')) throw new ImageError('Please choose a photo (JPG, PNG, WebP or GIF).')
  if (file.size > MAX_INPUT_MB * 1024 * 1024) throw new ImageError(`That photo is larger than ${MAX_INPUT_MB} MB. Please choose a smaller one.`)
  if (file.type === 'image/gif') {
    if (file.size > MAX_UPLOAD_BYTES) throw new ImageError('GIFs can be up to 5 MB. Please choose a smaller one.')
    return { blob: file, type: 'image/gif', ext: 'gif', aspect: null }
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new ImageError("We can't open that photo here. Please choose a JPG, PNG or WebP.")
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  // JPEG has no transparency: paint white first, or transparent PNGs turn black.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new ImageError("We couldn't prepare that photo. Please try another one.")
  if (blob.size > MAX_UPLOAD_BYTES) throw new ImageError('That photo is too large even after resizing. Please choose another one.')
  // Panoramas can be 8:1; the database keeps the shape within 0.3–3.5
  // (the feed never shows wider than 1.91:1 or taller than 4:5 anyway).
  const aspect = Math.min(3.5, Math.max(0.3, canvas.width / canvas.height))
  return { blob, type: 'image/jpeg', ext: 'jpg', aspect: Math.round(aspect * 1000) / 1000 }
}

/** Storage path of a file in our "media" bucket, from its public URL. */
export function storagePath(url: string): string | null {
  const marker = '/storage/v1/object/public/media/'
  const i = url.indexOf(marker)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length))
}

/** Quick check when a file is picked. Returns a plain-English problem, or ''. */
export function checkPhotoFile(file: File): string {
  if (/\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type)) {
    return "iPhone HEIC photos can't be opened here. Choose a JPG or PNG, or on your iPhone set Camera → Formats → Most Compatible."
  }
  if (!file.type.startsWith('image/')) return 'Please choose a photo (JPG, PNG, WebP or GIF).'
  if (file.size > MAX_INPUT_MB * 1024 * 1024) return `That photo is larger than ${MAX_INPUT_MB} MB. Please choose a smaller one.`
  return ''
}

/** Feed display shape: like Instagram, between 4:5 (portrait) and 1.91:1. */
export const displayAspect = (aspect: number | null | undefined) => Math.min(1.91, Math.max(0.8, aspect ?? 1))
