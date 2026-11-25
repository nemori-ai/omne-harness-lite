import { describe, expect, it } from 'vitest'
import type { Item, ItemId, Pile, PileId, Sheet, Size, Spot } from '@omne-harness/canvas-contract'
import { freeSpot, isFree, NAME_LINE, seatOf, takenRects, type Rect } from '../src/geometry.ts'

/** A small generator with a seed, so that a failing case can be made again from its seed. */
function random(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (below: number) => Math.floor(next() * below)
  return {
    int,
    between: (low: number, high: number) => low + int(high - low + 1),
    pick: <T>(of: readonly T[]): T => of[int(of.length)]!,
    chance: (p: number) => next() < p,
  }
}

const modulo = (value: number, by: number) => ((value % by) + by) % by

type Case = Readonly<{ sheet: Sheet; taken: readonly Rect[]; room: Size; want: Spot }>

/**
 * A sheet, what is taken on it, a room and a wanted spot. A spot sits on the grid and a room is a
 * whole number of steps, so a spot's edges are grid lines; half the taken edges are too, so that
 * spots that only share an edge with something taken come up often.
 */
function caseOf(seed: number): Case {
  const g = random(seed)
  const grid = g.pick([4, 8, 10])
  const sheet = {
    width: g.between(grid * 3, grid * 40),
    height: g.between(grid * 3, grid * 40),
    grid,
  }
  const room = {
    width: grid * (g.chance(0.05) ? g.between(30, 45) : g.between(1, 8)),
    height: grid * (g.chance(0.05) ? g.between(30, 45) : g.between(1, 8)),
  }
  const edge = (value: number) => (g.chance(0.5) ? Math.round(value / grid) * grid : value)
  const taken = Array.from({ length: g.int(13) }, () => {
    const x = edge(g.between(-grid * 3, sheet.width))
    const y = edge(g.between(-grid * 3, sheet.height))
    const right = Math.max(x + 1, edge(x + g.between(1, Math.ceil(sheet.width / 2))))
    const bottom = Math.max(y + 1, edge(y + g.between(1, Math.ceil(sheet.height / 2))))
    return { x, y, width: right - x, height: bottom - y }
  })
  const want = { x: g.int(sheet.width + grid * 6), y: g.int(sheet.height + grid * 6) }
  return { sheet, taken, room, want }
}

/** Whether two rects share some area: sharing only an edge does not press. */
const pressesOn = (a: Rect, b: Rect) =>
  Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
  Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)

const fits = (sheet: Sheet, at: Spot, room: Size) =>
  at.x >= 0 && at.y >= 0 && at.x + room.width <= sheet.width && at.y + room.height <= sheet.height

const onGrid = (sheet: Sheet, at: Spot) =>
  modulo(at.x, sheet.grid) === 0 && modulo(at.y, sheet.grid) === 0

const clearOf = (taken: readonly Rect[], at: Spot, room: Size) =>
  taken.every(other => !pressesOn({ ...at, ...room }, other))

/** Whether a room at this spot keeps at least `step` from everything taken. */
const apartFrom = (taken: readonly Rect[], at: Spot, room: Size, step: number) =>
  clearOf(
    taken,
    { x: at.x - step, y: at.y - step },
    { width: room.width + 2 * step, height: room.height + 2 * step },
  )

const distance = (a: Spot, b: Spot) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

/** Every free spot, slowly: each grid point of the sheet in turn, row by row from the top, each row from the left. */
function freeSpots({ sheet, taken, room }: Case): Spot[] {
  const spots: Spot[] = []
  for (let y = 0; y + room.height <= sheet.height; y += sheet.grid)
    for (let x = 0; x + room.width <= sheet.width; x += sheet.grid)
      if (clearOf(taken, { x, y }, room)) spots.push({ x, y })
  return spots
}

/** The grid points of one edge's span on the sheet nearest to a value: one, or two on a tie. */
function nearestOnLine(value: number, length: number, grid: number): number[] {
  const points = Array.from({ length: Math.floor((length - 1) / grid) + 1 }, (_, n) => n * grid)
  const least = Math.min(...points.map(point => Math.abs(point - value)))
  return points.filter(point => Math.abs(point - value) === least)
}

