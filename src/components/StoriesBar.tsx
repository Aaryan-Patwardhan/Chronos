import { useState } from 'react'
import { Link } from 'react-router'
import { Plus, MoreHorizontal } from 'lucide-react'
import Avatar from './Avatar'
import { useAuth } from '../store/auth'
import type { StoryUser } from '../types/stories'

interface StoriesBarProps {
  storyUsers: StoryUser[]
  onOpenStory: (user: StoryUser, storyIndex?: number) => void
}

export default function StoriesBar({ storyUsers, onOpenStory }: StoriesBarProps) {
  const me = useAuth((s) => s.me)
  const [users] = useState<StoryUser[]>(() => {
    const result = [...storyUsers]
    if (me) {
      result.unshift({
        id: me.id,
        username: me.username,
        avatar_url: me.avatar_url || `https://picsum.photos/seed/${me.username}/100/100`,
        full_name: me.full_name || me.username,
        hasStory: false,
        viewed: false,
        stories: [],
      })
    }
    return result
  })

  return (
    <div className="border-b border-neutral-200 bg-white sticky top-0 z-10">
      <div className="max-w-screen-md mx-auto px-4 py-3 overflow-x-auto scrollbar-hide">
        <div className="flex gap-3 min-w-max">
          {me && (
            <Link
              to="/stories/create"
              className="flex flex-col items-center gap-1.5 w-18 shrink-0 group"
              aria-label="Add to your story"
            >
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-neutral-200" />
                <Avatar src={me.avatar_url} name={me.username} size={56} className="rounded-full" />
                <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center border-2 border-white">
                  <Plus size={18} className="text-white" />
                </div>
              </div>
              <span className="text-xs font-medium text-neutral-700 truncate w-full text-center">Your Story</span>
            </Link>
          )}
          {users.map((user) => (
            <StoryRing
              key={user.id}
              user={user}
              onClick={() => onOpenStory(user)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function StoryRing({ user, onClick }: { user: StoryUser; onClick: () => void }) {
  const hasUnviewed = user.hasStory && !user.viewed
  const ringColors = hasUnviewed
    ? 'from-rose-500 via-orange-500 to-yellow-500'
    : 'from-neutral-300 to-neutral-400'

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 w-18 shrink-0"
      aria-label={user.hasStory ? `View ${user.full_name}'s story` : user.full_name}
    >
      <div className="relative w-16 h-16">
        <div className={`absolute inset-0 rounded-full p-[2px] bg-gradient-to-br ${ringColors}`}>
          <div className="absolute inset-[2px] rounded-full bg-white" />
        </div>
        <Avatar src={user.avatar_url} name={user.username} size={56} className="rounded-full" />
        {user.hasStory && user.viewed && (
          <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-white border-2 border-neutral-200 flex items-center justify-center">
            <MoreHorizontal size={12} className="text-neutral-500" />
          </div>
        )}
      </div>
      <span className="text-xs font-medium text-neutral-700 truncate w-full text-center">{user.username}</span>
    </button>
  )
}