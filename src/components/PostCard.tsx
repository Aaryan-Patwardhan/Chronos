import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { Bookmark, EyeOff, Flag, Heart, Info, MessageCircle, Ellipsis, Pencil, Send, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/time'
import { friendly } from '../lib/errors'
import { storagePath } from '../lib/image'
import { useAuth } from '../store/auth'
import Avatar from './Avatar'
import WhyModal from './WhyModal'
import PostImage from './PostImage'

export type CardPost = {
  id: string
  author_id: string
  image_url: string
  caption: string
  tags: string[]
  like_count: number
  comment_count: number
  created_at: string
  author: { username: string; avatar_url: string; full_name: string } | null
  liked?: boolean
  saved?: boolean
}

type Props = {
  post: CardPost
  surface?: 'feed' | 'explore'
  onHide?: (id: string) => void
  onDeleted?: (id: string) => void
}

const CAPTION_MAX = 2200

export default function PostCard({ post, surface, onHide, onDeleted }: Props) {
  const me = useAuth((s) => s.me)
  const [liked, setLiked] = useState(!!post.liked)
  const [saved, setSaved] = useState(!!post.saved)
  const [likes, setLikes] = useState(post.like_count)
  const [menu, setMenu] = useState(false)
  const [why, setWhy] = useState(false)
  const [note, setNote] = useState('')
  const [caption, setCaption] = useState(post.caption)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.caption)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const isMine = post.author_id === me?.id
  const likeBusy = useRef(false)
  const saveBusy = useRef(false)
  const lastTap = useRef(0)
  const [burst, setBurst] = useState(false)
  const from = surface ? `?from=${surface}` : ''

  async function saveCaption() {
    setBusy(true)
    const next = draft.trim().slice(0, CAPTION_MAX)
    const { error } = await supabase.from('posts').update({ caption: next }).eq('id', post.id)
    setBusy(false)
    if (error) return setNote(friendly(error, "We couldn't save the caption. Please try again."))
    setCaption(next); setEditing(false)
  }

  async function deletePost() {
    setBusy(true)
    const { error } = await supabase.from('posts').delete().eq('id', post.id)
    if (error) { setBusy(false); setConfirmDelete(false); return setNote(friendly(error, "We couldn't delete the post. Please try again.")) }
    const path = storagePath(post.image_url)
    if (path && me && path.startsWith(`${me.id}/`)) await supabase.storage.from('media').remove([path])
    setBusy(false)
    onDeleted?.(post.id)
  }

  // One like request at a time, so a quick like→unlike can't reach the
  // server in the wrong order. The count corrects itself if the server
  // already had (or didn't have) this like.
  async function setLike(next: boolean) {
    if (!me || likeBusy.current || next === liked) return
    likeBusy.current = true
    setLiked(next); setLikes((n) => n + (next ? 1 : -1))
    const res = next
      ? await supabase.from('likes').insert({ user_id: me.id, post_id: post.id })
      : await supabase.from('likes').delete().eq('user_id', me.id).eq('post_id', post.id).select('post_id')
    likeBusy.current = false
    if (next && res.error?.code === '23505') return setLikes((n) => n - 1)
    if (!next && !res.error && (res.data ?? []).length === 0) return setLikes((n) => n + 1)
    if (res.error) {
      setLiked(!next); setLikes((n) => n + (next ? -1 : 1))
      setNote(friendly(res.error, "We couldn't update the like. Please try again."))
    }
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

  async function toggleSave() {
    if (!me || saveBusy.current) return
    saveBusy.current = true
    const next = !saved
    setSaved(next)
    const { error } = next
      ? await supabase.from('saves').insert({ user_id: me.id, post_id: post.id })
      : await supabase.from('saves').delete().eq('user_id', me.id).eq('post_id', post.id)
    saveBusy.current = false
    if (error && error.code !== '23505') {
      setSaved(!next)
      return setNote(friendly(error, "We couldn't update your saved posts. Please try again."))
    }
    if (next) { setNote('Saved. Find it on your profile under Saved.'); setTimeout(() => setNote(''), 2500) }
  }

  async function signal(table: 'see_less' | 'reports', message: string) {
    if (!me) return
    setMenu(false)
    const { error } = await supabase.from(table).insert({ user_id: me.id, post_id: post.id })
    if (error && error.code !== '23505') return setNote(friendly(error, "We couldn't save that. Please try again."))
    setNote(message)
    setTimeout(() => onHide?.(post.id), 1200)
  }

  // Phone share sheet when available, otherwise copy the link.
  async function share() {
    const url = `${location.origin}/p/${post.id}`
    if (navigator.share) {
      try { await navigator.share({ title: `Post by ${post.author?.username ?? 'Chronos'}`, text: caption.slice(0, 100), url }); return }
      catch (e) { if ((e as Error).name === 'AbortError') return }
    }
    try { await navigator.clipboard.writeText(url); setNote('Link copied.') } catch { setNote(url) }
    setTimeout(() => setNote(''), 2000)
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
                  <Trash2 size={16} /> Delete post
                </button>
              </>}
              {!isMine && <>
                <button className="flex w-full items-center gap-2 px-4 py-3 hover:bg-neutral-50" onClick={() => signal('see_less', "Got it — you'll see fewer posts like this.")}>
                  <EyeOff size={16} /> See fewer posts like this
                </button>
                <button className="flex w-full items-center gap-2 px-4 py-3 text-rose-600 hover:bg-neutral-50" onClick={() => signal('reports', 'Thanks — the post was reported.')}>
                  <Flag size={16} /> Report
                </button>
              </>}
            </div>
            </>
          )}
        </div>
      </div>

      <div className="relative select-none" onPointerUp={onPhotoTap}>
        <PostImage src={post.image_url} alt={caption || `Post by ${name}`} className="aspect-square w-full" />
        {burst && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <Heart size={96} className="heart-burst fill-white text-white drop-shadow-lg" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 px-4 pt-3">
        <button onClick={() => setLike(!liked)} aria-label={liked ? 'Unlike' : 'Like'} aria-pressed={liked}>
          <Heart size={24} className={liked ? 'fill-rose-500 text-rose-500' : ''} />
        </button>
        <Link to={`/p/${post.id}${from}#comments`} aria-label="Comments"><MessageCircle size={24} /></Link>
        <button onClick={share} aria-label="Share"><Send size={24} /></button>
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
        ) : caption && <p className="whitespace-pre-line break-words"><Link to={`/u/${name}`} className="mr-1 font-semibold">{name}</Link>{caption}</p>}
        {post.comment_count > 0 && <Link to={`/p/${post.id}${from}#comments`} className="block text-neutral-500">View {post.comment_count === 1 ? '1 comment' : `all ${post.comment_count} comments`}</Link>}
        {note && <p className="rounded-md bg-neutral-100 px-3 py-2 text-neutral-700">{note}</p>}
      </div>
      {why && surface && <WhyModal postId={post.id} surface={surface} onClose={() => setWhy(false)} />}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={() => !busy && setConfirmDelete(false)}>
          <div role="dialog" aria-label="Delete post" className="w-full max-w-sm rounded-2xl bg-white p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold">Delete this post?</p>
            <p className="mt-1 text-sm text-neutral-500">It will be removed from your profile and everyone's feed. This can't be undone.</p>
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
