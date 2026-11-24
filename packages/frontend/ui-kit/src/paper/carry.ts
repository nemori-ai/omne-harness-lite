import { useEffect, useState } from 'react'

import { moveBox, type PaperBox, type PaperCorner, type PaperPoint, resizeBox } from './geometry.ts'
import { type PaperFrame } from './paper-surface.tsx'
import { capture, pastSlop } from './pointer.ts'

export type PaperGesture = 'move' | 'resize'

export type PlaceBox = (box: PaperBox, gesture: PaperGesture) => void

type Grip = Readonly<{ gesture: 'move' } | { gesture: 'resize'; corner: PaperCorner }>

type Hold = Readonly<{
  grip: Grip
  pointer: number
  x: number
  y: number
  from: PaperBox
  lifted: boolean
  at: PaperBox
}>

const KEY_DIRECTIONS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

export const KEY_SHORTCUTS = [
  'ArrowUp ArrowDown ArrowLeft ArrowRight',
  'Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight',
  'Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight',
  'Alt+Shift+ArrowUp Alt+Shift+ArrowDown Alt+Shift+ArrowLeft Alt+Shift+ArrowRight',
].join(' ')

function landing(frame: PaperFrame, from: PaperBox, grip: Grip, by: PaperPoint): PaperBox {
  return grip.gesture === 'move'
    ? moveBox(from, by, frame.sheet, frame.magnet)
    : resizeBox(from, grip.corner, by, frame.sheet, frame.limits, frame.magnet)
}

function same(one: PaperBox, other: PaperBox): boolean {
  return (
    one.x === other.x &&
    one.y === other.y &&
    one.width === other.width &&
    one.height === other.height
  )
}

type Handlers = Readonly<{
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void
}>

export function useCarry({
  box,
  frame,
  onPlace,
  onPress,
  resizable,
}: {
  readonly box: PaperBox
  readonly frame: PaperFrame
  readonly onPlace: PlaceBox
  readonly onPress: (() => void) | undefined
  readonly resizable: boolean
}): {
  readonly shown: PaperBox
  readonly gesture: PaperGesture | undefined
  readonly grip: (grip: Grip) => Handlers
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
} {
  const [hold, setHold] = useState<Hold | null>(null)
  const lifted = hold?.lifted === true

  useEffect(() => {
    if (!lifted) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setHold(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [lifted])

  const grip = (which: Grip): Handlers => ({
    onPointerDown: event => {
      if (event.button !== 0) return
      event.stopPropagation()
      setHold({
        grip: which,
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        from: box,
        lifted: false,
        at: box,
      })
    },
    onPointerMove: event => {
      if (hold === null || event.pointerId !== hold.pointer) return
      const by = { x: event.clientX - hold.x, y: event.clientY - hold.y }
      if (!hold.lifted && !pastSlop(by.x, by.y)) return
      if (!hold.lifted) capture(event.currentTarget, event.pointerId)
      const distance = { x: by.x / frame.scale, y: by.y / frame.scale }
      setHold({ ...hold, lifted: true, at: landing(frame, hold.from, hold.grip, distance) })
    },
    onPointerUp: event => {
      if (hold === null || event.pointerId !== hold.pointer) return
      setHold(null)
      if (hold.lifted) onPlace(hold.at, hold.grip.gesture)
      else if (hold.grip.gesture === 'move') onPress?.()
    },
    onPointerCancel: event => {
      if (hold !== null && event.pointerId === hold.pointer) setHold(null)
    },
  })

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.metaKey || event.ctrlKey) return
    if (!event.altKey && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      onPress?.()
      return
    }
    const direction = KEY_DIRECTIONS[event.key]
    if (direction === undefined) return
    event.preventDefault()
    if (event.shiftKey && !resizable) return
    const which: Grip = event.shiftKey ? { gesture: 'resize', corner: 'se' } : { gesture: 'move' }
    const step = event.altKey ? 1 : frame.sheet.step
    const next = landing(frame, box, which, { x: direction[0] * step, y: direction[1] * step })
    if (!same(next, box)) onPlace(next, which.gesture)
  }

  return {
    shown: hold !== null && hold.lifted ? hold.at : box,
    gesture: hold !== null && hold.lifted ? hold.grip.gesture : undefined,
    grip,
    onKeyDown,
  }
}
