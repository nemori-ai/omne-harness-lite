import { cn } from '../../lib/utils.ts'
import { useLoopPause } from '../loading-state.tsx'

export function Shimmer({
  active,
  children,
  className,
}: {
  readonly active: boolean
  readonly children: React.ReactNode
  readonly className?: string
}): React.JSX.Element {
  const element = useLoopPause<HTMLSpanElement>(active)
  return (
    <span ref={element} className={cn(active && 'omne-shimmer animate-shimmer-text', className)}>
      {children}
    </span>
  )
}
