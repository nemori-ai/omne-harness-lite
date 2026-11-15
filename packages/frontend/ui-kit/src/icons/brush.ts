export type Point = readonly [number, number]

export interface Stroke {
  readonly ink: string

  readonly trail: string
}

export const HAND = { width: 2.1, landingWidth: 0.82, swellLength: 0.16, liftWidth: 0.5 } as const

const round = (value: number): string => String(Math.round(value * 100) / 100)
const at = ([x, y]: Point): string => `${round(x)} ${round(y)}`
const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

function handPressure(drawn: number): number {
  if (drawn < HAND.swellLength)
    return (
      HAND.landingWidth +
      (1 - HAND.landingWidth) * Math.sin((drawn / HAND.swellLength) * (Math.PI / 2))
    )
  const u = (drawn - HAND.swellLength) / (1 - HAND.swellLength)
  return 1 - (1 - HAND.liftWidth) * u * u * (3 - 2 * u)
}

function catmullRom(points: readonly Point[]): Point[] {
  const first = points[0]!
  const last = points[points.length - 1]!
  const padded: Point[] = [
    [2 * first[0] - points[1]![0], 2 * first[1] - points[1]![1]],
    ...points,
    [2 * last[0] - points[points.length - 2]![0], 2 * last[1] - points[points.length - 2]![1]],
  ]
  const samples: Point[] = []
  for (let segment = 1; segment < padded.length - 2; segment += 1) {
    const [p0, p1, p2, p3] = [
      padded[segment - 1]!,
      padded[segment]!,
      padded[segment + 1]!,
      padded[segment + 2]!,
    ]
    for (let step = 0; step < 24; step += 1) {
      const t = step / 24
      const t2 = t * t
      const t3 = t2 * t
      const axis = (i: 0 | 1): number =>
        0.5 *
        (2 * p1[i] +
          (-p0[i] + p2[i]) * t +
          (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
          (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3)
      samples.push([axis(0), axis(1)])
    }
  }
  samples.push(last)
  return samples
}

function resample(dense: readonly Point[], spacing = 0.7, most = 40): Point[] {
  const lengths = [0]
  for (let i = 1; i < dense.length; i += 1)
    lengths.push(
      lengths[i - 1]! +
        Math.hypot(dense[i]![0] - dense[i - 1]![0], dense[i]![1] - dense[i - 1]![1]),
    )
  const length = lengths[lengths.length - 1]!
  const count = Math.min(most, Math.max(6, Math.round(length / spacing)))
  const points: Point[] = []
  let j = 1
  for (let k = 0; k <= count; k += 1) {
    const target = (k / count) * length
    while (j < dense.length - 1 && lengths[j]! < target) j += 1
    const span = lengths[j]! - lengths[j - 1]!
    const f = span === 0 ? 0 : (target - lengths[j - 1]!) / span
    points.push([
      dense[j - 1]![0] + (dense[j]![0] - dense[j - 1]![0]) * f,
      dense[j - 1]![1] + (dense[j]![1] - dense[j - 1]![1]) * f,
    ])
  }
  return points
}

function unit([x, y]: Point): Point {
  const size = Math.hypot(x, y) || 1
  return [x / size, y / size]
}

function smooth(points: readonly Point[]): string {
  let path = ''
  for (let i = 1; i < points.length - 1; i += 1)
    path += ` Q ${at(points[i]!)} ${at(mid(points[i]!, points[i + 1]!))}`
  return `${path} L ${at(points[points.length - 1]!)}`
}

export function brush(through: readonly Point[], weight = 1): Stroke {
  const points = resample(catmullRom(through))
  const last = points.length - 1
  const half = points.map((_, i) => (HAND.width * weight * handPressure(i / last)) / 2)
  return outline(points, half, HAND.width * weight)
}

function outline(
  points: readonly Point[],
  half: readonly number[],
  reach = Math.max(...half) * 2,
): Stroke {
  const last = points.length - 1
  const tangents = points.map((_, i) =>
    unit([
      points[Math.min(i + 1, last)]![0] - points[Math.max(i - 1, 0)]![0],
      points[Math.min(i + 1, last)]![1] - points[Math.max(i - 1, 0)]![1],
    ]),
  )
  const side = (sign: 1 | -1): Point[] =>
    points.map((point, i) => [
      point[0] - sign * tangents[i]![1] * half[i]!,
      point[1] + sign * tangents[i]![0] * half[i]!,
    ])
  const left = side(1)
  const right = side(-1).reverse()
  const ink = `M ${at(left[0]!)}${smooth(left)} A ${round(half[last]!)} ${round(half[last]!)} 0 0 0 ${at(right[0]!)}${smooth(right)} A ${round(half[0]!)} ${round(half[0]!)} 0 0 0 ${at(left[0]!)} Z`
  const before: Point = [
    points[0]![0] - tangents[0]![0] * reach,
    points[0]![1] - tangents[0]![1] * reach,
  ]
  const after: Point = [
    points[last]![0] + tangents[last]![0] * reach,
    points[last]![1] + tangents[last]![1] * reach,
  ]
  const trail = `M ${at(before)} L ${at(points[0]!)}${smooth(points)} L ${at(after)}`
  return { ink, trail }
}

export function arc(
  [cx, cy]: Point,
  radius: number,
  from: number,
  to: number,
  wobble = 0,
): Point[] {
  const count = Math.max(3, Math.round(Math.abs(to - from) / 30))
  return Array.from({ length: count + 1 }, (_, i) => {
    const angle = ((from + ((to - from) * i) / count) * Math.PI) / 180
    const r = radius + wobble * Math.sin(angle * 2 + 0.6)
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const
  })
}

export function dot([x, y]: Point, weight = 1): Stroke {
  return brush(
    [
      [x - 0.45, y - 0.3],
      [x + 0.45, y + 0.3],
    ],
    weight * 1.4,
  )
}