const SEEDS = Array.from({ length: 400 }, (_, seed) => seed + 1)

describe('a found spot is a free spot', () => {
  it.each(SEEDS)(
    'is on the grid, inside the sheet and clear of everything taken, seed %i',
    seed => {
      const found = caseOf(seed)
      const { sheet, taken, room, want } = found
      if (freeSpots(found).length === 0) return
      const spot = freeSpot(sheet, taken, room, want)
      expect(onGrid(sheet, spot)).toBe(true)
      expect(fits(sheet, spot, room)).toBe(true)
      expect(clearOf(taken, spot, room)).toBe(true)
    },
  )
})

/** The first in scan order of the spots nearest to `want`. */
function nearestOf(spots: readonly Spot[], want: Spot): Spot | undefined {
  const least = Math.min(...spots.map(free => distance(free, want)))
  return spots.find(free => distance(free, want) === least)
}

describe('a found spot is the nearest free spot a step of the grid from everything taken, else the nearest free spot; the upper and then the left of those as near', () => {
  it.each(SEEDS)('as a scan of every grid point finds, seed %i', seed => {
    const found = caseOf(seed)
    const spots = freeSpots(found)
    if (spots.length === 0) return
    const apart = spots.filter(free => apartFrom(found.taken, free, found.room, found.sheet.grid))
    const first = nearestOf(apart.length > 0 ? apart : spots, found.want)
    expect(freeSpot(found.sheet, found.taken, found.room, found.want)).toEqual(first)
  })

  const sheet = { width: 100, height: 100, grid: 10 }
  const room = { width: 10, height: 10 }
  /** Takes one grid cell of a room 10 by 10, and nothing of its neighbours. */
  const cell = (column: number, row: number): Rect => ({
    x: column * 10 + 3,
    y: row * 10 + 3,
    width: 4,
    height: 4,
  })

  // A spot a step of the grid from one cell is clear of the cells around it too.
  it('takes the upper of spots as near', () => {
    expect(freeSpot(sheet, [cell(5, 5)], room, { x: 50, y: 50 })).toEqual({ x: 50, y: 30 })
  })

  it('takes the left of spots as near on one row', () => {
    const taken = [cell(5, 5), cell(5, 4), cell(5, 6)]
    expect(freeSpot(sheet, taken, room, { x: 50, y: 50 })).toEqual({ x: 30, y: 50 })
  })
})

describe('sharing only an edge does not press', () => {
  const sheet = { width: 100, height: 80, grid: 10 }
  const taken = [{ x: 0, y: 0, width: 20, height: 20 }]
  const room = { width: 20, height: 20 }

  it('a spot right beside something taken is free', () => {
    expect(isFree(sheet, taken, { x: 20, y: 0 }, room)).toBe(true)
    expect(isFree(sheet, taken, { x: 0, y: 20 }, room)).toBe(true)
    expect(isFree(sheet, taken, { x: 10, y: 0 }, room)).toBe(false)
  })

  it('is not what a search finds while a spot a step away is left', () => {
    expect(freeSpot(sheet, taken, room, { x: 20, y: 0 })).toEqual({ x: 30, y: 0 })
    expect(freeSpot(sheet, taken, room, { x: 0, y: 10 })).toEqual({ x: 0, y: 30 })
  })

  it('is found right beside it when no spot a step away is left', () => {
    const narrow = { width: 40, height: 20, grid: 10 }
    expect(freeSpot(narrow, taken, room, { x: 0, y: 0 })).toEqual({ x: 20, y: 0 })
  })
})

