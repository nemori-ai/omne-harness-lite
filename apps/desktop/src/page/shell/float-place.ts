import type { FloatCorner } from '@omne-harness/shell-contract'
import type { PreferenceStore } from './theme.ts'

/** How far an item keeps from one edge of the window. */
export type Edge = Readonly<{ from: 'start' | 'end'; gap: number }>

/** Where a floating item sits: the corner it keeps to, and how far from its two edges. */
export type FloatPlace = Readonly<{ x: Edge; y: Edge }>

export type Extent = Readonly<{ width: number; height: number }>

const DEFAULT_GAP = 24

export const DEFAULT_PLACE: FloatPlace = {
  x: { from: 'end', gap: DEFAULT_GAP },
  y: { from: 'end', gap: DEFAULT_GAP },
}

const within = (gap: number, room: number): number => Math.min(Math.max(gap, 0), Math.max(room, 0))

/** The place as a window of this size draws it: no gap leaves any of the item outside. */
export function kept(place: FloatPlace, window: Extent, item: Extent): FloatPlace {
  const x = within(place.x.gap, window.width - item.width)
  const y = within(place.y.gap, window.height - item.height)
  return x === place.x.gap && y === place.y.gap
    ? place
    : { x: { from: place.x.from, gap: x }, y: { from: place.y.from, gap: y } }
}

function edgeAt(offset: number, room: number): Edge {
  const free = Math.max(room, 0)
  const at = within(offset, free)
  return at * 2 <= free ? { from: 'start', gap: at } : { from: 'end', gap: free - at }
}

/** The place an item dropped with its top left corner there keeps: by the corner it is nearest. */
export function placeAt(
  point: Readonly<{ left: number; top: number }>,
  window: Extent,
  item: Extent,
): FloatPlace {
  return {
    x: edgeAt(point.left, window.width - item.width),
    y: edgeAt(point.top, window.height - item.height),
  }
}

export const cornerOf = (place: FloatPlace): FloatCorner => ({ x: place.x.from, y: place.y.from })

export function styleOf(place: FloatPlace): Readonly<Record<string, number>> {
  return {
    [place.x.from === 'start' ? 'left' : 'right']: place.x.gap,
    [place.y.from === 'start' ? 'top' : 'bottom']: place.y.gap,
  }
}

function edgeOf(value: unknown): Edge | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { from, gap } = value as Record<string, unknown>
  if (from !== 'start' && from !== 'end') return undefined
  return typeof gap === 'number' && Number.isFinite(gap) && gap >= 0 ? { from, gap } : undefined
}

function placeOf(text: string | null): FloatPlace | undefined {
  if (text === null) return undefined
  const read: unknown = JSON.parse(text)
  if (typeof read !== 'object' || read === null) return undefined
  const x = edgeOf((read as Record<string, unknown>)['x'])
  const y = edgeOf((read as Record<string, unknown>)['y'])
  return x === undefined || y === undefined ? undefined : { x, y }
}

export const FLOAT_KEY = 'omne.float.'

export type FloatPlaces = Readonly<{
  read(id: string): FloatPlace | undefined
  write(id: string, place: FloatPlace): void
}>

/** The places a person left the floating items at, kept on this device by the id of the item. */
export function storedFloatPlaces(store: () => PreferenceStore): FloatPlaces {
  return {
    read(id) {
      try {
        return placeOf(store().getItem(`${FLOAT_KEY}${id}`))
      } catch {
        return undefined
      }
    },
    write(id, place) {
      try {
        store().setItem(`${FLOAT_KEY}${id}`, JSON.stringify(place))
      } catch {}
    },
  }
}
