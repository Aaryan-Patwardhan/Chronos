import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { clearMessageCache } from './messages'

type AuthState = {
  session: Session | null
  me: Profile | null
  ready: boolean
  /** True while the welcome flow creates the account, so screens don't flicker. */
  settingUp: boolean
  loadProfile: () => Promise<void>
}

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  me: null,
  ready: false,
  settingUp: false,
  loadProfile: async () => {
    const id = get().session?.user.id
    if (!id) return set({ me: null })
    const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    set({ me: data as Profile | null })
  },
}))

supabase.auth.getSession().then(async ({ data }) => {
  useAuth.setState({ session: data.session })
  await useAuth.getState().loadProfile()
  useAuth.setState({ ready: true })
})

supabase.auth.onAuthStateChange((event, session) => {
  const prev = useAuth.getState().session?.user.id
  if (event === 'SIGNED_OUT') clearMessageCache(prev)
  useAuth.setState({ session })
  if (session?.user.id !== prev) void useAuth.getState().loadProfile()
})
