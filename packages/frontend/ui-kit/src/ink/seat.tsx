import { createContext, useContext, useLayoutEffect, useRef } from 'react'

import { cn } from '../lib/utils.ts'
import { type FigureStore, type SeatBeside } from './store.ts'

export const StageContext = createContext<FigureStore | null>(null)

const SEAT_ROW = 'header, [role="toolbar"], [data-figure-row]'
const DRAWN_WHOLE = 'svg, img, canvas, input, textarea, select'
const DRAWN_WORDS = 'h1, h2, h3, h4, p, span, label, a, button, [role="button"]'

function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function besideOf(seat: HTMLElement): SeatBeside | undefined {
  const row = seat.closest(SEAT_ROW)
  if (row === null) return undefined
  const box = seat.getBoundingClientRect()
  const middle = box.left + box.width / 2
  let left = -Infinity
  let right = Infinity
  const consider = (element: Element): void => {
    if (element === seat || element.contains(seat)) return
    if (
      typeof (element as HTMLElement).checkVisibility === 'function' &&
      !(element as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true })
    )
      return
    const b = element.getBoundingClientRect()
    if (b.width < 2 || b.height < 2 || b.bottom <= box.top || b.top >= box.bottom) return
    if (b.right <= middle) left = Math.max(left, b.right)
    else if (b.left >= middle) right = Math.min(right, b.left)
  }
  for (const element of row.querySelectorAll(DRAWN_WHOLE))
    if ((element.parentElement?.closest('svg') ?? null) === null) consider(element)
  for (const element of row.querySelectorAll(DRAWN_WORDS)) {
    if (element.childElementCount === 0 && (element.textContent ?? '').trim() !== '')
      consider(element)
  }
  if (!Number.isFinite(left) && !Number.isFinite(right)) return undefined
  return {
    ...(Number.isFinite(left) && { left: round(left) }),
    ...(Number.isFinite(right) && { right: round(right) }),
  }
}

const sameBox = (a: DOMRect, b: DOMRect): boolean =>
  a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height

function watchBox(element: HTMLElement, changed: () => void): () => void {
  let watching: IntersectionObserver | null = null
  const arm = (shown: number): void => {
    watching?.disconnect()
    watching = null
    const box = element.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) return
    const root = document.documentElement
    const insets = [box.top, root.clientWidth - box.right, root.clientHeight - box.bottom, box.left]
    let first = true
    const observer = new IntersectionObserver(
      entries => {
        if (watching !== observer) return
        const ratio = entries.at(-1)?.intersectionRatio ?? 0
        const opening = first
        first = false
        if (opening && ratio === shown && sameBox(box, element.getBoundingClientRect())) return
        changed()
        arm(opening ? ratio : 1)
      },
      { rootMargin: insets.map(inset => `${-Math.floor(inset)}px`).join(' '), threshold: shown },
    )
    observer.observe(element)
    watching = observer
  }
  const resized = new ResizeObserver(() => {
    changed()
    arm(1)
  })
  resized.observe(element)
  arm(1)
  return () => {
    resized.disconnect()
    watching?.disconnect()
    watching = null
  }
}

export function FigureSeat({
  name,
  priority = 1,
  className,
}: {
  readonly name: string
  readonly priority?: number
  readonly className?: string
}): React.JSX.Element {
  const store = useContext(StageContext)
  const element = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const seat = element.current
    if (seat === null || store === null) return undefined
    const leave = store.seatAt(name, { element: seat, priority, beside: () => besideOf(seat) })
    const unwatch = watchBox(seat, store.hostChanged)
    return () => {
      unwatch()
      leave()
    }
  }, [store, name, priority])
  return (
    <span
      ref={element}
      className={cn('omne-figure-seat', className)}
      data-figure-seat={name}
      aria-hidden="true"
    />
  )
}
