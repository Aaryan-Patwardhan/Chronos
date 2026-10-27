export const INTERESTS: { tag: string; label: string; emoji: string }[] = [
  { tag: 'food', label: 'Food', emoji: '🍜' },
  { tag: 'travel', label: 'Travel', emoji: '✈️' },
  { tag: 'tech', label: 'Tech', emoji: '💻' },
  { tag: 'fitness', label: 'Fitness', emoji: '💪' },
  { tag: 'art', label: 'Art', emoji: '🎨' },
  { tag: 'music', label: 'Music', emoji: '🎵' },
  { tag: 'nature', label: 'Nature', emoji: '🌿' },
  { tag: 'pets', label: 'Pets', emoji: '🐾' },
  { tag: 'cricket', label: 'Cricket', emoji: '🏏' },
  { tag: 'photography', label: 'Photography', emoji: '📷' },
]

const ADJ = ['sunny', 'quiet', 'swift', 'bright', 'lucky', 'cosmic', 'calm', 'bold', 'urban', 'misty']
const NOUN = ['otter', 'falcon', 'tiger', 'panda', 'comet', 'lotus', 'river', 'maple', 'koala', 'pixel']
export const suggestUsername = () =>
  `${ADJ[Math.floor(Math.random() * ADJ.length)]}_${NOUN[Math.floor(Math.random() * NOUN.length)]}${Math.floor(10 + Math.random() * 90)}`
