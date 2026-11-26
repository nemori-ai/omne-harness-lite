import type { Region, ScreenWindow } from '@omne-harness/screen'

type At = Readonly<{ x: number; y: number }>

/** The shortest side of a window the figure looks at, in logical points. */
export const LEAST_SIDE = 40

export const contains = (rect: Region, at: At): boolean =>
  at.x >= rect.x && at.y >= rect.y && at.x < rect.x + rect.width && at.y < rect.y + rect.height

const overlap = (one: Region, other: Region) =>
  one.x < other.x + other.width &&
  other.x < one.x + one.width &&
  one.y < other.y + other.height &&
  other.y < one.y + one.height

export const lookable = ({ bounds }: ScreenWindow): boolean =>
  bounds.width >= LEAST_SIDE && bounds.height >= LEAST_SIDE

/** The window at a point: the first of a listing, front to back, whose rectangle holds it. */
export const frontAt = (windows: readonly ScreenWindow[], at: At): ScreenWindow | undefined =>
  windows.find(each => contains(each.bounds, at))

/** The rectangles of the windows listed in front of one that overlap it. */
export const coveringOf = (windows: readonly ScreenWindow[], window: ScreenWindow): Region[] =>
  windows
    .slice(0, windows.indexOf(window))
    .filter(each => overlap(each.bounds, window.bounds))
    .map(each => each.bounds)
