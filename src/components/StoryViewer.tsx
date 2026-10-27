import { useEffect, useRef, useState, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, MessageCircle, Send, Heart, MoreHorizontal } from 'lucide-react'
import Avatar from './Avatar'
import type { Story, StoryUser } from '../types/stories'
import { timeAgo } from '../lib/time'

interface StoryViewerProps {
  user: StoryUser
  initialStoryIndex?: number
  onClose: () => void
  onNextUser: () => void
  onPrevUser: () => void
}

const STORY_DURATION = 5000 // 5 seconds per story

export default function StoryViewer({ user, initialStoryIndex = 0, onClose, onNextUser, onPrevUser }: StoryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialStoryIndex)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [showUI, setShowUI] = useState(true)
  const [volume, setVolume] = useState(1)

  const progressRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const stories = user.stories
  const currentStory = stories[currentIndex]
  const isLastStory = currentIndex === stories.length - 1
  const isFirstStory = currentIndex === 0

  // Progress animation
  const animateProgress = useCallback((timestamp: number) => {
    if (paused || !currentStory) return

    if (!startTimeRef.current) startTimeRef.current = timestamp
    const elapsed = timestamp - startTimeRef.current + progressRef.current
    const newProgress = Math.min((elapsed / STORY_DURATION) * 100, 100)
    setProgress(newProgress)

    if (newProgress >= 100) {
      handleNext()
    } else {
      rafRef.current = requestAnimationFrame(animateProgress)
    }
  }, [paused, currentStory])

  useEffect(() => {
    progressRef.current = 0
    startTimeRef.current = null
    setProgress(0)
    if (!paused) {
      rafRef.current = requestAnimationFrame(animateProgress)
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [currentIndex, paused, animateProgress])

  const handleNext = useCallback(() => {
    if (isLastStory) {
      onNextUser()
    } else {
      setCurrentIndex((i) => i + 1)
    }
  }, [isLastStory, onNextUser])

  const handlePrev = useCallback(() => {
    if (isFirstStory) {
      onPrevUser()
    } else {
      setCurrentIndex((i) => i - 1)
    }
  }, [isFirstStory, onPrevUser])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') handleNext()
    else if (e.key === 'ArrowLeft') handlePrev()
    else if (e.key === 'Escape') onClose()
    else if (e.key === ' ') { e.preventDefault(); setPaused(!paused) }
    else if (e.key === 'm') setVolume(v => v === 0 ? 1 : 0)
  }, [handleNext, handlePrev, onClose, paused])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Click/tap handlers for navigation zones
  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const third = rect.width / 3

    if (clickX < third) handlePrev()
    else if (clickX > third * 2) handleNext()
    else setPaused(!paused)
  }, [handlePrev, handleNext, paused])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = touch.clientX - rect.left
    const third = rect.width / 3

    if (clickX < third) handlePrev()
    else if (clickX > third * 2) handleNext()
    else setPaused(!paused)
  }, [handlePrev, handleNext])

  if (!currentStory) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`${user.full_name}'s story`}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onMouseEnter={() => setShowUI(true)}
      onMouseLeave={() => setShowUI(false)}
    >
      {/* Media */}
      <div className="absolute inset-0 flex items-center justify-center">
        {currentStory.media_type === 'video' ? (
          <video
            ref={videoRef}
            src={currentStory.media_url}
            autoPlay
            muted={volume === 0}
            playsInline
            className="max-h-full max-w-full"
            onLoadedData={() => videoRef.current?.play().catch(() => {})}
          />
        ) : (
          <img
            ref={imageRef}
            src={currentStory.media_url}
            alt={`${user.full_name}'s story`}
            className="max-h-full max-w-full object-contain"
          />
        )}
      </div>

      {/* Top bar */}
      <div className={`absolute top-0 left-0 right-0 px-4 py-3 flex items-center justify-between transition-opacity duration-200 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1 rounded-full bg-black/30 hover:bg-black/50" aria-label="Close story">
            <X size={24} className="text-white" />
          </button>
          <button className="flex items-center gap-2 p-1 rounded-full bg-black/30 hover:bg-black/50">
            <Avatar src={user.avatar_url} name={user.username} size={32} />
            <div className="text-left">
              <p className="text-white font-medium text-sm">{user.full_name}</p>
              <p className="text-white/70 text-xs">{timeAgo(currentStory.created_at)}</p>
            </div>
          </button>
        </div>

        {/* Progress bars */}
        <div className="flex gap-1.5 flex-1 mx-4 max-w-md" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          {stories.map((_, i) => (
            <div key={i} className="flex-1 h-1.5 rounded-full bg-white/30 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 ease-linear"
                style={{
                  width: i < currentIndex ? '100%' : i === currentIndex ? `${progress}%` : '0%',
                  background: i < currentIndex ? 'white' : i === currentIndex ? 'linear-gradient(to right, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' : 'transparent',
                }}
              />
            </div>
          ))}
        </div>

        <button className="p-1 rounded-full bg-black/30 hover:bg-black/50" aria-label="More options">
          <MoreHorizontal size={24} className="text-white" />
        </button>
      </div>

      {/* Navigation hints */}
      {!paused && showUI && (
        <>
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1/3 h-full px-4" aria-hidden="true">
            <div className="flex items-center justify-start h-full">
              <ChevronLeft size={32} className="text-white/50 hover:text-white transition-colors" />
            </div>
          </div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1/3 h-full px-4" aria-hidden="true">
            <div className="flex items-center justify-end h-full">
              <ChevronRight size={32} className="text-white/50 hover:text-white transition-colors" />
            </div>
          </div>
        </>
      )}

      {/* Bottom actions */}
      <div className={`absolute bottom-0 left-0 right-0 px-4 pb-6 flex items-end justify-between transition-opacity duration-200 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-3">
          <button className="p-2 rounded-full bg-black/30 hover:bg-black/50" aria-label="Reply">
            <MessageCircle size={24} className="text-white" />
          </button>
          <button className="p-2 rounded-full bg-black/30 hover:bg-black/50" aria-label="Share">
            <Send size={24} className="text-white" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 rounded-full bg-black/30 hover:bg-black/50" aria-label="Like">
            <Heart size={24} className="text-white" />
          </button>
        </div>
      </div>

      {/* Pause indicator */}
      {paused && showUI && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/50 backdrop-blur-sm rounded-full px-6 py-3 text-white font-medium">
            Paused — tap to resume
          </div>
        </div>
      )}
    </div>
  )
}