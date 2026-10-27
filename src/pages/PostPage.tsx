import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/time'
import { friendly } from '../lib/errors'
import { useAuth } from '../store/auth'
import PostCard, { type CardPost } from '../components/PostCard'
import Avatar from '../components/Avatar'
import RichText from '../components/RichText'
import { Status } from './Feed'

const COMMENT_MAX = 500
type Comment = { id: string; body: string; created_at: string; user_id: string; author: { username: string; avatar_url: string } | null }

export default function PostPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const { hash } = useLocation()
  const me = useAuth((s) => s.me)
  const navigate = useNavigate()
  const from = params.get('from')
  const [post, setPost] = useState<CardPost | null | undefined>(undefined)
  const [comments, setComments] = useState<Comment[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const commentsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!me) return
    let cancelled = false
    setPost(undefined)
    void (async () => {
      const { data } = await supabase.from('posts')
        .select('id, author_id, image_url, caption, tags, like_count, comment_count, created_at, aspect, author:profiles!posts_author_id_fkey(username, avatar_url, full_name)')
        .eq('id', id).maybeSingle()
      if (cancelled) return
      if (!data) return setPost(null)
      const [liked, saved, list] = await Promise.all([
        supabase.from('likes').select('post_id').eq('user_id', me.id).eq('post_id', id),
        supabase.from('saves').select('post_id').eq('user_id', me.id).eq('post_id', id),
        supabase.from('comments').select('id, body, created_at, user_id, author:profiles!comments_user_id_fkey(username, avatar_url)').eq('post_id', id).order('created_at').limit(300),
      ])
      if (cancelled) return
      setPost({ ...(data as unknown as CardPost), liked: !!liked.data?.length, saved: !!saved.data?.length })
      setComments((list.data ?? []) as unknown as Comment[])
    })()
    return () => { cancelled = true }
  }, [id, me])

  useEffect(() => {
    if (post && hash === '#comments') commentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [post, hash])

  async function addComment(e: React.FormEvent) {
    e.preventDefault()
    if (!me || sending) return
    const body = text.trim().slice(0, COMMENT_MAX)
    if (!body) return
    setSending(true); setError('')
    const { data, error } = await supabase.from('comments').insert({ post_id: id, user_id: me.id, body })
      .select('id, body, created_at, user_id').single()
    setSending(false)
    // Keep what was typed if it failed, and say why.
    if (error || !data) return setError(friendly(error, "We couldn't post your comment. Please try again."))
    setText('')
    setComments((c) => [...c, { ...data, author: { username: me.username, avatar_url: me.avatar_url } }])
  }

  async function removeComment(commentId: string) {
    setConfirmId(null)
    const before = comments
    setComments((c) => c.filter((x) => x.id !== commentId))
    const { data, error } = await supabase.from('comments').delete().eq('id', commentId).select('id')
    if (error || !data?.length) {
      setComments(before)
      setError(friendly(error, "We couldn't delete that comment. Please try again."))
    }
  }

  if (post === undefined) return <Status text="Loading post…" />
  if (post === null) return <Status text="This post doesn't exist or was removed." action={<Link to="/" className="btn-secondary">Back to your feed</Link>} />
  const canRemove = (c: Comment) => c.user_id === me?.id || post.author_id === me?.id

  return (
    <div>
      <PostCard post={post} surface={from === 'explore' || from === 'feed' ? from : undefined}
        onDeleted={() => navigate(me ? `/u/${me.username}` : '/', { replace: true })} />

      <div ref={commentsRef} id="comments" className="scroll-mt-16 px-4 pt-4">
        <h2 className="text-sm font-semibold">{comments.length ? `Comments (${comments.length})` : 'Comments'}</h2>
      </div>
      <ul className="space-y-3 px-4 py-3">
        {comments.map((c) => (
          <li key={c.id} className="group flex gap-3 text-sm">
            <Avatar src={c.author?.avatar_url} name={c.author?.username} size={28} />
            <div className="min-w-0 flex-1">
              <p className="break-words"><Link to={`/u/${c.author?.username}`} className="mr-1 font-semibold">{c.author?.username}</Link><RichText text={c.body} /></p>
              <p className="mt-0.5 flex items-center gap-3 text-xs text-neutral-400">
                <span>{timeAgo(c.created_at)}</span>
                {canRemove(c) && (confirmId === c.id
                  ? <>
                      <button className="font-semibold text-rose-600" onClick={() => removeComment(c.id)}>Delete</button>
                      <button className="font-semibold text-neutral-500" onClick={() => setConfirmId(null)}>Cancel</button>
                    </>
                  : <button className="inline-flex items-center gap-1 hover:text-neutral-600" onClick={() => setConfirmId(c.id)} aria-label="Delete comment">
                      <Trash2 size={12} /> Delete
                    </button>)}
              </p>
            </div>
          </li>
        ))}
        {!comments.length && <li className="text-sm text-neutral-500">No comments yet. Start the conversation.</li>}
      </ul>

      <form onSubmit={addComment} className="sticky bottom-16 border-t bg-white px-4 py-3">
        {error && <p role="alert" className="mb-2 text-sm text-rose-600">{error}</p>}
        <div className="flex items-center gap-2">
          <Avatar src={me?.avatar_url} name={me?.username} size={32} />
          <input className="input" placeholder={`Add a comment as ${me?.username}…`} value={text} maxLength={COMMENT_MAX}
            onChange={(e) => setText(e.target.value)} aria-label="Add a comment" />
          <button className="btn-primary" disabled={!text.trim() || sending}>{sending ? 'Posting…' : 'Post'}</button>
        </div>
        {text.length > COMMENT_MAX - 100 && <p className="mt-1 text-right text-xs text-neutral-500">{text.length}/{COMMENT_MAX}</p>}
      </form>
    </div>
  )
}