describe('without a free spot it lands on the wanted spot, on the grid and on the sheet', () => {
  it.each(SEEDS)('seed %i', seed => {
    const found = caseOf(seed)
    const { sheet, want } = found
    if (freeSpots(found).length > 0) return
    const spot = freeSpot(sheet, found.taken, found.room, want)
    expect(nearestOnLine(want.x, sheet.width, sheet.grid)).toContain(spot.x)
    expect(nearestOnLine(want.y, sheet.height, sheet.grid)).toContain(spot.y)
  })

  const sheet = { width: 100, height: 80, grid: 10 }
  const all = [{ x: -1, y: -1, width: 102, height: 82 }]

  it('when everything is taken', () => {
    expect(freeSpot(sheet, all, { width: 20, height: 20 }, { x: 33, y: 47 })).toEqual({
      x: 30,
      y: 50,
    })
  })

  it('when the room is larger than the sheet', () => {
    expect(freeSpot(sheet, [], { width: 110, height: 20 }, { x: 33, y: 47 })).toEqual({
      x: 30,
      y: 50,
    })
    expect(freeSpot(sheet, [], { width: 20, height: 90 }, { x: 33, y: 47 })).toEqual({
      x: 30,
      y: 50,
    })
  })

  it('pulls a wanted spot past the edges back to the last grid point on the sheet', () => {
    expect(freeSpot(sheet, all, { width: 20, height: 20 }, { x: 1000, y: 1000 })).toEqual({
      x: 90,
      y: 70,
    })
    expect(freeSpot(sheet, all, { width: 20, height: 20 }, { x: 99, y: 79 })).toEqual({
      x: 90,
      y: 70,
    })
  })
})

describe('the edges of the sheet', () => {
  const sheet = { width: 100, height: 80, grid: 10 }

  it('a room exactly the size of the sheet fits at its corner', () => {
    expect(freeSpot(sheet, [], { width: 100, height: 80 }, { x: 40, y: 30 })).toEqual({
      x: 0,
      y: 0,
    })
    expect(isFree(sheet, [], { x: 0, y: 0 }, { width: 100, height: 80 })).toBe(true)
  })

  it('a room one past the sheet does not', () => {
    expect(isFree(sheet, [], { x: 0, y: 0 }, { width: 101, height: 80 })).toBe(false)
    expect(isFree(sheet, [], { x: 0, y: 0 }, { width: 100, height: 81 })).toBe(false)
    expect(isFree(sheet, [], { x: 10, y: 0 }, { width: 100, height: 80 })).toBe(false)
  })

  it('the last column that still fits is found, and one step narrower it is gone', () => {
    const left = [{ x: -1, y: -1, width: 80, height: 82 }]
    expect(freeSpot(sheet, left, { width: 20, height: 20 }, { x: 0, y: 30 })).toEqual({
      x: 80,
      y: 30,
    })
    const narrower = { ...sheet, width: 99 }
    expect(freeSpot(narrower, left, { width: 20, height: 20 }, { x: 0, y: 30 })).toEqual({
      x: 0,
      y: 30,
    })
  })

  it('the last row that still fits is found', () => {
    const top = [{ x: -1, y: -1, width: 102, height: 60 }]
    expect(freeSpot(sheet, top, { width: 20, height: 20 }, { x: 40, y: 0 })).toEqual({
      x: 40,
      y: 60,
    })
  })

  it('a wanted spot past the right edge finds the only free spot at the far left', () => {
    const wide = { width: 100, height: 20, grid: 10 }
    const right = [{ x: 11, y: -1, width: 200, height: 30 }]
    expect(freeSpot(wide, right, { width: 10, height: 10 }, { x: 1000, y: 0 })).toEqual({
      x: 0,
      y: 0,
    })
    expect(freeSpot(wide, right, { width: 10, height: 10 }, { x: 1000, y: 15 })).toEqual({
      x: 0,
      y: 10,
    })
  })

  it('a wanted spot past the bottom edge finds the only free spot at the top', () => {
    const tall = { width: 20, height: 100, grid: 10 }
    const bottom = [{ x: -1, y: 11, width: 30, height: 200 }]
    expect(freeSpot(tall, bottom, { width: 10, height: 10 }, { x: 0, y: 1000 })).toEqual({
      x: 0,
      y: 0,
    })
  })
})

describe('the search does not stop before the nearest free spot', () => {
  /** Takes one grid cell of a room 10 by 10, and nothing of its neighbours. */
  const cell = (column: number, row: number): Rect => ({
    x: column * 10 + 3,
    y: row * 10 + 3,
    width: 4,
    height: 4,
  })

  // A step of the grid from a cell keeps clear of the cells around it: these two leave (6, 4)
  // a step away, 18 off, and (3, 5) two steps away, 15 off.
  it('a straight spot two steps away beats a slanted one a step away', () => {
    const sheet = { width: 100, height: 100, grid: 10 }
    const taken = [cell(5, 6), cell(4, 3)]
    expect(freeSpot(sheet, taken, { width: 10, height: 10 }, { x: 45, y: 50 })).toEqual({
      x: 30,
      y: 50,
    })
  })
})

