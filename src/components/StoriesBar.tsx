// Row of story rings at the top of the feed: "Your story" first, then the
// people you follow — unseen (coloured ring) before seen (grey ring).
import { useNavigate } from 'react-router'
import { Plus } from 'lucide-react'
import Avatar from './Avatar'
import { useAuth } from '../store/auth'
import { useStories } from '../store/stories'
import type { StoryUser } from '../types/stories'

export default function StoriesBar({ onOpen }: { onOpen: (list: StoryUser[], index: number) => void }) {
  const me = useAuth((s) => s.me)
  const { users, mine, loaded } = useStories()
  const navigate = useNavigate()
  if (!me) return null
  const list = mine ? [mine, ...users] : users

  return (
    <div className="border-b border-neutral-200 bg-white">
      <div className="no-scrollbar overflow-x-auto px-3 py-3">
        <ul className="flex min-w-max gap-3" aria-label="Stories">
          <li className="relative w-[72px] shrink-0">
            <button onClick={() => (mine ? onOpen(list, 0) : navigate('/stories/new'))} className="flex w-full flex-col items-center gap-1"
              aria-label={mine ? 'View your story' : 'Add to your story'}>
              <Ring state={mine ? 'seen' : 'none'}><Avatar src={me.avatar_url} name={me.username} size={58} /></Ring>
              <span className="w-full truncate text-center text-xs text-neutral-700">Your story</span>
            </button>
            <button onClick={() => navigate('/stories/new')} aria-label="Add a new story"
              className="absolute right-1 top-11 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-sky-500 text-white">
              <Plus size={14} strokeWidth={3} />
            </button>
          </li>
          {!loaded && Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex w-[72px] shrink-0 animate-pulse flex-col items-center gap-1">
              <div className="h-16 w-16 rounded-full bg-neutral-200" /><div className="h-2.5 w-12 rounded bg-neutral-200" />
            </li>
          ))}
          {users.map((u, i) => (
            <li key={u.id} className="w-[72px] shrink-0">
              <button onClick={() => onOpen(list, mine ? i + 1 : i)} className="flex w-full flex-col items-center gap-1"
                aria-label={`${u.username}'s story${u.viewed ? '' : ', new'}`}>
                <Ring state={u.viewed ? 'seen' : 'new'}><Avatar src={u.avatar_url} name={u.username} size={58} /></Ring>
                <span className={`w-full truncate text-center text-xs ${u.viewed ? 'text-neutral-500' : 'text-neutral-800'}`}>{u.username}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Ring({ state, children }: { state: 'new' | 'seen' | 'none'; children: React.ReactNode }) {
  const ring = state === 'new' ? 'bg-gradient-to-tr from-amber-400 via-rose-500 to-violet-600' : state === 'seen' ? 'bg-neutral-300' : 'bg-transparent'
  return (
    <span className={`flex h-16 w-16 items-center justify-center rounded-full p-[2.5px] ${ring}`}>
      <span className="flex h-full w-full items-center justify-center rounded-full bg-white p-[2px]">{children}</span>
    </span>
  )
}
