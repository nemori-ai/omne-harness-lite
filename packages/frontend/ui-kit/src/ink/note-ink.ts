import { strokeSpine, type Point } from '../icons/brush.ts'
import { FINE, PRESS } from './brush-weight.ts'
import { CANVAS, CENTRE, circleLine, DEFAULT_HAND } from './ink.ts'
import { designed, seeded, vary, type InkStroke } from './writing.ts'

export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type BubbleInk = 'full' | 'light'

export interface BubbleShape {
  readonly width: number
  readonly height: number
  readonly radius: number
  readonly anchor: Point
  readonly unit: number
  readonly seed: number
  readonly ink?: BubbleInk
}

export interface BubbleLines {
  readonly tail: readonly Point[]
  readonly first: readonly Point[]
  readonly second: readonly Point[]
}

export interface BubbleStroke {
  readonly part: 'outline'
  readonly ink: InkStroke
  readonly rest: string
}

const STEP = 4
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]]
const add = (a: Point, b: Point, k = 1): Point => [a[0] + b[0] * k, a[1] + b[1] * k]
const norm = (v: Point): Point => {
  const l = Math.hypot(v[0], v[1]) || 1
  return [v[0] / l, v[1] / l]
}
const dot = (a: Point, b: Point): number => a[0] * b[0] + a[1] * b[1]
const lengthOf = (line: readonly Point[]): number =>
  line.reduce(
    (sum, p, i) => (i === 0 ? 0 : sum + Math.hypot(p[0] - line[i - 1]![0], p[1] - line[i - 1]![1])),
    0,
  )
const smooth = (from: number, to: number, value: number): number => {
  const u = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return u * u * (3 - 2 * u)
}

const through =
  (keys: readonly (readonly [number, number])[]) =>
  (t: number): number => {
    for (let i = 1; i < keys.length; i += 1) {
      const [t1, v1] = keys[i]!
      if (t <= t1) {
        const [t0, v0] = keys[i - 1]!
        const u = (t - t0) / Math.max(1e-6, t1 - t0)
        return v0 + (v1 - v0) * u * u * (3 - 2 * u)
      }
    }
    return keys[keys.length - 1]![1]
  }

interface Walk {
  readonly points: Point[]
  readonly open: boolean[]
  readonly corners: number[]
}

function roundRect({ x, y, width, height }: Rect, radius: number, clear: number): Walk {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  const points: Point[] = []
  const open: boolean[] = []
  const corners: number[] = []
  const edge = (a: Point, b: Point): void => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const count = Math.max(1, Math.round(length / STEP))
    for (let i = 0; i < count; i += 1) {
      const along = (length * i) / count
      points.push([a[0] + ((b[0] - a[0]) * i) / count, a[1] + ((b[1] - a[1]) * i) / count])
      open.push(along >= clear && length - along >= clear)
    }
  }
  const corner = (cx: number, cy: number, from: number): void => {
    for (let i = 0; i < 9; i += 1) {
      if (i === 4) corners.push(points.length)
      const angle = ((from + i * 10) * Math.PI) / 180
      points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)])
      open.push(false)
    }
  }
  edge([x + r, y], [x + width - r, y])
  corner(x + width - r, y + r, -90)
  edge([x + width, y + r], [x + width, y + height - r])
  corner(x + width - r, y + height - r, 0)
  edge([x + width - r, y + height], [x + r, y + height])
  corner(x + r, y + height - r, 90)
  edge([x, y + height - r], [x, y + r])
  corner(x + r, y + r, 180)
  return { points, open, corners }
}

function waver(
  points: readonly Point[],
  centre: Point,
  amount: number,
  random: () => number,
): Point[] {
  const [a, b, pa, pb] = [
    amount * (0.6 + 0.4 * random()),
    amount * 0.45 * random(),
    random() * Math.PI * 2,
    random() * Math.PI * 2,
  ]
  return points.map((p, i) => {
    const t = i / points.length
    const out = norm(sub(p, centre))
    const by = a * Math.sin(t * Math.PI * 2 * 2 + pa) + b * Math.sin(t * Math.PI * 2 * 3 + pb)
    return add(p, out, by)
  })
}

function bow(a: Point, ha: Point, d: Point, hd: Point, leave: number, arrive: number): Point[] {
  const b = add(a, ha, leave)
  const c = add(d, hd, -arrive)
  const count = Math.max(6, Math.round(Math.hypot(d[0] - a[0], d[1] - a[1]) / STEP))
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count
    const s = 1 - t
    return [
      s * s * s * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t * t * t * d[0],
      s * s * s * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t * t * t * d[1],
    ] as const
  })
}

export function liftOf(
  anchor: Point,
  unit: number,
): { readonly point: Point; readonly heading: Point } {
  const line = circleLine(DEFAULT_HAND)
  const [a, b] = [line[line.length - 2]!, line[line.length - 1]!]
  return { point: add(anchor, sub(b, CENTRE), unit), heading: norm(sub(b, a)) }
}

