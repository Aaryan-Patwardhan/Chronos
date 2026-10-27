import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { Bookmark, EyeOff, Flag, Heart, Info, MessageCircle, Ellipsis, Pencil, Send, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/time'
import { friendly } from '../lib/errors'
import { displayAspect } from '../lib/image'
import { usePostActions } from '../lib/postActions'
import Avatar from './Avatar'
import WhyModal from './WhyModal'
import PostImage from './PostImage'
import RichText from './RichText'

export type CardPost = {
  id: string
  author_id: string
  image_url: string
  /** Set for reels: the video plays, image_url is its cover. */
  video_url?: string | null
  duration?: number | null
  caption: string
  tags: string[]
  like_count: number
  comment_count: number
  created_at: string
  aspect?: number | null
  author: { username: string; avatar_url: string; full_name: string } | null
  liked?: boolean
  saved?: boolean
}

type Props = {
  post: CardPost
  surface?: 'feed' | 'explore' | 'reels'
  onHide?: (id: string) => void
  onDeleted?: (id: string) => void
}

const CAPTION_MAX = 2200

export default function PostCard({ post, surface, onHide, onDeleted }: Props) {
  const { me, liked, saved, likes, note, say, setLike, toggleSave, share, signal, remove } = usePostActions(post)
  const [menu, setMenu] = useState(false)
  const [why, setWhy] = useState(false)
  const [caption, setCaption] = useState(post.caption)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.caption)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const isMine = post.author_id === me?.id
  const isReel = !!post.video_url
  const lastTap = useRef(0)
  const [burst, setBurst] = useState(false)
  const from = surface ? `?from=${surface}` : ''

  async function saveCaption() {
    setBusy(true)
    const next = draft.trim().slice(0, CAPTION_MAX)
    const { error } = await supabase.from('posts').update({ caption: next }).eq('id', post.id)
    setBusy(false)
    if (error) return say(friendly(error, "We couldn't save the caption. Please try again."), true)
    setCaption(next); setEditing(false)
  }

  async function deletePost() {
    setBusy(true)
    const ok = await remove()
    setBusy(false)
    if (!ok) return setConfirmDelete(false)
    onDeleted?.(post.id)
  }

  // Double-tap the photo to like it (works with mouse and touch).
  function onPhotoTap() {
    const now = Date.now()
    if (now - lastTap.current < 300) {
      lastTap.current = 0
      setBurst(true); setTimeout(() => setBurst(false), 700)
      void setLike(true)
    } else lastTap.current = now
  }

  async function hide(table: 'see_less' | 'reports', message: string) {
    setMenu(false)
    if (await signal(table, message)) setTimeout(() => onHide?.(post.id), 1200)
  }

  const name = post.author?.username ?? 'unknown'
  return (
    <article className="border-b border-neutral-200 pb-3">
      <div className="flex items-center gap-3 px-4 py-3">
        <Link to={`/u/${name}`} className="flex items-center gap-3">
          <Avatar src={post.author?.avatar_url} name={name} />
          <span className="text-sm font-semibold">{name}</span>
        </Link>
        <Link to={`/p/${post.id}${from}`} className="text-xs text-neutral-500 hover:underline">· {timeAgo(post.created_at)}</Link>
        <div className="relative ml-auto">
          <button onClick={() => setMenu(!menu)} aria-label="More options" className="p-1"><Ellipsis size={20} /></button>
          {menu && (
            <>
            <button className="fixed inset-0 z-10 cursor-default" aria-label="Close menu" onClick={() => setMenu(false)} />
            <div className="absolute right-0 top-8 z-20 w-60 overflow-hidden rounded-xl border border-neutral-200 bg-white text-sm shadow-lg">
              {surface && (
                <button className="flex w-full items-center gap-2 px-4 py-3 hover:bg-neutral-50" onClick={() => { setMenu(false); setWhy(true) }}>
                  <Info size={16} /> Why am I seeing this?
                </button>
              )}
              {isMine && <>
                <button className="flex w-full items-center gap-2 px-4 py-3 hover:bg-neutral-50" onClick={() => { setMenu(false); setDraft(caption); setEditing(true) }}>
                  <Pencil size={16} /> Edit caption
                </button>
                <button className="flex w-full items-center gap-2 px-4 py-3 text-rose-600 hover:bg-neutral-50" onClick={() => { setMenu(false); setConfirmDelete(true) }}>
                  <Trash2 size={16} /> Delete {isReel ? 'reel' : 'post'}
                </button>
              </>}
              {!isMine && <>
                <button className="flex w-full items-center gap-2 px-4 py-3 hover:bg-neutral-50" onClick={() => hide('see_less', "Got it — you'll see fewer posts like this.")}>
                  <EyeOff size={16} /> See fewer posts like this
                </button>
                <button className="flex w-full items-center gap-2 px-4 py-3 text-rose-600 hover:bg-neutral-50" onClick={() => hide('reports', 'Thanks — the post was reported.')}>
                  <Flag size={16} /> Report
                </button>
              </>}
            </div>
            </>
          )}
        </div>
      </div>

      {isReel ? (
        // Reels play with controls here; the like button is next to them.
        <video src={post.video_url ?? undefined} poster={post.image_url} controls playsInline loop preload="metadata"
          aria-label={caption || `Reel by ${name}`} className="max-h-[75vh] w-full bg-black object-contain"
          style={{ aspectRatio: post.aspect ?? 9 / 16 }} />
      ) : (
      <div className="relative select-none" onPointerUp={onPhotoTap}>
        <PostImage src={post.image_url} alt={caption || `Post by ${name}`} className="w-full" style={{ aspectRatio: displayAspect(post.aspect) }} />
        {burst && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <Heart size={96} className="heart-burst fill-white text-white drop-shadow-lg" />
          </div>
        )}
      </div>
      )}

      <div className="flex items-center gap-4 px-4 pt-3">
        <button onClick={() => setLike(!liked)} aria-label={liked ? 'Unlike' : 'Like'} aria-pressed={liked}>
          <Heart size={24} className={liked ? 'fill-rose-500 text-rose-500' : ''} />
        </button>
        <Link to={`/p/${post.id}${from}#comments`} aria-label="Comments"><MessageCircle size={24} /></Link>
        <button onClick={() => share(caption)} aria-label="Share"><Send size={24} /></button>
        <button onClick={toggleSave} aria-label={saved ? 'Unsave' : 'Save'} aria-pressed={saved} className="ml-auto">
          <Bookmark size={24} className={saved ? 'fill-neutral-900' : ''} />
        </button>
      </div>
      <div className="space-y-1 px-4 pt-2 text-sm">
        {likes > 0
          ? <Link to={`/p/${post.id}/likes`} className="block font-semibold hover:underline">{likes} {likes === 1 ? 'like' : 'likes'}</Link>
          : <p className="text-neutral-500">Be the first to like this</p>}
        {editing ? (
          <div className="space-y-2">
            <textarea className="input min-h-20" value={draft} maxLength={CAPTION_MAX} onChange={(e) => setDraft(e.target.value)} aria-label="Edit caption" autoFocus />
            <div className="flex gap-2">
              <button className="btn-primary" disabled={busy} onClick={saveCaption}>{busy ? 'Saving…' : 'Save'}</button>
              <button className="btn-secondary" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : caption && <p className="whitespace-pre-line break-words"><Link to={`/u/${name}`} className="mr-1 font-semibold">{name}</Link><RichText text={caption} /></p>}
        {post.comment_count > 0 && <Link to={`/p/${post.id}${from}#comments`} className="block text-neutral-500">View {post.comment_count === 1 ? '1 comment' : `all ${post.comment_count} comments`}</Link>}
        {note && <p className="rounded-md bg-neutral-100 px-3 py-2 text-neutral-700">{note}</p>}
      </div>
      {why && surface && <WhyModal postId={post.id} surface={surface} onClose={() => setWhy(false)} />}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={() => !busy && setConfirmDelete(false)}>
          <div role="dialog" aria-label={isReel ? 'Delete reel' : 'Delete post'} className="w-full max-w-sm rounded-2xl bg-white p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold">Delete this {isReel ? 'reel' : 'post'}?</p>
            <p className="mt-1 text-sm text-neutral-500">It will be removed from your profile and {isReel ? 'from Reels' : "everyone's feed"}. This can't be undone.</p>
            <div className="mt-4 flex flex-col gap-2">
              <button className="rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={deletePost}>{busy ? 'Deleting…' : 'Delete'}</button>
              <button className="btn-secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}
