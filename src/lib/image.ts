// Shrinks a photo in the browser before upload: max 1440 px on the long
// side, JPEG ~85 %. A 6 MB phone photo usually becomes ~300–600 KB, so
// posting is fast on mobile data. GIFs are kept as-is (to keep animation).
export const MAX_INPUT_MB = 20
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const MAX_SIDE = 1440

export class ImageError extends Error {}

export async function prepareImage(file: File): Promise<{ blob: Blob; type: string; ext: string }> {
  if (!file.type.startsWith('image/')) throw new ImageError('Please choose a photo (JPG, PNG, WebP or GIF).')
  if (file.size > MAX_INPUT_MB * 1024 * 1024) throw new ImageError(`That photo is larger than ${MAX_INPUT_MB} MB. Please choose a smaller one.`)
  if (file.type === 'image/gif') {
    if (file.size > MAX_UPLOAD_BYTES) throw new ImageError('GIFs can be up to 5 MB. Please choose a smaller one.')
    return { blob: file, type: 'image/gif', ext: 'gif' }
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new ImageError("We can't open that photo here. Please choose a JPG, PNG or WebP.")
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new ImageError("We couldn't prepare that photo. Please try another one.")
  if (blob.size > MAX_UPLOAD_BYTES) throw new ImageError('That photo is too large even after resizing. Please choose another one.')
  return { blob, type: 'image/jpeg', ext: 'jpg' }
}

/** Storage path of a file in our "media" bucket, from its public URL. */
export function storagePath(url: string): string | null {
  const marker = '/storage/v1/object/public/media/'
  const i = url.indexOf(marker)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length))
}
