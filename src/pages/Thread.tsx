import { useEffect, useRef, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Check, CheckCheck, Clock, WifiOff, Send } from 'lucide-react'
import { useAuth } from '../store/auth'
import { useMessages } from '../store/messages'
import Avatar from '../components/Avatar'
import { timeAgo } from '../lib/time'

/** Group messages into runs from the same sender, then by date. */
function groupByDate(msgs: ReturnType<typeof useMessages.getState>['threads'][string]) {
  const days: { label: string; msgs: typeof msgs }[] = []
  for (const m of msgs) {
    const label = new Date(m.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    if (!days.length || days[days.length - 1].label !== label) {
      days.push({ label, msgs: [] })
    }
    days[days.length - 1].msgs.push(m)
  }
  return days
}

export default function Thread() {
  const { userId = '' } = useParams()
  const me = useAuth((s) => s.me)
  const { threads, people, online, send, markSeen, loadPeople } = useMessages()
  const [text, setText] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const msgs = threads[userId] ?? []
  const partner = people[userId]
  const days = groupByDate(msgs)

  useEffect(() => { void loadPeople([userId]) }, [userId, loadPeople])

  // Mark messages seen whenever we open or receive new messages in this thread
  useEffect(() => {
    void markSeen(userId)
  }, [msgs.length, userId, markSeen])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: msgs.length <= 1 ? 'instant' : 'smooth' })
  }, [msgs.length])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    send(userId, trimmed)
    setText('')
    inputRef.current?.focus()
  }, [text, userId, send])

  // Also allow Shift+Enter to stay but plain Enter submits
  const handleKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }, [handleSubmit])

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {/* Thread header */}
      <div className="sticky top-[57px] z-10 flex items-center gap-3 border-b bg-white px-4 py-2">
        <Link to="/messages" aria-label="Back to messages" className="p-1 -ml-1 rounded-lg hover:bg-neutral-100">
          <ArrowLeft size={22} />
        </Link>
        <Avatar src={partner?.avatar_url} name={partner?.username} size={34} />
        <div className="min-w-0 flex-1">
          <Link to={partner ? `/u/${partner.username}` : '#'} className="block text-sm font-semibold leading-tight hover:underline">
            {partner?.full_name || partner?.username || '…'}
          </Link>
          {partner?.username && partner.full_name && (
            <p className="text-xs text-neutral-500">@{partner.username}</p>
          )}
        </div>
      </div>

      {/* Offline banner */}
      {!online && (
        <p className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          <WifiOff size={16} /> You're offline. Messages will send when you reconnect.
        </p>
      )}

      {/* Message list */}
      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
        {!msgs.length && (
          <p className="pt-16 text-center text-sm text-neutral-500">
            Say hi to {partner?.username ?? 'them'} 👋
          </p>
        )}

        {days.map(({ label, msgs: dayMsgs }) => (
          <div key={label}>
            {/* Date separator */}
            <div className="my-4 flex items-center gap-3">
              <div className="flex-1 border-t border-neutral-200" />
              <span className="text-xs text-neutral-400">{label}</span>
              <div className="flex-1 border-t border-neutral-200" />
            </div>

            {dayMsgs.map((m, i) => {
              const mine = m.sender_id === me?.id
              const nextSame = i < dayMsgs.length - 1 && dayMsgs[i + 1].sender_id === m.sender_id
              const prevSame = i > 0 && dayMsgs[i - 1].sender_id === m.sender_id

              return (
                <div
                  key={m.client_id}
                  className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${nextSame ? 'mb-0.5' : 'mb-2'}`}
                >
                  {/* Partner avatar — show only on the last message in a run */}
                  {!mine && (
                    <div className="w-7 shrink-0">
                      {!nextSame && <Avatar src={partner?.avatar_url} name={partner?.username} size={26} />}
                    </div>
                  )}

                  <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'} max-w-[75%]`}>
                    <div
                      className={`
                        rounded-2xl px-3.5 py-2 text-sm leading-relaxed
                        ${mine ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-900'}
                        ${m.pending ? 'opacity-60' : ''}
                        ${mine && prevSame ? 'rounded-tr-md' : ''}
                        ${mine && nextSame ? 'rounded-br-md' : ''}
                        ${!mine && prevSame ? 'rounded-tl-md' : ''}
                        ${!mine && nextSame ? 'rounded-bl-md' : ''}
                      `}
                    >
                      {m.body}
                    </div>

                    {/* Tick + timestamp on last message in a run */}
                    {!nextSame && (
                      <div className={`mt-0.5 flex items-center gap-1 text-xs text-neutral-400 ${mine ? 'flex-row-reverse' : ''}`}>
                        <span>{timeAgo(m.created_at)}</span>
                        {mine && (
                          <span
                            className="inline-flex items-center"
                            aria-label={m.pending ? 'Sending' : m.seen_at ? 'Seen' : 'Sent'}
                          >
                            {m.pending
                              ? <Clock size={11} />
                              : m.seen_at
                                ? <CheckCheck size={13} className="text-sky-500" />
                                : <Check size={13} />
                            }
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {/* Compose bar */}
      <form
        onSubmit={handleSubmit}
        className="sticky bottom-16 flex items-center gap-2 border-t bg-white px-3 py-2.5"
      >
        <input
          ref={inputRef}
          className="input flex-1"
          placeholder="Message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          maxLength={2000}
          autoComplete="off"
          autoFocus
        />
        <button
          type="submit"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white disabled:opacity-40 hover:bg-neutral-700 transition-colors"
          disabled={!text.trim()}
          aria-label="Send"
        >
          <Send size={17} />
        </button>
      </form>
    </div>
  )
}