function loopFrom(walk: Walk, from: number, clockwise: boolean, past: number): Point[] {
  const n = walk.points.length
  const at = (k: number): Point => walk.points[(((clockwise ? from + k : from - k) % n) + n) % n]!
  return Array.from({ length: n + 1 + past }, (_, k) => at(k))
}

const TAIL_CLEAR = 0.9

const tailTo = (
  lift: ReturnType<typeof liftOf>,
  root: Point,
  along: Point,
  distance: number,
): Point[] =>
  bow(
    lift.point,
    lift.heading,
    root,
    along,
    Math.min(14, distance * 0.4),
    Math.min(30, distance * 0.45),
  )

export function bubbleLines(shape: BubbleShape): BubbleLines {
  const random = seeded(shape.seed ^ 0x2545f491)
  const box: Rect = { x: 0, y: 0, width: shape.width, height: shape.height }
  const walk = roundRect(box, shape.radius, shape.radius + 8)
  const lift = liftOf(shape.anchor, shape.unit)
  const n = walk.points.length
  const arrival = (i: number): { readonly clockwise: boolean; readonly along: Point } => {
    const tangent = norm(sub(walk.points[(i + 1) % n]!, walk.points[(i - 1 + n) % n]!))
    const clockwise = dot(tangent, sub(walk.points[i]!, lift.point)) >= 0
    return { clockwise, along: clockwise ? tangent : [-tangent[0], -tangent[1]] }
  }
  const roots = walk.points
    .map((p, i) => ({ i, d: Math.hypot(p[0] - lift.point[0], p[1] - lift.point[1]) }))
    .filter(({ i }) => walk.open[i])
    .sort((a, b) => a.d - b.d)
  const rim = DEFAULT_HAND.radius * shape.unit * TAIL_CLEAR
  const keepsOut = ({ i, d }: { readonly i: number; readonly d: number }): boolean => {
    const line = tailTo(lift, walk.points[i]!, arrival(i).along, d)
    return line.every(
      (p, k) =>
        k < line.length * 0.15 || Math.hypot(p[0] - shape.anchor[0], p[1] - shape.anchor[1]) >= rim,
    )
  }
  const chosen =
    roots.length === 0
      ? { i: 0, d: Infinity }
      : roots[0]!.d < 6 || keepsOut(roots[0]!)
        ? roots[0]!
        : (roots.find(keepsOut) ?? roots[0]!)
  const join = chosen.i
  const nearest = chosen.d
  const { clockwise, along } = arrival(join)
  const centre: Point = [shape.width / 2, shape.height / 2]
  const loop = waver(loopFrom(walk, join, clockwise, 2), centre, 0.7, random)
  const share = (corner: number): number =>
    ((((clockwise ? corner - join : join - corner) % n) + n) % n) / n
  const turnCorner = walk.corners.reduce((best, corner) =>
    Math.abs(share(corner) - 0.52) < Math.abs(share(best) - 0.52) ? corner : best,
  )
  const turn = Math.round(share(turnCorner) * n)
  const first = loop.slice(0, turn + 1)
  const second = loop.slice(Math.max(0, turn - 1))
  const tail = nearest < 6 ? [] : tailTo(lift, walk.points[join]!, along, nearest)
  return { tail, first, second }
}

function firstPress(tailShare: number): (t: number) => number {
  if (tailShare <= 0)
    return through([
      [0, 0.7],
      [0.06, 0.95],
      [0.5, 0.85],
      [0.85, 0.8],
      [1, 0.55],
    ])
  const f = tailShare
  return through([
    [0, 0.55],
    [f * 0.3, 0.72],
    [f * 0.7, 0.4],
    [f, 0.92],
    [f + (1 - f) * 0.5, 0.82],
    [f + (1 - f) * 0.85, 0.78],
    [1, 0.5],
  ])
}

function turning(line: readonly Point[]): (t: number) => number {
  const total = lengthOf(line) || 1
  const keys: [number, number][] = []
  let along = 0
  line.forEach((b, i) => {
    if (i > 0) along += Math.hypot(b[0] - line[i - 1]![0], b[1] - line[i - 1]![1])
    const a = line[Math.max(0, i - 2)]!
    const c = line[Math.min(line.length - 1, i + 2)]!
    const angle =
      i < 2 || i > line.length - 3
        ? 0
        : Math.acos(Math.max(-1, Math.min(1, dot(norm(sub(b, a)), norm(sub(c, b))))))
    keys.push([along / total, Math.min(1, angle / (Math.PI / 4))])
  })
  return t => {
    const k = keys.findIndex(([at]) => at >= t)
    if (k <= 0) return keys[Math.max(0, k)]?.[1] ?? 0
    const [t0, v0] = keys[k - 1]!
    const [t1, v1] = keys[k]!
    return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-6, t1 - t0)
  }
}
const turned = (press: (t: number) => number, line: readonly Point[], into = 0.24) => {
  const turn = turning(line)
  return (t: number): number => Math.min(1, press(t) * (0.88 + into * turn(t)))
}

