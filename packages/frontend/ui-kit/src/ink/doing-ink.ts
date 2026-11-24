import { type Point } from '../icons/brush.ts'
import { FINE, PRESS } from './brush-weight.ts'
import { eyeStroke } from './ink.ts'
import { designed, vary, type InkStroke } from './writing.ts'

type PressKeys = readonly (readonly [number, number])[]

function pressOf(keys: PressKeys | undefined): (t: number) => number {
  if (keys === undefined || keys.length === 0) return () => 1
  return t => {
    if (t <= keys[0]![0]) return keys[0]![1]
    for (let i = 1; i < keys.length; i += 1) {
      const [t1, p1] = keys[i]!
      if (t <= t1) {
        const [t0, p0] = keys[i - 1]!
        const u = (t - t0) / Math.max(1e-6, t1 - t0)
        return p0 + (p1 - p0) * u * u * (3 - 2 * u)
      }
    }
    return keys[keys.length - 1]![1]
  }
}

export const draw = (random: () => number, lo: number, hi: number): number =>
  lo + (hi - lo) * random()

export const THINK_CASUAL = {
  lead: [240, 620],
  write: [0.86, 1.16],
  rest: [0.45, 2.1],
  still: 0.5,
  rise: 520,
} as const

export const BACKGROUND_CASUAL = { lead: [600, 1400], rest: [2800, 6400] } as const

export function thinkingRest(designedRest: number, random: () => number): number {
  const r = random()
  return (
    designedRest * (THINK_CASUAL.rest[0] + (THINK_CASUAL.rest[1] - THINK_CASUAL.rest[0]) * r * r)
  )
}

export const LOOK = {
  first: [0, 1.6],
  reach: [3.5, 7.5],
  dot: 230,
  beat: 150,
  hold: [520, 1500],
  dry: 260,
  thread: 0.35,
  threadMs: [170, 260],
  threadDry: 420,
} as const

export function glanceStroke(at: Point, seed: number): InkStroke {
  const eye = eyeStroke(seed)
  return { ...eye, line: eye.line.map(([x, y]): Point => [x - 32 + at[0], y - 32 + at[1]]) }
}

export function threadStroke(
  from: Point,
  to: Point,
  seed: number,
  random: () => number,
): InkStroke {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
  const span = Math.hypot(dx, dy) || 1
  const reach = Math.min(span * 0.7, draw(random, 3, 5.5))
  const [ux, uy] = [dx / span, dy / span]
  const bow = draw(random, -0.6, 0.6)
  const start: Point = [from[0] + ux * 1.4, from[1] + uy * 1.4]
  const line: Point[] = [
    start,
    [start[0] + ux * reach * 0.5 - uy * bow, start[1] + uy * reach * 0.5 + ux * bow],
    [start[0] + ux * reach, start[1] + uy * reach],
  ]
  return vary(
    designed(line, FINE * PRESS.thread, {
      press: pressOf([
        [0, 0.7],
        [0.2, 1],
        [1, 0.08],
      ]),
      ink: draw(random, 0.42, 0.6),
      dry: 0.85,
      wet: 0.2,
    }),
    seed,
    { freedom: 0.6, endings: { taper: 0.8, split: 0.2 } },
  )
}

export const COLUMNS = {
  away: 7.5,
  top: [18, 21.5],
  height: [23, 27],
  count: [2, 4],
  four: 0.2,
  gap: [5.2, 7.4],
  lean: [-0.7, 0.7],
  first: [0.9, 1],
  rest: [0.34, 0.84],
  differ: 0.2,
  least: 7,
  perUnit: 22,
  fastest: 220,
  slowest: 560,
  between: [180, 380],
  hold: [500, 1400],
  dry: 760,
  stagger: 160,
  next: [240, 900],
} as const

export const COLUMNS_REACH = COLUMNS.away + (COLUMNS.count[1] - 1) * COLUMNS.gap[1] + 2

export const COLUMNS_CLEAR = 4

export interface ColumnSide {
  readonly side: 'left' | 'right'
  readonly at: number
  readonly room?: number
}

