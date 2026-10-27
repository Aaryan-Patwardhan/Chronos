import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import ReelPlayer from '../components/ReelPlayer'
import type { Reel } from '../types/reels'
import { MOCK_REELS } from '../data/mockReels'
import { formatCount } from '../lib/format'

export default function Reels() {
  const [reels] = useState<Reel[]>(MOCK_REELS)
  const [activeIndex, setActiveIndex] = useState(0)
  const [showPlayer, setShowPlayer] = useState(false)
  const playerRef = useRef<HTMLDivElement>(null)

  const handleOpenReel = useCallback((index: number) => {
    setActiveIndex(index)
    setShowPlayer(true)
  }, [])

  const handleClosePlayer = useCallback(() => {
    setShowPlayer(false)
  }, [])

  const handleNext = useCallback(() => {
    setActiveIndex(prev => (prev + 1) % reels.length)
  }, [reels.length])

  const handlePrev = useCallback(() => {
    setActiveIndex(prev => (prev - 1 + reels.length) % reels.length)
  }, [reels.length])

  const handleLike = useCallback((reelId: string) => {
    // In a real app, this would call the API
    console.log('Like reel:', reelId)
  }, [])

  const handleShare = useCallback((reelId: string) => {
    const reel = reels.find(r => r.id === reelId)
    if (reel) {
      const url = `${location.origin}/reel/${reel.id}`
      navigator.clipboard.writeText(url).catch(() => {})
    }
  }, [reels])

  const handleSave = useCallback((reelId: string) => {
    console.log('Save reel:', reelId)
  }, [])

  const handleProfile = useCallback((username: string) => {
    setShowPlayer(false)
    // Navigate to profile
    window.location.href = `/u/${username}`
  }, [])

  if (!showPlayer) {
    return (
      <div className="max-w-screen-md mx-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-neutral-900">Reels</h1>
          <div className="flex items-center gap-4">
            <button className="p-2 rounded-full hover:bg-neutral-100" aria-label="Camera">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </button>
            <button className="p-2 rounded-full hover:bg-neutral-100" aria-label="Search">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-2">
          {reels.map((reel, index) => (
            <ReelCard
              key={reel.id}
              reel={reel}
              onClick={() => handleOpenReel(index)}
            />
          ))}
        </div>
      </div>
    )
  }

  const activeReel = reels[activeIndex]

  return (
    <>
      <div className="max-w-screen-md mx-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-neutral-900">Reels</h1>
          <div className="flex items-center gap-4">
            <button className="p-2 rounded-full hover:bg-neutral-100" aria-label="Camera">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </button>
            <button className="p-2 rounded-full hover:bg-neutral-100" aria-label="Search">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-2">
          {reels.map((reel, index) => (
            <ReelCard
              key={reel.id}
              reel={reel}
              onClick={() => handleOpenReel(index)}
            />
          ))}
        </div>
      </div>

      {activeReel && (
        <ReelPlayer
          reel={activeReel}
          onLike={handleLike}
          onShare={handleShare}
          onSave={handleSave}
          onProfile={handleProfile}
          onClose={handleClosePlayer}
          onNext={handleNext}
          onPrev={handlePrev}
        />
      )}
    </>
  )
}

function ReelCard({ reel, onClick }: { reel: Reel; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative aspect-[9/16] rounded-xl overflow-hidden bg-neutral-100 group"
      aria-label={`Watch reel by ${reel.full_name}`}
    >
      <img
        src={reel.poster_url}
        alt=""
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
        <div>
          <p className="text-white font-medium text-sm truncate">{reel.caption}</p>
          <div className="flex items-center gap-2 mt-1">
            <img
              src={reel.avatar_url}
              alt=""
              className="w-5 h-5 rounded-full"
            />
            <span className="text-white text-xs font-medium">{reel.username}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-white">
          <span className="flex items-center gap-1 text-sm font-medium">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 21a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2v14z" />
              <circle cx="12" cy="12" r="4" />
            </svg>
            {formatCount(reel.view_count)}
          </span>
        </div>
      </div>
      <div className="absolute top-3 right-3">
        <span className="bg-black/50 text-white text-xs px-2 py-1 rounded-full font-medium">
          {reel.duration}s
        </span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" className="text-white">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      </div>
    </button>
  )
}