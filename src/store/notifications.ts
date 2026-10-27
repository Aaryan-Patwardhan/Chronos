import { create } from 'zustand'
import { supabase } from '../lib/supabase'

type State = {
  unread: number
  /** Goes up by one for every new notification (the open page refreshes). */
  arrived: number
  start: (me: string) => () => void
  markAllRead: (me: string) => Promise<void>
}

export const useNotifications = create<State>((set, get) => ({
  unread: 0,
  arrived: 0,
  start: (me) => {
    void supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', me).eq('read', false)
      .then(({ count }) => set({ unread: count ?? 0 }))
    const channel = supabase.channel(`notif:${me}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${me}` },
        () => set({ unread: get().unread + 1, arrived: get().arrived + 1 }))
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  },
  markAllRead: async (me) => {
    set({ unread: 0 })
    await supabase.from('notifications').update({ read: true }).eq('user_id', me).eq('read', false)
  },
}))
