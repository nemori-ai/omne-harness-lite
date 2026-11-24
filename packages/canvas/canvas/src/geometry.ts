import type { Item, Pile, Sheet, Size, Spot } from '@omne-harness/canvas-contract'

/** The line under an item that carries its name. It is counted in the room an item takes. */
export const NAME_LINE = 24

export type Rect = Readonly<{ x: number; y: number; width: number; height: number }>

export const seatOf = (sheet: Sheet): Spot => ({
  x: Math.floor(sheet.width / 2),
  y: Math.floor(sheet.height / 2),
})

/** The room something of this size takes, with its name line. Without a size it takes the footprint. */
export const roomOf = (size: Size | null, footprint: Size): Size => {
  const own = size ?? footprint
  return { width: own.width, height: own.height + NAME_LINE }
}

export const rectOf = (at: Spot, room: Size): Rect => ({ x: at.x, y: at.y, ...room })

/** What a free spot must keep clear of: the loose items, the piles and the seat. */
export function takenRects(
  items: Iterable<Item>,
  piles: Iterable<Pile>,
  sheet: Sheet,
  footprint: Size,
): Rect[] {
  const taken: Rect[] = []
  for (const item of items)
    if (item.state === 'on' && item.pile === null)
      taken.push(rectOf(item.at, roomOf(item.size, footprint)))
  for (const pile of piles) taken.push(rectOf(pile.at, roomOf(null, footprint)))
  const seat = seatOf(sheet)
  taken.push({
    x: seat.x - footprint.width / 2,
    y: seat.y - footprint.height / 2,
    width: footprint.width,
    height: footprint.height,
  })
  return taken
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/** Whether a thing of this room fits on the sheet at this spot without touching anything taken. */
export function isFree(sheet: Sheet, taken: readonly Rect[], at: Spot, room: Size): boolean {
  const rect = rectOf(at, room)
  if (rect.x + rect.width > sheet.width || rect.y + rect.height > sheet.height) return false
  return taken.every(other => !overlaps(rect, other))
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

/** The grid spot nearest to `want` where `room` fits on the sheet clear of all taken; else `want` on the grid. */
export function freeSpot(sheet: Sheet, taken: readonly Rect[], room: Size, want: Spot): Spot {
  const { grid } = sheet
  const columns = room.width > sheet.width ? 0 : Math.floor((sheet.width - room.width) / grid) + 1
  const rows = room.height > sheet.height ? 0 : Math.floor((sheet.height - room.height) / grid) + 1
  const blocked = new Uint8Array(columns * rows)
  for (const rect of taken) {
    const left = Math.max(0, Math.floor((rect.x - room.width) / grid) + 1)
    const right = Math.min(columns - 1, Math.ceil((rect.x + rect.width) / grid) - 1)
    const top = Math.max(0, Math.floor((rect.y - room.height) / grid) + 1)
    const bottom = Math.min(rows - 1, Math.ceil((rect.y + rect.height) / grid) - 1)
    for (let row = top; row <= bottom; row += 1)
      for (let column = left; column <= right; column += 1) blocked[row * columns + column] = 1
  }

  const home = {
    column: clamp(Math.round(want.x / grid), 0, Math.max(columns - 1, 0)),
    row: clamp(Math.round(want.y / grid), 0, Math.max(rows - 1, 0)),
  }
  const offset = Math.max(Math.abs(want.x - home.column * grid), Math.abs(want.y - home.row * grid))
  let best: Readonly<{ spot: Spot; distance: number }> | null = null
  const consider = (column: number, row: number) => {
    if (column < 0 || row < 0 || column >= columns || row >= rows) return
    if (blocked[row * columns + column] === 1) return
    const spot = { x: column * grid, y: row * grid }
    const distance = (spot.x - want.x) ** 2 + (spot.y - want.y) ** 2
    if (
      best === null ||
      distance < best.distance ||
      (distance === best.distance &&
        (spot.y < best.spot.y || (spot.y === best.spot.y && spot.x < best.spot.x)))
    )
      best = { spot, distance }
  }
  const reach = Math.max(columns, rows)
  for (let ring = 0; ring <= reach; ring += 1) {
    const bound = Math.max(0, ring * grid - offset)
    if (best !== null && bound * bound > (best as { distance: number }).distance) break
    for (let step = -ring; step <= ring; step += 1) {
      consider(home.column + step, home.row - ring)
      if (ring > 0) consider(home.column + step, home.row + ring)
    }
    for (let step = -ring + 1; step <= ring - 1; step += 1) {
      consider(home.column - ring, home.row + step)
      consider(home.column + ring, home.row + step)
    }
  }
  if (best !== null) return (best as { spot: Spot }).spot
  return {
    x: clamp(Math.round(want.x / grid) * grid, 0, Math.floor((sheet.width - 1) / grid) * grid),
    y: clamp(Math.round(want.y / grid) * grid, 0, Math.floor((sheet.height - 1) / grid) * grid),
  }
}
