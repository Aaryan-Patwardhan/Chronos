// Post photo with lazy loading and a calm placeholder if it can't load.
import { useState } from 'react'
import { ImageOff } from 'lucide-react'

export default function PostImage({ src, alt, className = '', style }: { src: string; alt: string; className?: string; style?: React.CSSProperties }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div style={style} className={`flex flex-col items-center justify-center gap-1 bg-neutral-100 text-xs text-neutral-400 ${className}`} role="img" aria-label="Photo unavailable">
        <ImageOff size={22} />
        <span>Photo unavailable</span>
      </div>
    )
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" style={style} className={`bg-neutral-100 object-cover ${className}`} onError={() => setFailed(true)} />
}