describe('whether a spot is free', () => {
  it.each(SEEDS)(
    'agrees with a plain check of the sheet and of everything taken, seed %i',
    seed => {
      const { sheet, taken, room } = caseOf(seed)
      const g = random(seed * 7919)
      const spot = {
        x: g.int(sheet.width / sheet.grid + 2) * sheet.grid,
        y: g.int(sheet.height / sheet.grid + 2) * sheet.grid,
      }
      expect(isFree(sheet, taken, spot, room)).toBe(
        fits(sheet, spot, room) && clearOf(taken, spot, room),
      )
    },
  )
})

const ON: Omit<Item, 'id' | 'at' | 'size' | 'state' | 'pile'> = {
  reference: { kind: 'media.object', ref: 'r' },
  rank: 1,
  locked: false,
  by: { kind: 'human' },
  when: '2026-01-01T00:00:00.000Z' as Item['when'],
}

const item = (id: string, at: Spot, more: Partial<Item> = {}): Item => ({
  ...ON,
  id: id as ItemId,
  at,
  size: null,
  state: 'on',
  pile: null,
  ...more,
})

const pile = (id: string, at: Spot): Pile => ({
  id: id as PileId,
  name: null,
  at,
  by: { kind: 'human' },
  when: ON.when,
})

describe('what a free spot keeps clear of', () => {
  const sheet = { width: 1600, height: 1200, grid: 8 }
  const footprint = { width: 160, height: 80 }

  it('a loose item on the sheet takes its size or the footprint, with its name line', () => {
    const items = [
      item('a', { x: 16, y: 24 }),
      item('b', { x: 400, y: 32 }, { size: { width: 200, height: 120 } }),
      item('c', { x: 40, y: 600 }, { locked: true }),
    ]
    const taken = takenRects(items, [], sheet, footprint)
    expect(taken).toContainEqual({ x: 16, y: 24, width: 160, height: 80 + NAME_LINE })
    expect(taken).toContainEqual({ x: 400, y: 32, width: 200, height: 120 + NAME_LINE })
    expect(taken).toContainEqual({ x: 40, y: 600, width: 160, height: 80 + NAME_LINE })
  })

  it('a taken item and an item in a pile take no room; the pile takes it at its own spot', () => {
    const loose = [item('a', { x: 16, y: 24 })]
    const others = [
      item('off', { x: 200, y: 200 }, { state: 'off' }),
      item('piled', { x: 400, y: 400 }, { pile: 'p' as PileId }),
      item('piled-off', { x: 600, y: 200 }, { state: 'off', pile: 'p' as PileId }),
    ]
    const piles = [pile('p', { x: 1000, y: 900 })]
    expect(takenRects([...loose, ...others], piles, sheet, footprint)).toEqual(
      takenRects(loose, piles, sheet, footprint),
    )
    expect(takenRects([], piles, sheet, footprint)).toContainEqual({
      x: 1000,
      y: 900,
      width: 160,
      height: 80 + NAME_LINE,
    })
  })

  it.each([
    { width: 1600, height: 1200, grid: 8 },
    { width: 900, height: 333, grid: 10 },
  ])('the seat of the Agent form at the middle of the sheet is taken, %o', size => {
    const seat = seatOf(size)
    const taken = takenRects([], [], size, footprint)
    expect(
      taken.some(
        rect =>
          rect.x < seat.x &&
          seat.x < rect.x + rect.width &&
          rect.y < seat.y &&
          seat.y < rect.y + rect.height,
      ),
    ).toBe(true)
    const spot = freeSpot(size, taken, { width: 160, height: 80 + NAME_LINE }, seat)
    expect(clearOf(taken, spot, { width: 160, height: 80 + NAME_LINE })).toBe(true)
  })
})
