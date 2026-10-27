import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/time'
import { useAuth } from '../store/auth'
import PostCard, { type CardPost } from '../components/PostCard'
import Avatar from '../components/Avatar'
import { Status } from './Feed'

type Comment = { id: string; body: string; created_at: string; author: { username: string; avatar_url: string } | null }

export default function PostPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const me = useAuth((s) => s.me)
  const navigate = useNavigate()
  const from = params.get('from')
  const [post, setPost] = useState<CardPost | null | undefined>(undefined)
  const [comments, setComments] = useState<Comment[]>([])
  const [text, setText] = useState('')

  useEffect(() => {
    if (!me) return
    void (async () => {
      const { data } = await supabase.from('posts')
        .select('id, author_id, image_url, caption, tags, like_count, comment_count, created_at, author:profiles!posts_author_id_fkey(username, avatar_url, full_name)')
        .eq('id', id).maybeSingle()
      if (!data) return setPost(null)
      const [liked, saved, list] = await Promise.all([
        supabase.from('likes').select('post_id').eq('user_id', me.id).eq('post_id', id),
        supabase.from('saves').select('post_id').eq('user_id', me.id).eq('post_id', id),
        supabase.from('comments').select('id, body, created_at, author:profiles!comments_user_id_fkey(username, avatar_url)').eq('post_id', id).order('created_at'),
      ])
      setPost({ ...(data as unknown as CardPost), liked: !!liked.data?.length, saved: !!saved.data?.length })
      setComments((list.data ?? []) as unknown as Comment[])
    })()
  }, [id, me])

  async function addComment(e: React.FormEvent) {
    e.preventDefault()
    if (!me || !text.trim()) return
    const body = text.trim().slice(0, 500)
    setText('')
    const { data, error } = await supabase.from('comments').insert({ post_id: id, user_id: me.id, body }).select('id, body, created_at').single()
    if (!error && data) setComments((c) => [...c, { ...data, author: { username: me.username, avatar_url: me.avatar_url } }])
  }

  if (post === undefined) return <Status text="Loading post…" />
  if (post === null) return <Status text="This post doesn't exist or was removed." />
  return (
    <div>
      <PostCard post={post} surface={from === 'explore' || from === 'feed' ? from : undefined}
        onDeleted={() => navigate(me ? `/u/${me.username}` : '/', { replace: true })} />
      <ul className="space-y-3 px-4 py-4">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-3 text-sm">
            <Avatar src={c.author?.avatar_url} name={c.author?.username} size={28} />
            <p><Link to={`/u/${c.author?.username}`} className="mr-1 font-semibold">{c.author?.username}</Link>{c.body}
              <span className="ml-2 text-xs text-neutral-400">{timeAgo(c.created_at)}</span></p>
          </li>
        ))}
        {!comments.length && <li className="text-sm text-neutral-500">No comments yet. Be the first.</li>}
      </ul>
      <form onSubmit={addComment} className="flex gap-2 border-t px-4 py-3">
        <input className="input" placeholder="Add a comment…" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
        <button className="btn-primary" disabled={!text.trim()}>Post</button>
      </form>
    </div>
  )
}
