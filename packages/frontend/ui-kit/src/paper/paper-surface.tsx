import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { cn } from '../lib/utils.ts'
import { useSizeFactor } from '../size/use-size-factor.ts'
import {
  clampView,
  type Lens,
  type Magnet,
  panBy,
  type PaperSheet,
  type PaperView,
  type SizeLimits,
  type ZoomLimits,
  zoomAround,
} from './geometry.ts'
import { capture, pastSlop } from './pointer.ts'

const PINCH_RATE = 0.01
const WHEEL_ZOOM_RATE = 0.002
const LINE_HEIGHT = 16
const ZOOM_KEY_FACTOR = 1.25
const PAN_KEY_STEPS = 4
const PAN_KEY_STEPS_FAR = 16

export type PaperFrame = Readonly<{
  sheet: PaperSheet
  limits: SizeLimits
  magnet: Magnet
  scale: number
}>

const Frame = createContext<PaperFrame | null>(null)

export function usePaperFrame(): PaperFrame {
  const frame = useContext(Frame)
  if (frame === null) throw new Error('A page of paper is drawn inside a PaperSurface.')
  return frame
}

const PAN_KEYS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

function zoomKey(key: string, zoom: number): number | undefined {
  if (key === '+' || key === '=') return zoom * ZOOM_KEY_FACTOR
  if (key === '-' || key === '_') return zoom / ZOOM_KEY_FACTOR
  if (key === '0') return 1
  return undefined
}

function wheelPixels(event: WheelEvent, height: number): readonly [number, number] {
  const unit =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? LINE_HEIGHT
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? height
        : 1
  return [event.deltaX * unit, event.deltaY * unit]
}

function isBare(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-paper-item]') === null
}

type Pan = Readonly<{ pointer: number; x: number; y: number; view: PaperView; moved: boolean }>

type Looking = Readonly<{
  shown: PaperView
  sheet: PaperSheet
  lens: Lens
  zoomLimits: ZoomLimits
  hand: (next: PaperView) => void
}>

function useSeen(root: React.RefObject<HTMLDivElement | null>): {
  width: number
  height: number
} {
  const [seen, setSeen] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = root.current
    if (element === null) return undefined
    const measure = (): void =>
      setSeen(was =>
        was.width === element.clientWidth && was.height === element.clientHeight
          ? was
          : { width: element.clientWidth, height: element.clientHeight },
      )
    measure()
    if (typeof ResizeObserver !== 'function') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [root])
  return seen
}

function wheeled(event: WheelEvent, element: Element, now: Looking): PaperView {
  const [dx, dy] = wheelPixels(event, now.lens.height)
  if (!event.ctrlKey && !event.metaKey)
    return panBy(now.shown, { x: -dx, y: -dy }, now.sheet, now.lens, now.zoomLimits)
  const box = element.getBoundingClientRect()
  return zoomAround(
    now.shown,
    { x: event.clientX - box.left, y: event.clientY - box.top },
    now.shown.zoom * Math.exp(-dy * (event.ctrlKey ? PINCH_RATE : WHEEL_ZOOM_RATE)),
    now.sheet,
    now.lens,
    now.zoomLimits,
  )
}

