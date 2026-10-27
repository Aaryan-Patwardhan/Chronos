export type Reel = {
  id: string
  user_id: string
  username: string
  avatar_url: string
  full_name: string
  video_url: string
  poster_url: string
  caption: string
  tags: string[]
  like_count: number
  comment_count: number
  share_count: number
  view_count: number
  created_at: string
  duration: number // in seconds
  liked?: boolean
}

export type ReelUser = {
  id: string
  username: string
  avatar_url: string
  full_name: string
  reels: Reel[]
}