const secondPress = through([
  [0, 0.55],
  [0.07, 0.95],
  [0.45, 0.82],
  [0.8, 0.86],
  [0.94, 0.62],
  [1, 0.3],
])

export const BUBBLE_WEIGHT = {
  outline: FINE,
  rest: FINE * PRESS.thread,
} as const

export const BUBBLE_STRENGTH = {
  full: { outline: BUBBLE_WEIGHT.outline, ink: 1, rest: 1 },
  light: { outline: FINE * PRESS.thread, ink: 0.55, rest: 0.85 },
} as const

export function bubbleStrokes(shape: BubbleShape): BubbleStroke[] {
  const lines = bubbleLines(shape)
  const { unit, seed } = shape
  const strength = BUBBLE_STRENGTH[shape.ink ?? 'full']
  const inked = <T extends { ink: number }>(ink: T): T => ({ ...ink, ink: ink.ink * strength.ink })
  const units = (line: readonly Point[]): Point[] =>
    line.map(([x, y]) => [x / unit, y / unit] as const)
  const restOf = (
    line: readonly Point[],
    press: (t: number) => number,
    weight: number = BUBBLE_WEIGHT.rest,
  ): string => {
    const { points, half } = strokeSpine(
      line,
      weight * unit,
      { spacing: 2.5, most: 1600 },
      t => press(t) * strength.rest,
    )
    return outlinePath(points, half)
  }
  const strokes: BubbleStroke[] = []
  const firstLine = [...lines.tail, ...lines.first.slice(lines.tail.length > 0 ? 1 : 0)]
  const tailShare =
    lines.tail.length === 0 ? 0 : lengthOf(lines.tail) / Math.max(1, lengthOf(firstLine))
  const f = tailShare
  const press1 = turned(firstPress(f), firstLine)
  const drying1 = (t: number): number =>
    (f > 0 ? 0.9 * smooth(f * 0.2, f * 0.6, t) * (1 - smooth(f * 0.75, f, t)) : 0) +
    0.7 * smooth(f + (1 - f) * 0.5, 1, t)
  const parting1 = (t: number): number =>
    f > 0 ? 0.35 * smooth(f * 0.3, f * 0.6, t) * (1 - smooth(f * 0.75, f, t)) : 0
  strokes.push({
    part: 'outline',
    ink: {
      ...vary(
        designed(
          units(firstLine),
          strength.outline,
          inked({ ink: 0.92, wet: 0.35, dry: 0.62, drying: drying1, parting: parting1 }),
        ),
        seed,
        { wander: 0.12, freedom: 0.3, endings: { taper: 0.6, split: 0.4 } },
      ),
      press: press1,
    },
    rest: restOf(firstLine.slice(lines.tail.length > 0 ? 1 : 0), t =>
      f > 0
        ? (Math.min(1, 0.3 + 0.7 * smooth(0, f * 1.1, t)) * press1(t)) / 0.85
        : press1(t) / 0.85,
    ),
  })
  const drying2 = (t: number): number => 0.2 + 0.7 * smooth(0.55, 1, t)
  const press2 = turned(secondPress, lines.second)
  strokes.push({
    part: 'outline',
    ink: {
      ...vary(
        designed(
          units(lines.second),
          strength.outline,
          inked({ ink: 0.9, wet: 0.35, dry: 0.6, drying: drying2 }),
        ),
        seed + 7919,
        { wander: 0.12, freedom: 0.3, endings: { taper: 1 } },
      ),
      press: press2,
    },
    rest: restOf(lines.second, t => press2(t) / 0.85),
  })
  return strokes
}

export function bubbleArea(strokes: readonly BubbleStroke[], pad = 4): Rect {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const { ink } of strokes) {
    for (const [x, y] of ink.line) {
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
  }
  return { x: x0 - pad, y: y0 - pad, width: x1 - x0 + pad * 2, height: y1 - y0 + pad * 2 }
}

export const unitOf = (size: number): number => size / CANVAS

const r2 = (value: number): string => String(Math.round(value * 100) / 100)

function outlinePath(points: readonly Point[], half: readonly number[]): string {
  if (points.length < 2) return ''
  const last = points.length - 1
  const tangents = points.map((_, i) =>
    norm(sub(points[Math.min(i + 1, last)]!, points[Math.max(i - 1, 0)]!)),
  )
  const left = points.map((p, i) => add(p, [-tangents[i]![1], tangents[i]![0]], half[i]!))
  const right = points
    .map((p, i) => add(p, [tangents[i]![1], -tangents[i]![0]], half[i]!))
    .reverse()
  const line = (list: readonly Point[]): string =>
    list.map(p => ` L ${r2(p[0])} ${r2(p[1])}`).join('')
  return `M ${r2(left[0]![0])} ${r2(left[0]![1])}${line(left.slice(1))} A ${r2(half[last]!)} ${r2(half[last]!)} 0 0 0 ${r2(right[0]![0])} ${r2(right[0]![1])}${line(right.slice(1))} A ${r2(half[0]!)} ${r2(half[0]!)} 0 0 0 ${r2(left[0]![0])} ${r2(left[0]![1])} Z`
}
