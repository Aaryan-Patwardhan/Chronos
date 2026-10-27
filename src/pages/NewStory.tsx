// /stories/new — share a photo to your story (disappears after 24 hours).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, ImagePlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/errors'
import { ImageError, checkPhotoFile, prepareImage } from '../lib/image'
import { useAuth } from '../store/auth'
import { useStories } from '../store/stories'

const CAPTION_MAX = 200

export default function NewStory() {
  const me = useAuth((s) => s.me)
  const loadStories = useStories((s) => s.load)
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [caption, setCaption] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function choose(f: File | undefined) {
    setError('')
    if (!f) return
    const problem = checkPhotoFile(f)
    if (problem) return setError(problem)
    setFile(f); setPreview(URL.createObjectURL(f))
  }

  async function share() {
    if (!me || !file || busy) return
    setBusy(true); setError('')
    try {
      const { blob, type, ext } = await prepareImage(file)
      const path = `${me.id}/story-${crypto.randomUUID()}.${ext}`
      const up = await supabase.storage.from('media').upload(path, blob, { contentType: type, cacheControl: '86400' })
      if (up.error) throw up.error
      const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
      const { error } = await supabase.from('posts').insert({ author_id: me.id, image_url: url, caption: caption.trim().slice(0, CAPTION_MAX), type: 'story' })
      if (error) { await supabase.storage.from('media').remove([path]); throw error }
      await loadStories(me.id)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ImageError ? err.message : friendly(err, "We couldn't share your story. Please try again."))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <h1 className="text-lg font-semibold">New story</h1>
      </div>
      <label className="relative mx-auto flex aspect-[9/16] max-h-[60vh] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl bg-neutral-900 text-sm text-neutral-300">
        {preview
          ? <img src={preview} alt="Story preview" className="h-full w-full object-cover"
              onError={() => { setError("We can't open that photo here. Please choose a JPG, PNG or WebP."); setFile(null); setPreview('') }} />
          : <><ImagePlus size={44} /><span className="mt-2 font-medium">Choose a photo</span><span className="text-xs text-neutral-400">Visible for 24 hours</span></>}
        {preview && caption.trim() && <span className="absolute inset-x-3 bottom-4 text-center text-sm text-white drop-shadow">{caption}</span>}
        <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => { choose(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      <input className="input" placeholder="Add a caption (optional)" value={caption} maxLength={CAPTION_MAX} disabled={busy}
        onChange={(e) => setCaption(e.target.value)} aria-label="Story caption" />
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <button onClick={share} disabled={!file || busy} className="btn-primary w-full py-3 text-base">{busy ? 'Sharing…' : 'Share to your story'}</button>
      <p className="text-center text-xs text-neutral-500">Your story disappears after 24 hours. People you share it with can reply by message.</p>
    </div>
  )
}
