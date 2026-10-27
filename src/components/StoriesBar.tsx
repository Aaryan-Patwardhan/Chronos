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
  // Exclude current user from the peer stories list to prevent duplicate avatar
  const [users] = useState<StoryUser[]>(() => {
    return storyUsers.filter((u) => u.id !== me?.id && u.username !== me?.username)
  })

  return (
    <div className="border-b border-neutral-200 bg-white">
      <div className="max-w-screen-md mx-auto px-4 py-3 overflow-x-auto no-scrollbar">
        <div className="flex gap-3 min-w-max">
          {me && (
            <Link
              to="/new"
              className="flex flex-col items-center gap-1.5 w-18 shrink-0 group cursor-pointer"
              aria-label="Add to your story"
            >
              <div className="relative w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-neutral-200" />
                <Avatar src={me.avatar_url} name={me.username} size={54} className="rounded-full" />
                <div className="absolute bottom-0 right-0 z-20 w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center border-2 border-white shadow-sm">
                  <Plus size={14} className="text-white stroke-[3]" />
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
      disabled={!user.hasStory}
      className="flex flex-col items-center gap-1.5 w-18 shrink-0 cursor-pointer disabled:opacity-80"
      aria-label={user.hasStory ? `View ${user.full_name}'s story` : user.full_name}
    >
      <div className="relative w-16 h-16 flex items-center justify-center">
        <div className={`absolute inset-0 rounded-full p-[2.5px] bg-gradient-to-br ${ringColors}`}>
          <div className="w-full h-full rounded-full bg-white" />
        </div>
        <Avatar src={user.avatar_url} name={user.username} size={54} className="relative z-10 rounded-full" />
        {user.hasStory && user.viewed && (
          <div className="absolute bottom-0 right-0 z-20 w-5 h-5 rounded-full bg-white border-2 border-neutral-200 flex items-center justify-center shadow-xs">
            <MoreHorizontal size={12} className="text-neutral-500" />
          </div>
        )}
      </div>
      <span className="text-xs font-medium text-neutral-700 truncate w-full text-center">{user.username}</span>
    </button>
  )
}