function useWheel(root: React.RefObject<HTMLDivElement | null>, looking: Looking): void {
  const latest = useRef(looking)
  latest.current = looking
  useEffect(() => {
    const element = root.current
    if (element === null) return undefined
    const onWheel = (event: WheelEvent): void => {
      const zooming = event.ctrlKey || event.metaKey
      if (!zooming && !isBare(event.target)) return
      const now = latest.current
      const next = wheeled(event, element, now)
      if (zooming || next.x !== now.shown.x || next.y !== now.shown.y) event.preventDefault()
      now.hand(next)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [root])
}

function keyed(event: React.KeyboardEvent, now: Looking): PaperView | undefined {
  const direction = PAN_KEYS[event.key]
  if (direction !== undefined) {
    const reach = now.sheet.step * (event.shiftKey ? PAN_KEY_STEPS_FAR : PAN_KEY_STEPS)
    const scale = now.shown.zoom * (now.lens.sizeFactor > 0 ? now.lens.sizeFactor : 1)
    return panBy(
      now.shown,
      { x: -direction[0] * reach * scale, y: -direction[1] * reach * scale },
      now.sheet,
      now.lens,
      now.zoomLimits,
    )
  }
  const zoom = zoomKey(event.key, now.shown.zoom)
  if (zoom === undefined) return undefined
  const centre = { x: now.lens.width / 2, y: now.lens.height / 2 }
  return zoomAround(now.shown, centre, zoom, now.sheet, now.lens, now.zoomLimits)
}

function usePan(now: Looking): {
  readonly moving: boolean
  readonly handlers: Readonly<{
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void
    onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void
  }>
} {
  const [pan, setPan] = useState<Pan | null>(null)
  const end = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (pan !== null && event.pointerId === pan.pointer) setPan(null)
  }
  return {
    moving: pan?.moved === true,
    handlers: {
      onPointerDown: event => {
        if (event.button !== 0 || !isBare(event.target)) return
        const { pointerId: pointer, clientX: x, clientY: y } = event
        setPan({ pointer, x, y, view: now.shown, moved: false })
      },
      onPointerMove: event => {
        if (pan === null || event.pointerId !== pan.pointer) return
        const by = { x: event.clientX - pan.x, y: event.clientY - pan.y }
        if (!pan.moved) {
          if (!pastSlop(by.x, by.y)) return
          capture(event.currentTarget, event.pointerId)
          setPan({ ...pan, moved: true })
        }
        now.hand(panBy(pan.view, by, now.sheet, now.lens, now.zoomLimits))
      },
      onPointerUp: end,
      onPointerCancel: end,
    },
  }
}

export function PaperSurface({
  sheet,
  view,
  onViewChange,
  zoomLimits,
  limits,
  magnet,
  showGrid = false,
  label,
  roleDescription = '纸面',
  className,
  children,
}: {
  readonly sheet: PaperSheet
  readonly view: PaperView
  readonly onViewChange: (view: PaperView) => void
  readonly zoomLimits: ZoomLimits
  readonly limits: SizeLimits
  readonly magnet: boolean
  readonly showGrid?: boolean
  readonly label: string
  readonly roleDescription?: string
  readonly className?: string
  readonly children?: React.ReactNode
}): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  const sizeFactor = useSizeFactor()
  const lens: Lens = { ...useSeen(root), sizeFactor }
  const shown = clampView(view, sheet, lens, zoomLimits)
  const hand = (next: PaperView): void => {
    if (next.x !== shown.x || next.y !== shown.y || next.zoom !== shown.zoom) onViewChange(next)
  }
  const looking: Looking = { shown, sheet, lens, zoomLimits, hand }
  useWheel(root, looking)
  const pan = usePan(looking)

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget || event.altKey || event.metaKey || event.ctrlKey)
      return
    const next = keyed(event, looking)
    if (next === undefined) return
    event.preventDefault()
    hand(next)
  }

  return (
    <div
      ref={root}
      role="region"
      aria-label={label}
      aria-roledescription={roleDescription}
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight = - 0"
      tabIndex={0}
      data-control="paper"
      data-gesture={pan.moving ? 'pan' : undefined}
      className={cn('omne-paper-surface', className)}
      onKeyDown={onKeyDown}
      {...pan.handlers}
    >
      <div
        className="omne-paper-lens"
        style={
          {
            '--omne-paper-zoom': shown.zoom,
            '--omne-paper-at-x': shown.x,
            '--omne-paper-at-y': shown.y,
          } as React.CSSProperties
        }
      >
        <div
          className="omne-paper-sheet omne-size-standard"
          data-grid={showGrid ? '' : undefined}
          style={
            {
              '--omne-paper-width': sheet.width,
              '--omne-paper-height': sheet.height,
              '--omne-paper-step': sheet.step,
            } as React.CSSProperties
          }
        >
          <Frame.Provider
            value={{
              sheet,
              limits,
              magnet: { on: magnet, step: sheet.step },
              scale: shown.zoom * (sizeFactor > 0 ? sizeFactor : 1),
            }}
          >
            {children}
          </Frame.Provider>
        </div>
      </div>
    </div>
  )
}
