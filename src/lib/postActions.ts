// Like / save / share / delete for one post or reel — shared by PostCard and
// the Reels screen so both behave exactly the same.
import { useRef, useState } from 'react'
import { supabase } from './supabase'
import { friendly } from './errors'
import { storagePath } from './image'
import { useAuth } from '../store/auth'

export type ActionPost = {
  id: string
  author_id: string
  image_url: string
  video_url?: string | null
  caption: string
  like_count: number
  liked?: boolean
  saved?: boolean
  author: { username: string } | null
}

export function usePostActions(post: ActionPost) {
  const me = useAuth((s) => s.me)
  const [liked, setLiked] = useState(!!post.liked)
  const [saved, setSaved] = useState(!!post.saved)
  const [likes, setLikes] = useState(post.like_count)
  const [note, setNote] = useState('')
  const likeBusy = useRef(false)
  const saveBusy = useRef(false)
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const isReel = !!post.video_url

  /** Shows a short message; it clears itself unless `stay` is set. */
  function say(text: string, stay = false) {
    clearTimeout(noteTimer.current)
    setNote(text)
    if (!stay && text) noteTimer.current = setTimeout(() => setNote(''), 2500)
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
      say(friendly(res.error, "We couldn't update the like. Please try again."), true)
    }
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
      return say(friendly(error, "We couldn't update your saved posts. Please try again."), true)
    }
    if (next) say('Saved. Find it on your profile under Saved.')
  }

  // Phone share sheet when available, otherwise copy the link.
  async function share(caption = post.caption) {
    const url = `${location.origin}/p/${post.id}`
    if (navigator.share) {
      try { await navigator.share({ title: `${isReel ? 'Reel' : 'Post'} by ${post.author?.username ?? 'Chronos'}`, text: caption.slice(0, 100), url }); return }
      catch (e) { if ((e as Error).name === 'AbortError') return }
    }
    try { await navigator.clipboard.writeText(url); say('Link copied.') } catch { say(url, true) }
  }

  /** "See fewer" or "Report". Resolves true when saved. */
  async function signal(table: 'see_less' | 'reports', message: string) {
    if (!me) return false
    const { error } = await supabase.from(table).insert({ user_id: me.id, post_id: post.id })
    if (error && error.code !== '23505') { say(friendly(error, "We couldn't save that. Please try again."), true); return false }
    say(message)
    return true
  }

  /** Deletes the post, then its photo / video files. Resolves true on success. */
  async function remove() {
    const { error } = await supabase.from('posts').delete().eq('id', post.id)
    if (error) {
      say(friendly(error, `We couldn't delete the ${isReel ? 'reel' : 'post'}. Please try again.`), true)
      return false
    }
    if (me) {
      const own = (p: string | null) => (p && p.startsWith(`${me.id}/`) ? p : null)
      const image = own(storagePath(post.image_url))
      const video = own(storagePath(post.video_url ?? '', 'videos'))
      await Promise.all([
        image ? supabase.storage.from('media').remove([image]) : null,
        video ? supabase.storage.from('videos').remove([video]) : null,
      ])
    }
    return true
  }

  return { me, liked, saved, likes, note, say, setLike, toggleSave, share, signal, remove }
}
