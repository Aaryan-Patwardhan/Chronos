import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Check, CheckCheck, Clock, WifiOff } from 'lucide-react'
import { useAuth } from '../store/auth'
import { useMessages } from '../store/messages'
import Avatar from '../components/Avatar'

export default function Thread() {
  const { userId = '' } = useParams()
  const me = useAuth((s) => s.me)
  const { threads, people, online, send, markSeen, loadPeople } = useMessages()
  const [text, setText] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const msgs = threads[userId] ?? []
  const partner = people[userId]
  const lastMine = [...msgs].reverse().find((m) => m.sender_id === me?.id)

  useEffect(() => { void loadPeople([userId]) }, [userId, loadPeople])
  useEffect(() => {
    void markSeen(userId)
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs.length, userId, markSeen])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    send(userId, text)
    setText('')
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <div className="sticky top-[57px] z-10 flex items-center gap-3 border-b bg-white px-4 py-2">
        <Link to="/messages" aria-label="Back to messages"><ArrowLeft size={22} /></Link>
        <Avatar src={partner?.avatar_url} name={partner?.username} size={32} />
        <Link to={partner ? `/u/${partner.username}` : '#'} className="text-sm font-semibold">{partner?.username ?? '…'}</Link>
      </div>
      {!online && <p className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900"><WifiOff size={16} /> You're offline. Messages will send when you reconnect.</p>}
      <div className="flex-1 space-y-2 px-4 py-4">
        {!msgs.length && <p className="pt-10 text-center text-sm text-neutral-500">Say hi to {partner?.username ?? 'them'} 👋</p>}
        {msgs.map((m) => {
          const mine = m.sender_id === me?.id
          return (
            <div key={m.client_id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-neutral-900 text-white' : 'bg-neutral-100'} ${m.pending ? 'opacity-60' : ''}`}>
                {m.body}
                {mine && (
                  <span className="ml-2 inline-flex translate-y-0.5 items-center" aria-label={m.pending ? 'Sending' : m.seen_at ? 'Seen' : 'Sent'}>
                    {m.pending ? <Clock size={12} /> : m.seen_at ? <CheckCheck size={14} className="text-sky-300" /> : <Check size={14} />}
                  </span>
                )}
              </div>
            </div>
          )
        })}
        {lastMine && (
          <p className="text-right text-xs text-neutral-500">
            {lastMine.pending ? (online ? 'Sending…' : 'Waiting for connection…') : lastMine.seen_at ? 'Seen' : 'Sent'}
          </p>
        )}
        <div ref={bottom} />
      </div>
      <form onSubmit={submit} className="sticky bottom-16 flex gap-2 border-t bg-white px-4 py-3">
        <input className="input" placeholder="Message…" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
        <button className="btn-primary" disabled={!text.trim()}>Send</button>
      </form>
    </div>
  )
}
