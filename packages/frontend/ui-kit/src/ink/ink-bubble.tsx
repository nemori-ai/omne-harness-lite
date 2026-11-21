import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { type Point } from '../icons/brush.ts'
import { useReducedMotion } from '../motion/motion.ts'
import { NoteInk } from './note-bubble.tsx'
import { type BubbleInk } from './note-ink.ts'
import { type Box } from './travel.ts'

export type BubbleSide = 'right' | 'left' | 'below' | 'above'

export const BESIDE = { gap: 2, margin: 12, level: 20 } as const

type Placed = { readonly left: number; readonly top: number; readonly side: BubbleSide }

const OPPOSITE: Record<BubbleSide, BubbleSide> = {
  right: 'left',
  left: 'right',
  below: 'above',
  above: 'below',
}

export function placeBeside(
  figure: Box,
  size: { readonly width: number; readonly height: number },
  side: BubbleSide,
  bounds: Box,
): Placed {
  const [cx, cy] = [figure.x + figure.width / 2, figure.y + figure.height / 2]
  const spot = (on: BubbleSide): Placed => {
    if (on === 'right')
      return { side: on, left: figure.x + figure.width + BESIDE.gap, top: cy - BESIDE.level }
    if (on === 'left')
      return { side: on, left: figure.x - BESIDE.gap - size.width, top: cy - BESIDE.level }
    if (on === 'below')
      return {
        side: on,
        left: cx - size.width / 2,
        top: Math.max(figure.y + figure.height + BESIDE.gap, bounds.y),
      }
    return { side: on, left: cx - size.width / 2, top: figure.y - BESIDE.gap - size.height }
  }
  const [x0, y0, x1, y1] = [
    bounds.x + BESIDE.margin,
    bounds.y,
    bounds.x + bounds.width - BESIDE.margin,
    bounds.y + bounds.height - BESIDE.margin,
  ]
  const fits = ({ left, top, side: on }: Placed): boolean =>
    on === 'right' || on === 'left'
      ? left >= x0 && left + size.width <= x1
      : top >= y0 && top + size.height <= y1
  const chosen = [spot(side), spot(OPPOSITE[side])].find(fits) ?? spot(side)
  return {
    side: chosen.side,
    left: Math.max(x0, Math.min(x1 - size.width, chosen.left)),
    top: Math.max(y0, Math.min(y1 - size.height, chosen.top)),
  }
}

const windowBox = (): Box => ({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight })
const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.5
const samePlace = (was: Placed | null, next: Placed): boolean =>
  was !== null && was.side === next.side && near(was.left, next.left) && near(was.top, next.top)
const samePoint = (was: Point | null, left: number, top: number): boolean =>
  was !== null && near(was[0], left) && near(was[1], top)

function usePlacement(
  own: React.RefObject<HTMLElement | null>,
  figure: Box,
  side: BubbleSide | undefined,
  bounds: Box | null,
  origin: Point | null | undefined,
): { readonly placed: Placed | null; readonly at: Point | null } {
  const [placed, setPlaced] = useState<Placed | null>(null)
  const [looked, setLooked] = useState<Point | null>(null)
  const [, setMoved] = useState(0)
  useEffect(() => {
    const element = own.current
    if (element === null) return undefined
    const again = (): void => setMoved(n => n + 1)
    const observer = new ResizeObserver(again)
    observer.observe(element)
    window.addEventListener('resize', again)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', again)
    }
  }, [own])
  useLayoutEffect(() => {
    const element = own.current
    if (element === null) return
    if (side !== undefined) {
      const next = placeBeside(
        figure,
        { width: element.offsetWidth, height: element.offsetHeight },
        side,
        bounds ?? windowBox(),
      )
      if (!samePlace(placed, next)) {
        setPlaced(next)
        return
      }
    }
    if (origin !== undefined) return
    const box = element.getBoundingClientRect()
    if (!samePoint(looked, box.left, box.top)) setLooked([box.left, box.top])
  })
  const at = origin !== undefined ? origin : side !== undefined && placed === null ? null : looked
  return { placed, at }
}

export function useUnfold<T>(value: T | null): {
  readonly shown: T | null
  readonly closing: boolean
  readonly serial: number
  readonly gone: () => void
} {
  const [state, setState] = useState({ seen: value, kept: value, serial: 0 })
  let now = state
  if (value !== state.seen) {
    now = {
      seen: value,
      kept: value ?? state.kept,
      serial: state.seen === null && value !== null ? state.serial + 1 : state.serial,
    }
    setState(now)
  }
  const { serial } = now
  const gone = useCallback(
    () =>
      setState(was => (was.serial === serial && was.seen === null ? { ...was, kept: null } : was)),
    [serial],
  )
  return { shown: value ?? now.kept, closing: value === null && now.kept !== null, serial, gone }
}

type Element = 'section' | 'figure' | 'div'

export function InkBubble({
  as: Tag = 'div',
  figure,
  side,
  bounds = null,
  origin,
  ink = 'full',
  closing = false,
  onGone = null,
  reduced: told,
  ref,
  className,
  style,
  children,
  ...rest
}: Omit<React.HTMLAttributes<HTMLElement>, 'children'> & {
  readonly as?: Element
  readonly figure: Box
  readonly side?: BubbleSide
  readonly bounds?: Box | null
  readonly origin?: Point | null
  readonly ink?: BubbleInk
  readonly closing?: boolean
  readonly onGone?: (() => void) | null
  readonly reduced?: boolean
  readonly ref?: React.Ref<HTMLElement>
  readonly children?: React.ReactNode
}): React.JSX.Element {
  const system = useReducedMotion()
  const reduced = told ?? system
  const own = useRef<HTMLElement | null>(null)
  const attach = useCallback(
    (element: HTMLElement | null) => {
      own.current = element
      if (typeof ref === 'function') ref(element)
      else if (ref) (ref as React.RefObject<HTMLElement | null>).current = element
    },
    [ref],
  )
  const { placed, at } = usePlacement(own, figure, side, bounds, origin)
  const unplaced = side !== undefined && placed === null
  return (
    <Tag
      ref={attach}
      className={className === undefined ? 'omne-ink-bubble' : `omne-ink-bubble ${className}`}
      data-ink-strength={ink}
      data-side={placed?.side}
      data-ink={reduced ? 'open' : 'writing'}
      {...rest}
      style={{
        ...style,
        ...(placed !== null && { left: placed.left, top: placed.top }),
        ...(unplaced && { visibility: 'hidden' }),
      }}
    >
      <div className="omne-ink-bubble-paper" aria-hidden="true" />
      {at !== null && (
        <NoteInk
          anchor={[figure.x + figure.width / 2, figure.y + figure.height / 2]}
          origin={at}
          ink={ink}
          closing={closing}
          reduced={reduced}
          onGone={onGone}
        />
      )}
      {children}
    </Tag>
  )
}
