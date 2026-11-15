import { useCallback, useLayoutEffect, useRef, useState } from 'react'

import { cn } from '../lib/utils.ts'

export interface SegmentedOption<T extends string> {
  readonly value: T
  readonly label: React.ReactNode
  readonly icon?: React.ReactNode
}

interface Thumb {
  readonly left: number
  readonly width: number

  readonly slides: boolean
}

export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  readonly value: T
  readonly onValueChange: (value: T) => void
  readonly options: readonly SegmentedOption<T>[]

  readonly label: string
  readonly className?: string
}): React.JSX.Element {
  const track = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<Thumb | null>(null)

  const measure = useCallback((slides: boolean): void => {
    const host = track.current
    const chosen = host?.querySelector<HTMLElement>('[data-segment][aria-pressed="true"]') ?? null
    if (host === null || chosen === null) {
      setThumb(null)
      return
    }
    const next = { left: chosen.offsetLeft, width: chosen.offsetWidth }
    setThumb(current =>
      current !== null && current.left === next.left && current.width === next.width
        ? current
        : { ...next, slides: slides && current !== null },
    )
  }, [])

  useLayoutEffect(() => measure(true), [measure, value, options])
  useLayoutEffect(() => {
    const host = track.current
    if (host === null) return undefined
    const observer = new ResizeObserver(() => measure(false))
    observer.observe(host)
    return () => observer.disconnect()
  }, [measure])

  return (
    <div
      ref={track}
      role="group"
      aria-label={label}
      data-slot="segmented"
      className={cn('pe-segmented', className)}
    >
      {thumb !== null && (
        <span
          aria-hidden="true"
          data-segmented-thumb=""
          style={{
            width: thumb.width,
            transform: `translateX(${thumb.left}px)`,
            transition: thumb.slides
              ? 'transform var(--omne-motion-state) var(--omne-motion-ease-enter), width var(--omne-motion-state) var(--omne-motion-ease-enter)'
              : 'none',
          }}
        />
      )}
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          data-segment=""
          data-control="segment"
          aria-pressed={option.value === value}
          onClick={() => onValueChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}
