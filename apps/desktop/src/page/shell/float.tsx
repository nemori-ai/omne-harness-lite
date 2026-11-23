import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FLOAT_GRIP_ATTRIBUTE, type FloatItem } from '@omne-harness/shell-contract'
import {
  DEFAULT_PLACE,
  cornerOf,
  kept,
  placeAt,
  styleOf,
  type Extent,
  type FloatPlace,
  type FloatPlaces,
} from './float-place.ts'
import { useSlot } from './hooks.ts'
import { Item } from './item.tsx'
import type { ShellState } from './state.ts'

const GRIP = { [FLOAT_GRIP_ATTRIBUTE]: '' } as const

/** How far a pressed pointer moves before the press is a drag and no longer a click. */
const DRAG_AFTER = 4

type Press = Readonly<{ pointer: number; x: number; y: number; grabX: number; grabY: number }>

type Room = Readonly<{ window: Extent; item: Extent }>

const extentOf = (element: Element): Extent => {
  const { width, height } = element.getBoundingClientRect()
  return { width, height }
}

const sameRoom = (was: Room | null, now: Room): boolean =>
  was !== null &&
  was.window.width === now.window.width &&
  was.window.height === now.window.height &&
  was.item.width === now.item.width &&
  was.item.height === now.item.height

/** The window and the item as they measure now; told again whenever either changes size. */
function useRoom(frame: React.RefObject<HTMLDivElement | null>): Room | null {
  const [room, setRoom] = useState<Room | null>(null)
  useLayoutEffect(() => {
    const element = frame.current
    const layer = element?.parentElement
    if (element == null || layer == null) return undefined
    const measure = (): void => {
      const now = { window: extentOf(layer), item: extentOf(element) }
      setRoom(was => (sameRoom(was, now) ? was : now))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(layer)
    observer.observe(element)
    return () => observer.disconnect()
  }, [frame])
  return room
}

type Dragged = Readonly<{
  carry: (place: FloatPlace | null) => void
  drop: (place: FloatPlace) => void
}>

/** The frame is a surface a grip is dragged over, not a control: it listens, it has no feel of its own. */
function useDrag(frame: React.RefObject<HTMLDivElement | null>, dragged: Dragged): void {
  const told = useRef(dragged)
  useLayoutEffect(() => {
    told.current = dragged
  })
  useEffect(() => {
    const element = frame.current
    const layer = element?.parentElement
    if (element == null || layer == null) return undefined
    let press: Press | null = null
    let carried: FloatPlace | null = null
    let dropped = false
    const carry = (place: FloatPlace | null): void => {
      carried = place
      told.current.carry(place)
    }
    const move = (event: PointerEvent): void => {
      if (press === null || press.pointer !== event.pointerId) return
      if (event.buttons === 0) {
        release()
        carry(null)
        return
      }
      const far = Math.hypot(event.clientX - press.x, event.clientY - press.y) >= DRAG_AFTER
      if (carried === null && !far) return
      const within = layer.getBoundingClientRect()
      const point = {
        left: event.clientX - within.left - press.grabX,
        top: event.clientY - within.top - press.grabY,
      }
      carry(placeAt(point, within, extentOf(element)))
    }
    const up = (event: PointerEvent): void => {
      if (press?.pointer !== event.pointerId) return
      release()
      if (carried === null) return
      dropped = true
      told.current.drop(carried)
      carry(null)
    }
    const cancel = (event: PointerEvent): void => {
      if (press?.pointer !== event.pointerId) return
      release()
      carry(null)
    }
    // A pressed pointer leaves an item this small at once: what follows the press is heard on the window.
    const follow = (): void => {
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancel)
    }
    const release = (): void => {
      press = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    const down = (event: PointerEvent): void => {
      dropped = false
      const grip = (event.target as Element).closest(`[${FLOAT_GRIP_ATTRIBUTE}]`)
      if (grip === null || !element.contains(grip)) return
      if (event.button !== 0 || !event.isPrimary) return
      release()
      const box = element.getBoundingClientRect()
      const { pointerId: pointer, clientX: x, clientY: y } = event
      press = { pointer, x, y, grabX: x - box.left, grabY: y - box.top }
      follow()
    }
    const click = (event: MouseEvent): void => {
      if (!dropped) return
      dropped = false
      event.preventDefault()
      event.stopPropagation()
    }
    element.addEventListener('pointerdown', down)
    element.addEventListener('click', click, true)
    return () => {
      release()
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('click', click, true)
    }
  }, [frame])
}

type FrameProps = Readonly<{ item: FloatItem; scope: string | undefined; places: FloatPlaces }>

/** One floating item where a person left it: dragged by its grip, kept whole inside the window. */
function Frame({ item, scope, places }: FrameProps) {
  const frame = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<FloatPlace>(() => places.read(item.id) ?? DEFAULT_PLACE)
  const [carried, setCarried] = useState<FloatPlace | null>(null)
  const room = useRoom(frame)
  useDrag(frame, {
    carry: setCarried,
    drop(at) {
      places.write(item.id, at)
      setPlace(at)
    },
  })
  const shown = carried ?? place
  const drawn = room === null ? shown : kept(shown, room.window, room.item)
  const dragging = carried !== null
  return (
    <div
      ref={frame}
      className="shell-float-item"
      data-float={item.id}
      data-dragging={dragging ? '' : undefined}
      style={styleOf(drawn)}
    >
      <Item
        quiet
        scope={scope}
        render={() => item.render({ scope, grip: GRIP, corner: cornerOf(drawn), dragging })}
      />
    </div>
  )
}

export type FloatProps = Readonly<{
  state: ShellState
  scope: string | undefined
  places: FloatPlaces
  inert: boolean
}>

/** What floats over the application: the layer takes no pointer, the frame of each item does. */
export function Float({ state, scope, places, inert }: FloatProps) {
  const items = useSlot(state.slots, 'float')
  if (items.length === 0) return null
  return (
    <div className="shell-float" inert={inert}>
      {items.map(item => (
        <Frame key={item.id} item={item} scope={scope} places={places} />
      ))}
    </div>
  )
}
