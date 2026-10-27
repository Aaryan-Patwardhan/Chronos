import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/supabase'
import { friendly } from '../lib/errors'
import PostCard, { type CardPost } from '../components/PostCard'
import StoriesBar from '../components/StoriesBar'
import StoryViewer from '../components/StoryViewer'
import type { StoryUser } from '../types/stories'
import { MOCK_STORY_USERS } from '../data/mockStories'

export default function Feed() {
  const [posts, setPosts] = useState<CardPost[] | null>(null)
  const [error, setError] = useState('')
  const [storyUsers] = useState<StoryUser[]>(MOCK_STORY_USERS)
  const [activeStoryUser, setActiveStoryUser] = useState<StoryUser | null>(null)
  const [activeStoryIndex, setActiveStoryIndex] = useState(0)

  const load = useCallback(() => {
    setError('')
    api<{ posts: CardPost[] }>('/api/feed?surface=feed')
      .then((r) => setPosts(r.posts))
      .catch((e) => setError(friendly(e, "We couldn't load your feed. Please try again.")))
  }, [])
  useEffect(load, [load])

  const handleOpenStory = useCallback((user: StoryUser, storyIndex = 0) => {
    if (!user.hasStory) return
    setActiveStoryUser(user)
    setActiveStoryIndex(storyIndex)
  }, [])

  const handleCloseStory = useCallback(() => {
    setActiveStoryUser(null)
    setActiveStoryIndex(0)
  }, [])

  const handleNextUser = useCallback(() => {
    const currentIndex = storyUsers.findIndex(u => u.id === activeStoryUser?.id)
    if (currentIndex < storyUsers.length - 1) {
      const nextUser = storyUsers[currentIndex + 1]
      if (nextUser.hasStory) {
        setActiveStoryUser(nextUser)
        setActiveStoryIndex(0)
      } else {
        handleCloseStory()
      }
    } else {
      handleCloseStory()
    }
  }, [storyUsers, activeStoryUser, handleCloseStory])

  const handlePrevUser = useCallback(() => {
    const currentIndex = storyUsers.findIndex(u => u.id === activeStoryUser?.id)
    if (currentIndex > 0) {
      const prevUser = storyUsers[currentIndex - 1]
      if (prevUser.hasStory) {
        setActiveStoryUser(prevUser)
        setActiveStoryIndex(prevUser.stories.length - 1)
      } else {
        handleCloseStory()
      }
    } else {
      handleCloseStory()
    }
  }, [storyUsers, activeStoryUser, handleCloseStory])

  if (error) return <Status text={error} action={<button className="btn-secondary" onClick={load}>Try again</button>} />
  if (!posts) return <Status text="Loading your feed…" />

  return (
    <div>
      <StoriesBar
        storyUsers={storyUsers}
        onOpenStory={handleOpenStory}
      />
      {activeStoryUser && (
        <StoryViewer
          user={activeStoryUser}
          initialStoryIndex={activeStoryIndex}
          onClose={handleCloseStory}
          onNextUser={handleNextUser}
          onPrevUser={handlePrevUser}
        />
      )}
      {!posts.length ? (
        <Status text="Your feed is empty. Follow people or like posts in Explore to fill it." action={<Link to="/explore" className="btn-primary">Go to Explore</Link>} />
      ) : (
        <>
          {posts.map((p) => <PostCard key={p.id} post={p} surface="feed" onHide={(id) => setPosts((list) => list?.filter((x) => x.id !== id) ?? null)} />)}
          <div className="p-6 text-center"><button className="btn-secondary" onClick={load}>Refresh feed</button></div>
        </>
      )}
    </div>
  )
}

export function Status({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-20 text-center text-sm text-neutral-600">
      <p>{text}</p>
      {action}
    </div>
  )
}
