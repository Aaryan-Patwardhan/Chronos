// One full-screen reel. Plays only while it's the one on screen.
// Tap: pause / play · double-tap: like · the side buttons work like a post's.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Bookmark, Ellipsis, EyeOff, Flag, Heart, Info, Link2, Loader2, MessageCircle, Play, Send, Trash2, Volume2, VolumeX } from 'lucide-react'
import type { CardPost } from './PostCard'
import Avatar from './Avatar'
import FollowButton from './FollowButton'
import RichText from './RichText'
import WhyModal from './WhyModal'
import { usePostActions } from '../lib/postActions'
import { formatCount } from '../lib/format'

type Props = {
  reel: CardPost
  active: boolean
  /** Keep the video loaded (the reel just above or below). */
  warm: boolean
  muted: boolean
  onMute: (muted: boolean) => void
  following: boolean
  onFollow: (authorId: string, following: boolean) => void
  onGone: (id: string) => void
}

export default function ReelItem({ reel, active, warm, muted, onMute, following, onFollow, onGone }: Props) {
  const { me, liked, saved, likes, note, say, setLike, toggleSave, share, signal, remove } = usePostActions(reel)
  const video = useRef<HTMLVideoElement>(null)
  const [paused, setPaused] = useState(false)
  const [waiting, setWaiting] = useState(true)
  const [failed, setFailed] = useState(false)
  const [progress, setProgress] = useState(0)
  const [burst, setBurst] = useState(false)
  const [menu, setMenu] = useState(false)
  const [why, setWhy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [more, setMore] = useState(false)
  const tapTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastTap = useRef(0)
  const name = reel.author?.username ?? 'unknown'
  const isMine = reel.author_id === me?.id

  // Play from the start when this reel comes on screen; stop when it leaves.
  useEffect(() => {
    const v = video.current
    if (!v) return
    if (active) {
      v.currentTime = 0
      setPaused(false)
      v.play().catch((e: Error) => {
        // Browsers block autoplay with sound until the page is tapped.
        if (e.name === 'NotAllowedError' && !v.muted) { onMute(true); v.muted = true; void v.play().catch(() => setPaused(true)) }
      })
    } else {
      v.pause()
    }
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (video.current) video.current.muted = muted }, [muted])

  function togglePlay() {
    const v = video.current
    if (!v || failed) return
    if (v.paused) { void v.play(); setPaused(false) } else { v.pause(); setPaused(true) }
  }

  // Single tap waits a moment so a double-tap can be a like instead.
  function onTap() {
    const now = Date.now()
    if (now - lastTap.current < 280) {
      clearTimeout(tapTimer.current)
      lastTap.current = 0
      setBurst(true); setTimeout(() => setBurst(false), 700)
      void setLike(true)
      return
    }
    lastTap.current = now
    tapTimer.current = setTimeout(togglePlay, 280)
  }
  useEffect(() => () => clearTimeout(tapTimer.current), [])

  async function hide(table: 'see_less' | 'reports', message: string) {
    setMenu(false)
    if (await signal(table, message)) setTimeout(() => onGone(reel.id), 1200)
  }

  async function deleteReel() {
    setDeleting(true)
    const ok = await remove()
    setDeleting(false); setConfirmDelete(false)
    if (ok) onGone(reel.id)
  }

  const caption = reel.caption.trim()
  return (
    <section className="relative h-full w-full snap-start snap-always overflow-hidden bg-black text-white" aria-label={`Reel by ${name}`}>
      <video
        ref={video}
        src={active || warm ? reel.video_url ?? undefined : undefined}
        poster={reel.image_url}
        muted={muted}
        loop
        playsInline
        preload={active || warm ? 'auto' : 'none'}
        className={`absolute inset-0 h-full w-full ${(reel.aspect ?? 0.5625) < 0.75 ? 'object-cover' : 'object-contain'}`}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => { setWaiting(false); setFailed(false) }}
        onCanPlay={() => setWaiting(false)}
        onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProgress(v.currentTime / v.duration) }}
        onError={() => { if (active || warm) { setFailed(true); setWaiting(false) } }}
      />

      {/* Tap layer (under the buttons) */}
      <button className="absolute inset-0 h-full w-full cursor-default" onClick={onTap}
        aria-label={paused ? 'Play reel' : 'Pause reel'} />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 to-transparent" />

      {active && waiting && !failed && !paused && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" role="status" aria-label="Loading reel">
          <Loader2 size={40} className="animate-spin text-white/80" />
        </div>
      )}
      {paused && !failed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/40 p-4"><Play size={40} className="fill-white" /></span>
        </div>
      )}
      {failed && (
        <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-xl bg-black/70 p-4 text-center text-sm">
          This reel couldn't play. Check your connection and try again.
          <button className="mt-3 block w-full rounded-lg bg-white py-2 font-semibold text-neutral-900"
            onClick={() => { setFailed(false); setWaiting(true); video.current?.load(); void video.current?.play().catch(() => {}) }}>Try again</button>
        </div>
      )}
      {burst && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <Heart size={110} className="heart-burst fill-white text-white drop-shadow-lg" />
        </div>
      )}

      <button onClick={() => onMute(!muted)} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
        className="absolute right-3 top-14 rounded-full bg-black/45 p-2">
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      {/* Side buttons */}
      <div className="absolute bottom-6 right-2 flex flex-col items-center gap-4 text-xs font-medium [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
        <button onClick={() => setLike(!liked)} aria-label={liked ? 'Unlike' : 'Like'} aria-pressed={liked} className="flex flex-col items-center gap-1 p-1">
          <Heart size={28} className={liked ? 'fill-rose-500 text-rose-500' : ''} />{formatCount(likes)}
        </button>
        <Link to={`/p/${reel.id}?from=reels#comments`} aria-label="Comments" className="flex flex-col items-center gap-1 p-1">
          <MessageCircle size={28} />{formatCount(reel.comment_count)}
        </Link>
        <button onClick={() => share()} aria-label="Share" className="p-1"><Send size={26} /></button>
        <button onClick={toggleSave} aria-label={saved ? 'Unsave' : 'Save'} aria-pressed={saved} className="p-1">
          <Bookmark size={26} className={saved ? 'fill-white' : ''} />
        </button>
        <button onClick={() => setMenu(true)} aria-label="More options" className="p-1"><Ellipsis size={26} /></button>
      </div>

      {/* Author and caption */}
      <div className="absolute bottom-6 left-3 right-16 space-y-2 [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
        <div className="flex items-center gap-2">
          <Link to={`/u/${name}`} className="flex min-w-0 items-center gap-2">
            <Avatar src={reel.author?.avatar_url} name={name} size={32} />
            <span className="truncate text-sm font-semibold">{name}</span>
          </Link>
          {!isMine && <FollowButton key={String(following)} userId={reel.author_id} initial={following} size="sm" tone="dark"
            onChange={(f) => onFollow(reel.author_id, f)} />}
        </div>
        {caption && (
          <button onClick={() => setMore(!more)} className={`block text-left text-sm ${more ? '' : 'line-clamp-2'}`} aria-expanded={more}>
            {more ? <RichText text={caption} /> : caption}
          </button>
        )}
        {note && <p role="status" className="rounded-md bg-black/70 px-3 py-2 text-sm">{note}</p>}
      </div>

      {/* Progress */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/25" aria-hidden>
        <div className="h-full bg-white" style={{ width: `${progress * 100}%` }} />
      </div>

      {menu && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={() => setMenu(false)}>
          <div role="menu" className="w-full max-w-xl overflow-hidden rounded-t-2xl bg-white pb-4 text-sm text-neutral-900" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto my-2 h-1 w-10 rounded-full bg-neutral-300" />
            <button role="menuitem" className="flex w-full items-center gap-3 px-5 py-3 hover:bg-neutral-50" onClick={() => { setMenu(false); setWhy(true) }}>
              <Info size={18} /> Why am I seeing this?
            </button>
            <button role="menuitem" className="flex w-full items-center gap-3 px-5 py-3 hover:bg-neutral-50"
              onClick={async () => { setMenu(false); try { await navigator.clipboard.writeText(`${location.origin}/p/${reel.id}`); say('Link copied.') } catch { say(`${location.origin}/p/${reel.id}`, true) } }}>
              <Link2 size={18} /> Copy link
            </button>
            {isMine ? (
              <button role="menuitem" className="flex w-full items-center gap-3 px-5 py-3 text-rose-600 hover:bg-neutral-50" onClick={() => { setMenu(false); setConfirmDelete(true) }}>
                <Trash2 size={18} /> Delete reel
              </button>
            ) : <>
              <button role="menuitem" className="flex w-full items-center gap-3 px-5 py-3 hover:bg-neutral-50" onClick={() => hide('see_less', "Got it — you'll see fewer reels like this.")}>
                <EyeOff size={18} /> See fewer reels like this
              </button>
              <button role="menuitem" className="flex w-full items-center gap-3 px-5 py-3 text-rose-600 hover:bg-neutral-50" onClick={() => hide('reports', 'Thanks — the reel was reported.')}>
                <Flag size={18} /> Report
              </button>
            </>}
            <button className="mt-1 w-full px-5 py-3 font-semibold text-neutral-500" onClick={() => setMenu(false)}>Cancel</button>
          </div>
        </div>
      )}
      {why && <div className="text-neutral-900"><WhyModal postId={reel.id} surface="reels" onClose={() => setWhy(false)} /></div>}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6" onClick={() => !deleting && setConfirmDelete(false)}>
          <div role="dialog" aria-label="Delete reel" className="w-full max-w-sm rounded-2xl bg-white p-5 text-center text-neutral-900" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold">Delete this reel?</p>
            <p className="mt-1 text-sm text-neutral-500">It will be removed from your profile and from Reels. This can't be undone.</p>
            <div className="mt-4 flex flex-col gap-2">
              <button className="rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={deleting} onClick={deleteReel}>{deleting ? 'Deleting…' : 'Delete'}</button>
              <button className="btn-secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
