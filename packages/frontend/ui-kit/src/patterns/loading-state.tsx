import { useEffect, useId, useRef, type ReactNode } from 'react'

import { cn } from '../lib/utils.ts'
import { COUNTED_DROPS, DROPS, type Drop } from './loading-ink.ts'

export function useLoopPause<T extends HTMLElement>(active: boolean): React.RefObject<T | null> {
  const element = useRef<T>(null)
  useEffect(() => {
    const node = element.current
    if (node === null) return
    let inView = true
    const sync = (): void => {
      node.dataset['paused'] = String(!active || !inView || document.hidden)
    }
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            inView = entry?.isIntersecting ?? false
            sync()
          })
    observer?.observe(node)
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => {
      observer?.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [active])
  return element
}

function InkDrop({
  drop,
  turn,
  mask,
}: {
  readonly drop: Drop
  readonly turn: number
  readonly mask: string
}): React.JSX.Element {
  return (
    <g data-turn={turn}>
      <path className="pe-loading-trace" d={drop.stroke.ink} />
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <path
          className="pe-loading-brush"
          d={drop.stroke.trail}
          fill="none"
          stroke="white"
          strokeWidth={drop.reach}
          pathLength={1}
        />
      </mask>
      <path className="pe-loading-wet" d={drop.stroke.ink} mask={`url(#${mask})`} />
    </g>
  )
}

export function LoadingIndicator({
  className,
  size = 'md',
  active = true,
  children,
}: {
  readonly className?: string
  readonly size?: 'sm' | 'md'
  readonly active?: boolean

  readonly children?: ReactNode
}): React.JSX.Element {
  const element = useLoopPause<HTMLSpanElement>(active)
  const id = useId()
  const counted = children !== undefined

  const drops = counted
    ? COUNTED_DROPS.map((drop, index) => ({ drop, turn: index * 2 }))
    : DROPS.map((drop, turn) => ({ drop, turn }))

  return (
    <span
      ref={element}
      aria-hidden="true"
      data-loading-indicator=""
      data-size={size}
      data-active={active}
      data-counted={counted || undefined}
      className={cn('pe-loading-indicator', className)}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" focusable="false">
        {drops.map(({ drop, turn }) => (
          <InkDrop key={turn} drop={drop} turn={turn} mask={`pe-loading-${id}-${turn}`} />
        ))}
      </svg>
      {counted && <span className="pe-loading-ordinal tabular-nums">{children}</span>}
    </span>
  )
}

export function LoadingState({
  label,
  className,
}: {
  readonly label: ReactNode
  readonly className?: string
}): React.JSX.Element {
  return (
    <span
      role="status"
      aria-label={typeof label === 'string' ? label : undefined}
      className={cn('pe-loading-state', className)}
    >
      <LoadingIndicator />
      <span>{label}</span>
    </span>
  )
}
