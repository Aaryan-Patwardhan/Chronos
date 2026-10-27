import { useEffect } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { Bell, House, MessageCircle, Search, Settings, SquarePlus, User, Video } from 'lucide-react'
import { useAuth } from '../store/auth'
import { useNotifications } from '../store/notifications'
import { useMessages } from '../store/messages'

export default function Layout() {
  const me = useAuth((s) => s.me)
  const unread = useNotifications((s) => s.unread)
  const startNotifications = useNotifications((s) => s.start)
  const startMessages = useMessages((s) => s.start)
  const unreadDms = useMessages((s) => s.unreadCount())

  useEffect(() => {
    if (!me) return
    const stopA = startNotifications(me.id)
    const stopB = startMessages(me.id)
    return () => { stopA(); stopB() }
  }, [me, startNotifications, startMessages])

  const tab = ({ isActive }: { isActive: boolean }) =>
    `relative flex flex-col items-center gap-0.5 px-3 py-2 text-xs ${isActive ? 'text-neutral-900' : 'text-neutral-500'}`

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col bg-white shadow-sm">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur">
        <Link to="/" className="flex items-center gap-2 leading-tight" aria-label="Chronos home">
          <img src="/brand/icon-64.png" alt="" width={28} height={28} className="h-7 w-7 rounded-lg" />
          <span className="text-xl font-bold tracking-tight">Chronos</span>
          <span className="ml-2 hidden text-xs text-neutral-500 sm:inline">Connect. Create. Discover.</span>
        </Link>
        <div className="flex items-center gap-3">
          <NavLink to="/notifications" className="relative p-1" aria-label="Notifications">
            <Bell size={22} />
            {unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white">{unread}</span>}
          </NavLink>
          <NavLink to="/settings" className="p-1" aria-label="Settings"><Settings size={22} /></NavLink>
        </div>
      </header>

      <main className="flex-1 pb-20"><Outlet /></main>

      <nav className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-xl -translate-x-1/2 justify-around border-t border-neutral-200 bg-white">
        <NavLink to="/" end className={tab}><House size={22} />Home</NavLink>
        <NavLink to="/explore" className={tab}><Search size={22} />Explore</NavLink>
        <NavLink to="/reels" className={tab}><Video size={22} />Reels</NavLink>
        <NavLink to="/new" className={tab}><SquarePlus size={22} />Post</NavLink>
        <NavLink to="/messages" className={tab}>
          <MessageCircle size={22} />Messages
          {unreadDms > 0 && <span className="absolute right-1 top-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white">{unreadDms}</span>}
        </NavLink>
        <NavLink to={me ? `/u/${me.username}` : '/'} className={tab}><User size={22} />Profile</NavLink>
      </nav>
    </div>
  )
}