export function columnsFit(
  room: number,
  count: number,
): { readonly count: number; readonly widest: number } {
  const span = room - COLUMNS.away - 2
  const most = Math.max(
    COLUMNS.count[0],
    Math.min(COLUMNS.count[1], Math.floor(span / COLUMNS.gap[0]) + 1),
  )
  const fitted = Math.min(count, most)
  return {
    count: fitted,
    widest: Math.max(COLUMNS.gap[0], Math.min(COLUMNS.gap[1], span / Math.max(1, fitted - 1))),
  }
}

export interface BesideStroke {
  readonly stroke: InkStroke
  readonly at: number
  readonly took: number
  readonly mark: number
}

export interface Page {
  readonly strokes: readonly BesideStroke[]
  readonly end: number
}

const COLUMN_PRESS = pressOf([
  [0, 0.82],
  [0.1, 1],
  [0.7, 0.86],
  [1, 0.6],
])

const staircase = (lengths: readonly number[]): boolean =>
  lengths.length >= 3 &&
  (lengths.every((length, i) => i === 0 || length > lengths[i - 1]!) ||
    lengths.every((length, i) => i === 0 || length < lengths[i - 1]!))

export function columnLengths(random: () => number, most: number = COLUMNS.count[1]): number[] {
  const four = random() < COLUMNS.four
  const count = Math.min(most, four ? 4 : random() < 0.4 ? 2 : 3)
  for (let tries = 0; tries < 24; tries += 1) {
    const lengths = [draw(random, ...COLUMNS.first)]
    for (let i = 1; i < count; i += 1) {
      const before = lengths[i - 1]!
      const below = Math.max(
        0,
        Math.min(COLUMNS.rest[1], before - COLUMNS.differ) - COLUMNS.rest[0],
      )
      const above = Math.max(
        0,
        COLUMNS.rest[1] - Math.max(COLUMNS.rest[0], before + COLUMNS.differ),
      )
      const pick = random() * (below + above)
      lengths.push(
        pick < below
          ? COLUMNS.rest[0] + pick
          : Math.max(COLUMNS.rest[0], before + COLUMNS.differ) + (pick - below),
      )
    }
    if (!staircase(lengths)) return lengths
  }
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? COLUMNS.first[1] : i % 2 === 1 ? COLUMNS.rest[0] + 0.04 : COLUMNS.rest[1] - 0.04,
  )
}

export function besideColumns(seed: number, random: () => number, beside: ColumnSide): Page {
  const height = draw(random, ...COLUMNS.height)
  const top = draw(random, ...COLUMNS.top)
  const out = beside.side === 'left' ? -1 : 1
  const strokes: BesideStroke[] = []
  let x = beside.at + out * COLUMNS.away
  let at = 0
  const most =
    beside.room === undefined ? COLUMNS.count[1] : columnsFit(beside.room, COLUMNS.count[1]).count
  const lengths = columnLengths(random, most)
  const widest =
    beside.room === undefined ? COLUMNS.gap[1] : columnsFit(beside.room, lengths.length).widest
  lengths.forEach((share, i) => {
    const length = Math.max(COLUMNS.least, height * share)
    const y0 = top + draw(random, -0.35, 0.35)
    const lean = draw(random, ...COLUMNS.lean) * (length / height)
    const path: Point[] = []
    const parts = Math.max(4, Math.round(length / 1.4))
    for (let k = 0; k <= parts; k += 1)
      path.push([x + (lean * k) / parts, y0 + (length * k) / parts])
    const stroke = vary(
      designed(path, FINE, {
        press: COLUMN_PRESS,
        ink: draw(random, 0.84, 0.96),
        wet: draw(random, 0.4, 0.65),
        dry: draw(random, 0.25, 0.45),
      }),
      seed + i * 104_729,
      { wander: 0.18, freedom: 0.6, endings: { stop: 0.7, taper: 0.3 } },
    )
    const took = Math.min(COLUMNS.slowest, Math.max(COLUMNS.fastest, length * COLUMNS.perUnit))
    strokes.push({ stroke, at, took, mark: i })
    at += took + draw(random, ...COLUMNS.between)
    x += out * draw(random, COLUMNS.gap[0], widest)
  })
  return { strokes, end: at }
}
