// Stories from you and the people you follow, newest-unseen first.
// Stories are posts with type 'story'; the database hides them 24 h after
// posting, and story_views remembers which ones you've seen.
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Story, StoryUser } from '../types/stories'

type Row = {
  id: string; author_id: string; image_url: string; caption: string; created_at: string; expires_at: string
  author: { id: string; username: string; full_name: string; avatar_url: string } | null
}

type State = {
  users: StoryUser[]
  mine: StoryUser | null
  loaded: boolean
  load: (me: string) => Promise<void>
  markSeen: (storyId: string, me: string) => void
  remove: (storyId: string) => void
}

export const useStories = create<State>((set, get) => ({
  users: [],
  mine: null,
  loaded: false,

  load: async (me) => {
    const { data: follows } = await supabase.from('follows').select('followee_id').eq('follower_id', me)
    const authors = [me, ...(follows ?? []).map((f) => f.followee_id)]
    const { data, error } = await supabase.from('posts')
      .select('id, author_id, image_url, caption, created_at, expires_at, author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url)')
      .eq('type', 'story').gt('expires_at', new Date().toISOString())
      .in('author_id', authors).order('created_at', { ascending: true }).limit(500)
    if (error) return set({ loaded: true })
    const rows = (data ?? []) as unknown as Row[]
    const { data: seenRows } = rows.length
      ? await supabase.from('story_views').select('story_id').eq('viewer_id', me).in('story_id', rows.map((r) => r.id))
      : { data: [] }
    const seen = new Set((seenRows ?? []).map((r) => r.story_id))

    const byUser = new Map<string, StoryUser>()
    for (const r of rows) {
      if (!r.author) continue
      const story: Story = { id: r.id, user_id: r.author_id, media_url: r.image_url, caption: r.caption, created_at: r.created_at, expires_at: r.expires_at, viewed: r.author_id === me || seen.has(r.id) }
      const u = byUser.get(r.author_id) ?? { ...r.author, viewed: true, stories: [] }
      u.stories.push(story)
      u.viewed = u.viewed && story.viewed
      byUser.set(r.author_id, u)
    }
    const latest = (u: StoryUser) => u.stories[u.stories.length - 1].created_at
    const others = [...byUser.values()].filter((u) => u.id !== me)
      .sort((a, b) => Number(a.viewed) - Number(b.viewed) || latest(b).localeCompare(latest(a)))
    set({ users: others, mine: byUser.get(me) ?? null, loaded: true })
  },

  // Seen locally at once; the database records it in the background.
  markSeen: (storyId, me) => {
    const update = (u: StoryUser): StoryUser => {
      if (!u.stories.some((s) => s.id === storyId && !s.viewed)) return u
      const stories = u.stories.map((s) => (s.id === storyId ? { ...s, viewed: true } : s))
      return { ...u, stories, viewed: stories.every((s) => s.viewed) }
    }
    set({ users: get().users.map(update) })
    // Supabase queries are lazy: they only run when awaited or .then()'d.
    // Already-seen stories are skipped quietly (ON CONFLICT DO NOTHING).
    void supabase.from('story_views').upsert({ story_id: storyId, viewer_id: me }, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true })
      .then(({ error }) => { if (error) console.warn('[chronos] story view not saved:', error.message) })
  },

  remove: (storyId) => {
    const drop = (u: StoryUser | null) => {
      if (!u) return null
      const stories = u.stories.filter((s) => s.id !== storyId)
      return stories.length ? { ...u, stories } : null
    }
    set({ mine: drop(get().mine), users: get().users.map((u) => drop(u)).filter((u): u is StoryUser => !!u) })
  },
}))
