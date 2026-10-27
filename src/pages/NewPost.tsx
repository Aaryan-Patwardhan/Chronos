// Create a post: choose a photo (shrunk in the browser), caption, topics.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ImagePlus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { friendly } from '../lib/errors'
import { ImageError, MAX_INPUT_MB, prepareImage } from '../lib/image'
import { INTERESTS } from '../lib/interests'

const CAPTION_MAX = 2200
const TAGS_MAX = 5

export default function NewPost() {
  const me = useAuth((s) => s.me)
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [caption, setCaption] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  const [error, setError] = useState('')
  const [step, setStep] = useState<'' | 'preparing' | 'uploading' | 'saving'>('')

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function choose(f: File | undefined) {
    setError('')
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('Please choose a photo (JPG, PNG, WebP or GIF).')
    if (f.size > MAX_INPUT_MB * 1024 * 1024) return setError(`That photo is larger than ${MAX_INPUT_MB} MB. Please choose a smaller one.`)
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const hashtags = [...caption.matchAll(/#([a-z0-9_]+)/gi)].map((m) => m[1].toLowerCase())
  const allTags = [...new Set([...topics, ...hashtags])].slice(0, TAGS_MAX)

  function toggleTopic(tag: string) {
    setTopics((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : t.length >= TAGS_MAX ? t : [...t, tag]))
  }

  async function share(e: React.FormEvent) {
    e.preventDefault()
    if (!me) return
    if (!file) return setError('Choose a photo first.')
    setError('')
    try {
      setStep('preparing')
      const { blob, type, ext } = await prepareImage(file)
      setStep('uploading')
      const path = `${me.id}/${crypto.randomUUID()}.${ext}`
      const up = await supabase.storage.from('media').upload(path, blob, { contentType: type, cacheControl: '31536000' })
      if (up.error) throw up.error
      const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
      setStep('saving')
      const { data, error } = await supabase.from('posts')
        .insert({ author_id: me.id, image_url: url, caption: caption.trim().slice(0, CAPTION_MAX), tags: allTags })
        .select('id').single()
      if (error) {
        await supabase.storage.from('media').remove([path])
        throw error
      }
      navigate(`/p/${data.id}`)
    } catch (err) {
      setError(err instanceof ImageError ? err.message : friendly(err, "We couldn't share your post. Please try again."))
      setStep('')
    }
  }

  const busy = step !== ''
  const label = step === 'preparing' ? 'Preparing photo…' : step === 'uploading' ? 'Uploading…' : step === 'saving' ? 'Sharing…' : 'Share'
  return (
    <form onSubmit={share} className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">New post</h1>

      <div className="relative">
        <label className={`flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-neutral-50 text-sm text-neutral-500 ${preview ? 'border-transparent' : 'border-neutral-300 hover:border-neutral-500'}`}>
          {preview
            ? <img src={preview} alt="Selected photo preview" className="h-full w-full object-cover" />
            : <><ImagePlus size={44} /><span className="mt-2 font-medium">Choose a photo</span><span className="text-xs">JPG, PNG, WebP or GIF</span></>}
          <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => { choose(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        {preview && !busy && (
          <button type="button" onClick={() => { setFile(null); setPreview('') }} aria-label="Remove photo"
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"><X size={16} /></button>
        )}
      </div>

      <label className="block">
        <span className="flex justify-between text-sm font-semibold"><span>Caption</span><span className="font-normal text-neutral-500">{caption.length}/{CAPTION_MAX}</span></span>
        <textarea className="input mt-1 min-h-24" placeholder="Write a caption… #hashtags become topics" value={caption} maxLength={CAPTION_MAX} disabled={busy} onChange={(e) => setCaption(e.target.value)} />
      </label>

      <div>
        <p className="text-sm font-semibold">Topics <span className="font-normal text-neutral-500">· helps the right people find it (up to {TAGS_MAX})</span></p>
        <div className="mt-2 flex flex-wrap gap-2">
          {INTERESTS.map((i) => {
            const on = topics.includes(i.tag)
            return (
              <button key={i.tag} type="button" onClick={() => toggleTopic(i.tag)} aria-pressed={on} disabled={busy}
                className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white hover:border-neutral-500'}`}>
                {i.emoji} {i.label}
              </button>
            )
          })}
        </div>
        {allTags.length > 0 && <p className="mt-2 text-xs text-neutral-500">Will be tagged: {allTags.map((t) => `#${t}`).join(' ')}</p>}
      </div>

      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <button className="btn-primary w-full py-3 text-base" disabled={busy || !file}>{label}</button>
    </form>
  )
}
