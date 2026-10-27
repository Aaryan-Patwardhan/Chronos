export type Story = {
  id: string
  user_id: string
  media_url: string
  caption: string
  created_at: string
  expires_at: string
  viewed: boolean
}

export type StoryUser = {
  id: string
  username: string
  avatar_url: string
  full_name: string
  /** True when every story of this user has been seen. */
  viewed: boolean
  stories: Story[]
}
