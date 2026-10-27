export default function Avatar({ src, name, size = 32, className = '' }: { src?: string; name?: string; size?: number; className?: string }) {
  return (
    <img
      src={src || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name ?? '?')}`}
      alt={name ? `${name}'s profile picture` : ''}
      width={size}
      height={size}
      className={`shrink-0 rounded-full bg-neutral-200 object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
