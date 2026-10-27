export type Profile = {
  id: string
  username: string
  full_name: string
  bio: string
  avatar_url: string
  interests?: string[]
  onboarded?: boolean
}

export type Post = {
  id: string
  author_id: string
  image_url: string
  caption: string
  tags: string[]
  like_count: number
  comment_count: number
  created_at: string
  author?: Profile
}

export type Message = {
  id?: string
  client_id: string
  sender_id: string
  recipient_id: string
  body: string
  created_at: string
  seen_at: string | null
  /** Local only: 'sending' until the server confirms the row. */
  pending?: boolean
}

export type Notification = {
  id: string
  kind: 'like' | 'comment' | 'follow'
  post_id: string | null
  read: boolean
  created_at: string
  actor: Profile
}

export { type Trace, type Weights, DEFAULT_WEIGHTS } from '../../api/_lib/rank'
