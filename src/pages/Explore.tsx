// Explore: a server-ranked grid of posts from people you don't follow,
// accounts suggested by your interests, plus search for accounts and #topics.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Clock, Hash, RefreshCw, Search, X } from 'lucide-react'
import { api, supabase } from '../lib/supabase'
import { friendly } from '../lib/errors'
import { addRecent, clearRecent, loadRecent, type Recent } from '../lib/recent'
import type { Profile } from '../lib/types'
import type { CardPost } from '../components/PostCard'
import { useAuth } from '../store/auth'
import Avatar from '../components/Avatar'
import PostImage from '../components/PostImage'
import SuggestedAccounts from '../components/SuggestedAccounts'
import { Status } from './Feed'

type TagHit = { tag: string; posts: number }

export default function Explore() {
  const me = useAuth((s) => s.me)
  const navigate = useNavigate()
  const [posts, setPosts] = useState<CardPost[] | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [people, setPeople] = useState<Profile[]>([])
  const [tags, setTags] = useState<TagHit[]>([])
  const [popular, setPopular] = useState<TagHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [recent, setRecent] = useState<Recent[]>(() => (me ? loadRecent(me.id) : []))
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback((refresh = false) => {
    setError('')
    if (refresh) setRefreshing(true)
    api<{ posts: CardPost[] }>('/api/feed?surface=explore')
      .then((r) => { setPosts(r.posts); if (refresh) window.scrollTo({ top: 0, behavior: 'smooth' }) })
      .catch((e) => setError(friendly(e, "We couldn't load Explore. Please try again.")))
      .finally(() => setRefreshing(false))
  }, [])

  useEffect(() => {
    load()
    void supabase.rpc('search_tags', { q: '' }).then(({ data }) => setPopular((data ?? []) as TagHit[]))
    if (me) void supabase.from('follows').select('followee_id').eq('follower_id', me.id)
      .then(({ data }) => setFollowing(new Set((data ?? []).map((r) => r.followee_id))))
  }, [load, me])

  // Search: accounts (username or name) and topics, 250 ms after typing stops.
  const term = query.trim().toLowerCase()
  const tagTerm = term.replace(/^#/, '')
  useEffect(() => {
    if (!term) { setPeople([]); setTags([]); setSearchError(''); return }
    setSearching(true)
    let cancelled = false
    const t = setTimeout(async () => {
      const safe = tagTerm.replace(/[^a-z0-9_. ]/g, '').trim()
      const wantPeople = !term.startsWith('#') && safe.length > 0
      const [users, topics] = await Promise.all([
        wantPeople
          ? supabase.from('profiles').select('id, username, full_name, avatar_url, bio')
              .or(`username.ilike.%${safe}%,full_name.ilike.%${safe}%`).limit(20)
          : Promise.resolve({ data: [], error: null }),
        supabase.rpc('search_tags', { q: tagTerm }),
      ])
      if (cancelled) return
      setSearching(false)
      if (users.error || topics.error) return setSearchError(friendly(users.error ?? topics.error, "Search isn't working right now. Please try again."))
      setSearchError('')
      // Usernames that start with the search come first, then the rest.
      const list = ((users.data ?? []) as Profile[]).filter((u) => u.id !== me?.id)
        .sort((a, b) => Number(b.username.startsWith(safe)) - Number(a.username.startsWith(safe)) || a.username.localeCompare(b.username))
      setPeople(list.slice(0, 8))
      setTags((topics.data ?? []) as TagHit[])
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [term, tagTerm, me])

  function openUser(u: Profile) {
    if (me) setRecent(addRecent(me.id, { kind: 'user', username: u.username, avatar_url: u.avatar_url }))
    navigate(`/u/${u.username}`)
  }
  function openTag(tag: string) {
    if (me) setRecent(addRecent(me.id, { kind: 'tag', tag }))
    navigate(`/t/${tag}`)
  }

  const showRecent = focused && !term && recent.length > 0
  return (
    <div>
      <div className="sticky top-[57px] z-10 space-y-2 bg-white p-3">
        <div className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2">
            <Search size={18} className="text-neutral-500" />
            <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onFocus={() => setFocused(true)}
              onKeyDown={(e) => { if (e.key === 'Enter' && term.startsWith('#') && tags[0]) openTag(tags[0].tag) }}
              placeholder="Search people or #topics" aria-label="Search people or topics"
              className="w-full bg-transparent text-sm outline-none" enterKeyHint="search" />
            {query && <button onClick={() => { setQuery(''); inputRef.current?.focus() }} aria-label="Clear search"><X size={16} className="text-neutral-500" /></button>}
          </label>
          {(focused || query) && <button className="text-sm font-semibold" onClick={() => { setQuery(''); setFocused(false); inputRef.current?.blur() }}>Cancel</button>}
        </div>
        {!term && !showRecent && popular.length > 0 && (
          <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" aria-label="Popular topics">
            {popular.map((t) => (
              <button key={t.tag} onClick={() => openTag(t.tag)} className="shrink-0 rounded-full border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100">#{t.tag}</button>
            ))}
          </div>
        )}
      </div>

      {showRecent ? (
        <section>
          <div className="flex items-center justify-between px-4 py-2">
            <h2 className="text-sm font-semibold">Recent</h2>
            <button className="text-sm font-semibold text-sky-600" onClick={() => me && setRecent(clearRecent(me.id))}>Clear all</button>
          </div>
          {recent.map((r) => r.kind === 'user' ? (
            <button key={`u-${r.username}`} onClick={() => navigate(`/u/${r.username}`)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-neutral-50">
              <Avatar src={r.avatar_url} name={r.username} size={40} />
              <span className="text-sm font-semibold">{r.username}</span>
            </button>
          ) : (
            <button key={`t-${r.tag}`} onClick={() => openTag(r.tag)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-neutral-50">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-300"><Hash size={18} /></span>
              <span className="text-sm font-semibold">#{r.tag}</span>
              <Clock size={14} className="ml-auto text-neutral-400" />
            </button>
          ))}
        </section>
      ) : term ? (
        <section aria-live="polite">
          {searchError && <p role="alert" className="mx-4 my-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{searchError}</p>}
          {people.map((u) => (
            <button key={u.id} onClick={() => openUser(u)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-neutral-50">
              <Avatar src={u.avatar_url} name={u.username} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{u.username}</span>
                <span className="block truncate text-xs text-neutral-500">
                  {u.full_name !== u.username ? u.full_name : u.bio}{following.has(u.id) ? ' · Following' : ''}
                </span>
              </span>
            </button>
          ))}
          {tags.map((t) => (
            <button key={t.tag} onClick={() => openTag(t.tag)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-neutral-50">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-300"><Hash size={20} /></span>
              <span>
                <span className="block text-sm font-semibold">#{t.tag}</span>
                <span className="block text-xs text-neutral-500">{t.posts} {t.posts === 1 ? 'post' : 'posts'}</span>
              </span>
            </button>
          ))}
          {!searching && !searchError && !people.length && !tags.length && <Status text={`No results for "${query.trim()}". Try a different name or topic.`} />}
          {searching && !people.length && !tags.length && <Status text="Searching…" />}
        </section>
      ) : error && !posts ? (
        <Status text={error} action={<button className="btn-secondary" onClick={() => load()}>Try again</button>} />
      ) : !posts ? (
        <div className="grid grid-cols-3 gap-0.5" aria-busy="true" aria-label="Loading Explore">
          {Array.from({ length: 15 }, (_, i) => <div key={i} className="aspect-square animate-pulse bg-neutral-200" />)}
        </div>
      ) : !posts.length ? (
        <Status text="Nothing new to explore right now. Check back soon." />
      ) : (
        <>
          <SuggestedAccounts layout="row" limit={12} />
          <div className="grid grid-cols-3 gap-0.5">
            {posts.map((p) => (
              <Link key={p.id} to={`/p/${p.id}?from=explore`} className="aspect-square bg-neutral-100">
                <PostImage src={p.image_url} alt={p.caption || 'Post'} className="h-full w-full" />
              </Link>
            ))}
          </div>
          <div className="flex justify-center p-6">
            <button className="btn-secondary flex items-center gap-2" onClick={() => load(true)} disabled={refreshing}>
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />{refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
