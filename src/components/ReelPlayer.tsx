import { useEffect, useRef, useState, useCallback } from 'react'
import { Heart, MessageCircle, Send, Volume2, VolumeX, MoreHorizontal, Share2, Bookmark, RotateCcw } from 'lucide-react'
import Avatar from './Avatar'
import type { Reel } from '../types/reels'
import { timeAgo } from '../lib/time'
import { formatCount } from '../lib/format'

interface ReelPlayerProps {
  reel: Reel
  onLike: (reelId: string) => void
  onShare: (reelId: string) => void
  onSave: (reelId: string) => void
  onProfile: (username: string) => void
  onClose: () => void
  onNext: () => void
  onPrev: () => void
}

export default function ReelPlayer({
  reel,
  onLike,
  onShare,
  onSave,
  onProfile,
  onClose,
  onNext,
  onPrev,
}: ReelPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(false)
  const [liked, setLiked] = useState(!!reel.liked)
  const [likes, setLikes] = useState(reel.like_count)
  const [showMore, setShowMore] = useState(false)
  const [heartAnimation, setHeartAnimation] = useState(false)
  const touchStartY = useRef<number>(0)
  const touchStartX = useRef<number>(0)

  useEffect(() => {
    const video = videoRef.current
    if (video) {
      video.muted = muted
      if (playing) {
        video.play().catch(() => {})
      } else {
        video.pause()
      }
    }
    return () => {
      if (video) video.pause()
    }
  }, [playing, muted])

  useEffect(() => {
    const video = videoRef.current
    if (video) {
      video.currentTime = 0
      if (playing) video.play().catch(() => {})
    }
  }, [reel.id])

  const handleVideoEnd = useCallback(() => {
    onNext()
  }, [onNext])

  const handleDoubleClick = useCallback(() => {
    if (!liked) {
      handleLike()
    }
    setHeartAnimation(true)
    setTimeout(() => setHeartAnimation(false), 800)
  }, [liked])

  const handleLike = useCallback(() => {
    const next = !liked
    setLiked(next)
    setLikes(prev => prev + (next ? 1 : -1))
    onLike(reel.id)
  }, [liked, reel.id, onLike])

  const handleShare = useCallback(() => {
    onShare(reel.id)
  }, [reel.id, onShare])

  const handleSave = useCallback(() => {
    onSave(reel.id)
  }, [reel.id, onSave])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'j') onNext()
    else if (e.key === 'ArrowUp' || e.key === 'k') onPrev()
    else if (e.key === 'Escape') onClose()
    else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p) }
    else if (e.key === 'm') setMuted(m => !m)
    else if (e.key === 'l') handleLike()
  }, [onNext, onPrev, onClose, handleLike])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    touchStartX.current = e.touches[0].clientX
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const deltaY = touchStartY.current - e.changedTouches[0].clientY
    const deltaX = touchStartX.current - e.changedTouches[0].clientX
    
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      if (deltaY > 50) onNext()
      else if (deltaY < -50) onPrev()
    }
  }, [onNext, onPrev])

  const handleVideoClick = useCallback(() => {
    setPlaying(p => !p)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Reel"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
    >
      {/* Video */}
      <video
        ref={videoRef}
        src={reel.video_url}
        poster={reel.poster_url}
        autoPlay
        loop
        playsInline
        muted={muted}
        className="absolute inset-0 w-full h-full object-cover"
        onEnded={handleVideoEnd}
        onClick={handleVideoClick}
      />

      {/* Gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

      {/* Heart animation on double tap */}
      {heartAnimation && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <Heart size={100} className="text-white fill-rose-500 animate-heart-pop" />
        </div>
      )}

      {/* Left side - Profile & Caption */}
      <div className="absolute left-4 bottom-24 flex flex-col gap-3 z-20 max-w-[60%]">
        <button
          onClick={() => onProfile(reel.username)}
          className="flex items-center gap-3 group"
          aria-label={`View ${reel.full_name}'s profile`}
        >
          <Avatar src={reel.avatar_url} name={reel.username} size={40} />
          <div className="text-left">
            <p className="text-white font-semibold text-sm">{reel.full_name}</p>
            <p className="text-white/70 text-xs">@{reel.username}</p>
          </div>
        </button>
        <div className="bg-black/50 backdrop-blur-sm rounded-xl px-4 py-3 text-white max-w-xs">
          <p className="text-sm">{reel.caption}</p>
          {reel.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {reel.tags.slice(0, 5).map((tag) => (
                <span key={tag} className="text-white/80 text-xs px-2 py-0.5 rounded-full bg-white/10">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right side - Actions */}
      <div className="absolute right-4 bottom-24 flex flex-col items-center gap-5 z-20">
        <button
          onClick={handleLike}
          className={`flex flex-col items-center gap-1.5 p-2 ${liked ? 'text-rose-500' : 'text-white'}`}
          aria-label={liked ? 'Unlike' : 'Like'}
        >
          <Heart size={28} className={liked ? 'fill-current' : ''} />
          <span className="text-xs font-medium">{formatCount(likes)}</span>
        </button>
        <button
          onClick={() => {}}
          className="flex flex-col items-center gap-1.5 p-2 text-white"
          aria-label="Comments"
        >
          <MessageCircle size={28} />
          <span className="text-xs font-medium">{formatCount(reel.comment_count)}</span>
        </button>
        <button
          onClick={handleShare}
          className="flex flex-col items-center gap-1.5 p-2 text-white"
          aria-label="Share"
        >
          <Send size={28} />
          <span className="text-xs font-medium">{formatCount(reel.share_count)}</span>
        </button>
        <button
          onClick={handleSave}
          className="flex flex-col items-center gap-1.5 p-2 text-white"
          aria-label="Save"
        >
          <Bookmark size={28} className="fill-none" />
          <span className="text-xs font-medium">Save</span>
        </button>
        <button
          onClick={() => setMuted(!muted)}
          className="flex flex-col items-center gap-1.5 p-2 text-white"
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX size={28} /> : <Volume2 size={28} />}
          <span className="text-xs font-medium">{muted ? 'Muted' : 'Sound'}</span>
        </button>
        <button
          onClick={() => setShowMore(!showMore)}
          className="flex flex-col items-center gap-1.5 p-2 text-white"
          aria-label="More options"
        >
          <MoreHorizontal size={28} />
          <span className="text-xs font-medium">More</span>
        </button>
        <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
          <Avatar src={reel.avatar_url} name={reel.username} size={40} className="rounded-full" />
        </div>
      </div>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 px-4 py-4 flex items-center justify-between z-20">
        <button onClick={onClose} className="p-2 rounded-full bg-black/30 hover:bg-black/50" aria-label="Close Reels">
          <RotateCcw size={24} className="text-white" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm">Reels</span>
        </div>
        <div className="w-10" />
      </div>

      {/* Progress indicator */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
        <div
          className="h-full bg-white transition-all duration-300 ease-linear"
          style={{ width: '100%' }}
        />
      </div>

      {/* Stats */}
      <div className="absolute bottom-100 left-4 right-4 mb-24 flex items-center justify-between px-4 z-20">
        <div className="text-white text-sm">
          {formatCount(reel.view_count)} views · {timeAgo(reel.created_at)}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/70 text-xs">{reel.duration}s</span>
        </div>
      </div>

      {/* More options modal */}
      {showMore && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMore(false)} />
          <div className="relative bg-white rounded-t-2xl px-4 py-6 w-full max-w-sm animate-slide-up">
            <div className="w-10 h-1 mx-auto mb-4 rounded-full bg-neutral-300" />
            <div className="space-y-3">
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left text-neutral-900 hover:bg-neutral-100 rounded-xl">
                <Share2 size={20} /> Share to...
              </button>
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left text-neutral-900 hover:bg-neutral-100 rounded-xl">
                <Bookmark size={20} /> Save
              </button>
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left text-neutral-900 hover:bg-neutral-100 rounded-xl">
                <MessageCircle size={20} /> Report
              </button>
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left text-rose-600 hover:bg-neutral-100 rounded-xl">
                <RotateCcw size={20} /> Not interested
              </button>
            </div>
            <button
              onClick={() => setShowMore(false)}
              className="mt-4 w-full py-3 text-neutral-600 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}