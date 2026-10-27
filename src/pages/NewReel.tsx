// Create a reel: choose a video (checked in the browser: type, size, up to
// 90 s), a cover is taken from the video, then caption and topics.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Clapperboard, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { friendly } from '../lib/errors'
import { MAX_REEL_SECONDS, MAX_VIDEO_MB, VideoError, checkVideoFile, prepareVideo, type PreparedVideo } from '../lib/video'
import { INTERESTS } from '../lib/interests'

const CAPTION_MAX = 2200
const TAGS_MAX = 5

export default function NewReel() {
  const me = useAuth((s) => s.me)
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [video, setVideo] = useState<PreparedVideo | null>(null)
  const [caption, setCaption] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  const [error, setError] = useState('')
  const [step, setStep] = useState<'' | 'checking' | 'uploading' | 'saving'>('')

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  async function choose(f: File | undefined) {
    setError('')
    if (!f) return
    const problem = checkVideoFile(f)
    if (problem) return setError(problem)
    const url = URL.createObjectURL(f)
    setStep('checking')
    try {
      const prepared = await prepareVideo(f, url)
      setFile(f); setVideo(prepared); setPreview(url)
    } catch (err) {
      URL.revokeObjectURL(url)
      setError(err instanceof VideoError ? err.message : "We couldn't open this video. Please try another one.")
    }
    setStep('')
  }

  function clear() { setFile(null); setVideo(null); setPreview('') }

  const hashtags = [...caption.matchAll(/#([a-z0-9_]+)/gi)].map((m) => m[1].toLowerCase())
  const allTags = [...new Set([...topics, ...hashtags])].slice(0, TAGS_MAX)

  function toggleTopic(tag: string) {
    setTopics((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : t.length >= TAGS_MAX ? t : [...t, tag]))
  }

  async function share(e: React.FormEvent) {
    e.preventDefault()
    if (!me) return
    if (!file || !video) return setError('Choose a video first.')
    setError('')
    const id = crypto.randomUUID()
    const videoPath = `${me.id}/${id}.${video.ext}`
    const coverPath = `${me.id}/${id}-cover.jpg`
    const cleanUp = () => Promise.all([
      supabase.storage.from('videos').remove([videoPath]),
      supabase.storage.from('media').remove([coverPath]),
    ])
    try {
      setStep('uploading')
      const [up, cover] = await Promise.all([
        supabase.storage.from('videos').upload(videoPath, file, { contentType: video.type, cacheControl: '31536000' }),
        supabase.storage.from('media').upload(coverPath, video.cover, { contentType: 'image/jpeg', cacheControl: '31536000' }),
      ])
      if (up.error || cover.error) { await cleanUp(); throw up.error ?? cover.error }
      setStep('saving')
      const { data, error } = await supabase.from('posts').insert({
        author_id: me.id, type: 'reel',
        video_url: supabase.storage.from('videos').getPublicUrl(videoPath).data.publicUrl,
        image_url: supabase.storage.from('media').getPublicUrl(coverPath).data.publicUrl,
        duration: video.duration, aspect: video.aspect,
        caption: caption.trim().slice(0, CAPTION_MAX), tags: allTags,
      }).select('id').single()
      if (error) { await cleanUp(); throw error }
      navigate(`/p/${data.id}`)
    } catch (err) {
      setError(friendly(err, "We couldn't share your reel. Please try again."))
      setStep('')
    }
  }

  const busy = step !== ''
  const label = step === 'checking' ? 'Checking video…' : step === 'uploading' ? 'Uploading video…' : step === 'saving' ? 'Sharing…' : 'Share reel'
  return (
    <form onSubmit={share} className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">New reel</h1>

      <div className="relative mx-auto w-full max-w-[280px]">
        {preview ? (
          <video src={preview} autoPlay muted loop playsInline aria-label="Selected video preview"
            className="aspect-[9/16] w-full rounded-xl bg-black object-contain" />
        ) : (
          <label className={`flex aspect-[9/16] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 px-4 text-center text-sm text-neutral-500 ${busy ? 'opacity-60' : 'hover:border-neutral-500'}`}>
            <Clapperboard size={44} />
            <span className="mt-2 font-medium">{step === 'checking' ? 'Checking video…' : 'Choose a video'}</span>
            <span className="text-xs">MP4, MOV or WebM · up to {MAX_REEL_SECONDS} seconds and {MAX_VIDEO_MB} MB</span>
            <input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" className="sr-only" disabled={busy}
              onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        )}
        {preview && !busy && (
          <button type="button" onClick={clear} aria-label="Remove video"
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"><X size={16} /></button>
        )}
        {video && <p className="mt-1 text-center text-xs text-neutral-500">{Math.round(video.duration)} seconds · the first frame becomes the cover</p>}
      </div>

      <label className="block">
        <span className="flex justify-between text-sm font-semibold"><span>Caption</span><span className="font-normal text-neutral-500">{caption.length}/{CAPTION_MAX}</span></span>
        <textarea className="input mt-1 min-h-20" placeholder="Write a caption… #hashtags become topics" value={caption} maxLength={CAPTION_MAX} disabled={busy} onChange={(e) => setCaption(e.target.value)} />
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
      {step === 'uploading' && <p className="text-center text-xs text-neutral-500">Videos take a little longer — keep this page open.</p>}
      <button className="btn-primary w-full py-3 text-base" disabled={busy || !file}>{label}</button>
    </form>
  )
}
