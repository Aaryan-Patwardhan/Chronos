// Settings → Edit profile: photo, name, username (live check), bio.
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, Check, Loader2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/errors'
import { useAuth } from '../store/auth'
import { ImageError, checkPhotoFile, prepareImage, storagePath } from '../lib/image'
import Avatar from '../components/Avatar'

const BIO_MAX = 150
const NAME_MAX = 50
type Availability = 'same' | 'checking' | 'ok' | 'taken' | 'invalid'

export default function EditProfile() {
  const me = useAuth((s) => s.me)
  const navigate = useNavigate()
  const [name, setName] = useState(me?.full_name === me?.username ? '' : me?.full_name ?? '')
  const [username, setUsername] = useState(me?.username ?? '')
  const [bio, setBio] = useState(me?.bio ?? '')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [available, setAvailable] = useState<Availability>('same')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!me || username === me.username) return setAvailable('same')
    if (!/^[a-z0-9_.]{3,30}$/.test(username)) return setAvailable('invalid')
    setAvailable('checking')
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('username_available', { name: username })
      setAvailable(error ? 'same' : data ? 'ok' : 'taken')
    }, 300)
    return () => clearTimeout(t)
  }, [username, me])

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  if (!me) return null

  function choosePhoto(f: File | undefined) {
    setError('')
    if (!f) return
    const problem = checkPhotoFile(f)
    if (problem) return setError(problem)
    setPhoto(f)
    setPreview(URL.createObjectURL(f))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!me) return
    if (available === 'taken' || available === 'invalid' || available === 'checking') return
    setBusy(true); setError('')
    try {
      let avatar_url = me.avatar_url
      if (photo) {
        // Phone photos are often 3–8 MB: shrink to 640 px first (a profile
        // photo is never shown larger), so any normal photo works.
        const { blob, type, ext } = await prepareImage(photo, { maxSide: 640 })
        const path = `${me.id}/avatar-${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage.from('media').upload(path, blob, { contentType: type, cacheControl: '31536000' })
        if (up.error) throw up.error
        avatar_url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
      }
      const cleanName = name.trim().slice(0, NAME_MAX) || username
      const { error } = await supabase.from('profiles')
        .update({ full_name: cleanName, username, bio: bio.trim().slice(0, BIO_MAX), avatar_url })
        .eq('id', me.id)
      if (error) throw error
      // Remove the previous photo file (only if it's one we uploaded).
      const oldPath = photo ? storagePath(me.avatar_url) : null
      if (oldPath?.startsWith(`${me.id}/avatar-`)) void supabase.storage.from('media').remove([oldPath])
      await useAuth.getState().loadProfile()
      navigate(`/u/${username}`, { replace: true })
    } catch (err) {
      setError(err instanceof ImageError ? err.message : friendly(err, "We couldn't save your profile. Please try again."))
    } finally {
      setBusy(false)
    }
  }

  const blocked = busy || available === 'taken' || available === 'invalid' || available === 'checking'
  return (
    <form onSubmit={save} className="space-y-5 p-4">
      <div className="flex items-center gap-3">
        <Link to={`/u/${me.username}`} aria-label="Back to profile"><ArrowLeft size={22} /></Link>
        <h1 className="text-lg font-semibold">Edit profile</h1>
      </div>

      <div className="flex flex-col items-center gap-2">
        {preview
          ? <img src={preview} alt="New profile photo preview" className="h-24 w-24 rounded-full object-cover"
              onError={() => { setError("We can't open that photo here. Please choose a JPG, PNG or WebP."); setPhoto(null); setPreview('') }} />
          : <Avatar src={me.avatar_url} name={me.username} size={96} />}
        <label className="cursor-pointer text-sm font-semibold text-sky-600 hover:underline">
          Change photo
          <input type="file" accept="image/*" className="hidden" onChange={(e) => choosePhoto(e.target.files?.[0])} />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-semibold">Name</span>
        <input className="input mt-1" value={name} maxLength={NAME_MAX} placeholder="Your name" onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </label>

      <label className="block">
        <span className="text-sm font-semibold">Username</span>
        <span className="mt-1 flex items-center gap-2">
          <span className="text-neutral-400">@</span>
          <input className="input" value={username} maxLength={30} autoComplete="username"
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))} />
          <span className="w-6" aria-live="polite">
            {available === 'checking' && <Loader2 size={18} className="animate-spin text-neutral-400" />}
            {available === 'ok' && <Check size={18} className="text-emerald-600" aria-label="Available" />}
            {(available === 'taken' || available === 'invalid') && <X size={18} className="text-rose-600" aria-label="Not available" />}
          </span>
        </span>
        <span className="mt-1 block text-xs text-neutral-500">
          {available === 'taken' ? 'Taken — try another.' : available === 'invalid' ? '3–30 characters: letters, numbers, "." or "_".' : ' '}
        </span>
      </label>

      <label className="block">
        <span className="flex justify-between text-sm font-semibold"><span>Bio</span><span className="font-normal text-neutral-500">{bio.length}/{BIO_MAX}</span></span>
        <textarea className="input mt-1 min-h-24" value={bio} maxLength={BIO_MAX} placeholder="Tell people a little about yourself" onChange={(e) => setBio(e.target.value)} />
      </label>

      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <button className="btn-primary w-full py-3" disabled={blocked}>{busy ? 'Saving…' : 'Save'}</button>
    </form>
  )
}
