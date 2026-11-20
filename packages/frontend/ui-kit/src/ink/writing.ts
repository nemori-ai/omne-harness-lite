import { handPressure, type Point, type Pressure } from '../icons/brush.ts'

export type Ending = 'plain' | 'taper' | 'stop' | 'split' | 'turn'

export interface InkStroke {
  readonly line: readonly Point[]
  readonly weight: number
  readonly press: Pressure
  readonly dry: number
  readonly split: number
  readonly ink: number
  readonly wet?: number
  readonly tint?: number
  readonly drying?: (share: number) => number
  readonly parting?: (share: number) => number
  readonly seed: number
  readonly ending: Ending
}

export function designed(
  line: readonly Point[],
  weight: number,
  extra: Partial<Omit<InkStroke, 'line' | 'weight'>> = {},
): InkStroke {
  return {
    line,
    weight,
    press: handPressure,
    dry: 0,
    split: 0,
    ink: 1,
    seed: 0,
    ending: 'plain',
    ...extra,
  }
}

export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const freshSeed = (): number => 1 + Math.floor(Math.random() * 0x7ffffffe)

export const VARIETY = { amount: 1 }

export const ENDINGS: Readonly<Record<Exclude<Ending, 'plain'>, number>> = {
  taper: 0.32,
  stop: 0.22,
  split: 0.28,
  turn: 0.18,
}

export interface Liberty {
  readonly wander?: number
  readonly freedom?: number
  readonly endings?: Partial<Record<Exclude<Ending, 'plain'>, number>>
}

const clamp = (value: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, value))
const smooth = (from: number, to: number, value: number): number => {
  const u = clamp((value - from) / (to - from))
  return u * u * (3 - 2 * u)
}

function pick<K extends string>(random: () => number, weights: Partial<Record<K, number>>): K {
  const entries = Object.entries(weights) as [K, number][]
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [key, weight] of entries) {
    roll -= weight
    if (roll <= 0) return key
  }
  return entries[entries.length - 1]![0]
}

const lengthOf = (line: readonly Point[]): number =>
  line.reduce(
    (sum, point, i) =>
      i === 0 ? 0 : sum + Math.hypot(point[0] - line[i - 1]![0], point[1] - line[i - 1]![1]),
    0,
  )

const rotate = ([x, y]: Point, angle: number): Point => [
  x * Math.cos(angle) - y * Math.sin(angle),
  x * Math.sin(angle) + y * Math.cos(angle),
]

function endLine(
  line: readonly Point[],
  ending: Ending,
  span: (lo: number, hi: number) => number,
  freedom: number,
): { line: Point[]; grow: number } {
  const points = [...line]
  if (points.length < 2 || freedom <= 0) return { line: points, grow: 1 }
  const last = points[points.length - 1]!
  const prev = points[points.length - 2]!
  const d: Point = [last[0] - prev[0], last[1] - prev[1]]
  const step = Math.hypot(d[0], d[1]) || 1
  const unit: Point = [d[0] / step, d[1] / step]
  const before = points[points.length - 3]
  const bend =
    before === undefined
      ? 0
      : Math.atan2(unit[1], unit[0]) - Math.atan2(prev[1] - before[1], prev[0] - before[0])
  const curve = Math.atan2(Math.sin(bend), Math.cos(bend))
  const length = lengthOf(points) || 1
  if (ending === 'taper' || ending === 'split') {
    const carry = (ending === 'taper' ? span(0.22, 0.5) : span(0, 0.22)) * step * freedom
    if (carry > 0.01) {
      const [x, y] = rotate(unit, curve * 0.8)
      points.push([last[0] + x * carry, last[1] + y * carry])
    }
    return { line: points, grow: (length + carry) / length }
  }
  if (ending === 'turn') {
    const side = span(0, 1) < 0.5 ? -1 : 1
    const lean = span(0.1, 0.24) * step * freedom
    const normal: Point = [-unit[1] * side, unit[0] * side]
    const leaned: Point = [last[0] + normal[0] * lean, last[1] + normal[1] * lean]
    const [hx, hy] = rotate(unit, side * span(0.45, 0.9))
    const hook = span(0.14, 0.3) * step * freedom
    points[points.length - 1] = leaned
    points.push([leaned[0] + hx * hook, leaned[1] + hy * hook])
    return { line: points, grow: lengthOf(points) / length }
  }
  return { line: points, grow: 1 }
}

export function vary(stroke: InkStroke, seed: number, liberty: Liberty = {}): InkStroke {
  const amount = VARIETY.amount
  if (seed === 0 || amount <= 0) return stroke
  const random = seeded(seed)
  const span = (lo: number, hi: number): number => lo + (hi - lo) * random()
  const freedom = clamp((liberty.freedom ?? 1) * amount)

  const wander = (liberty.wander ?? 0) * amount
  const waves = [span(0.5, 1.4), span(0, Math.PI * 2), span(0.5, 1.4), span(0, Math.PI * 2)]
  const wandered =
    wander <= 0
      ? stroke.line
      : stroke.line.map(([x, y], i): Point => [
          x + wander * Math.sin(i * waves[0]! + waves[1]!),
          y + wander * Math.sin(i * waves[2]! + waves[3]!),
        ])

  const ending = pick(random, liberty.endings ?? ENDINGS)
  const { line, grow } = endLine(wandered, ending, span, freedom)

  const base = stroke.press
  const landing = span(-0.09, 0.07) * freedom
  const breath = { at: span(0.3, 0.72), by: span(-0.08, 0.08) * freedom, width: span(0.08, 0.16) }
  const lift = (() => {
    switch (ending) {
      case 'taper': {
        const from = 1 - span(0.14, 0.26)
        const to = span(0.08, 0.17)
        return (t: number, p: number) => p + (to - p) * smooth(from, 1, t) * freedom
      }
      case 'stop': {
        const hold = span(0.6, 0.74)
        const press = span(0.04, 0.11)
        return (t: number, p: number) =>
          p +
          ((Math.max(p, hold) - p) * smooth(0.5, 0.92, t) +
            press * Math.exp(-(((t - 0.955) / 0.032) ** 2))) *
            freedom
      }
      case 'split': {
        const to = span(0.44, 0.58)
        return (t: number, p: number) => p + (to - p) * smooth(0.72, 1, t) * freedom
      }
      case 'turn': {
        const to = span(0.22, 0.36)
        return (t: number, p: number) => p + (to - p) * smooth(0.82, 1, t) * freedom
      }
      default:
        return (_t: number, p: number) => p
    }
  })()
  const press: Pressure = t => {
    let p = base(Math.min(1, t * grow))
    p *= 1 + landing * (1 - smooth(0, 0.2, t))
    p *= 1 + breath.by * Math.exp(-(((t - breath.at) / breath.width) ** 2))
    return clamp(lift(t, p), 0.04, 1.2)
  }

  const dryBy = {
    taper: span(0.8, 1.15),
    stop: span(0.35, 0.75),
    split: span(1.1, 1.45),
    turn: span(0.7, 1.1),
    plain: 1,
  }[ending]
  const dry = clamp(stroke.dry * (1 + (dryBy - 1) * freedom), 0, Math.max(stroke.dry, 0.72))
  const split = ending === 'split' ? clamp(stroke.split + span(0.5, 1) * freedom) : stroke.split
  const ink = clamp(stroke.ink * (1 - span(0, 0.09) * freedom))
  const weight = stroke.weight * (1 + span(-0.04, 0.04) * freedom)
  return { ...stroke, line, weight, press, dry, split, ink, seed, ending }
}
