import { Navigate, Route, Routes } from 'react-router'
import { useAuth } from './store/auth'
import Layout from './components/Layout'
import Welcome from './pages/Welcome'
import Onboarding from './pages/Onboarding'
import Feed from './pages/Feed'
import Explore from './pages/Explore'
import Reels from './pages/Reels'
import NewPost from './pages/NewPost'
import Profile from './pages/Profile'
import PostPage from './pages/PostPage'
import Messages from './pages/Messages'
import Thread from './pages/Thread'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'
import EditProfile from './pages/EditProfile'
import FollowList from './pages/FollowList'

export default function App() {
  const { session, me, ready, settingUp } = useAuth()
  if (!ready || settingUp) return <div className="grid min-h-screen place-items-center text-neutral-500">{settingUp ? 'Setting up your feed…' : 'Loading Chronos…'}</div>
  if (!session) return <Welcome />
  if (!me) return <div className="grid min-h-screen place-items-center text-neutral-500">Loading your profile…</div>
  if (!me.onboarded) return <Onboarding />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Feed />} />
        <Route path="explore" element={<Explore />} />
        <Route path="reels" element={<Reels />} />
        <Route path="new" element={<NewPost />} />
        <Route path="u/:username" element={<Profile />} />
        <Route path="u/:username/followers" element={<FollowList kind="followers" />} />
        <Route path="u/:username/following" element={<FollowList kind="following" />} />
        <Route path="p/:id" element={<PostPage />} />
        <Route path="messages" element={<Messages />} />
        <Route path="messages/:userId" element={<Thread />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/profile" element={<EditProfile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
