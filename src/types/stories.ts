export type Story = {
  id: string
  user_id: string
  username: string
  avatar_url: string
  full_name: string
  media_url: string
  media_type: 'image' | 'video'
  created_at: string
  viewed: boolean
  expires_at: string
}

export type StoryUser = {
  id: string
  username: string
  avatar_url: string
  full_name: string
  hasStory: boolean
  viewed: boolean
  stories: Story[]
}