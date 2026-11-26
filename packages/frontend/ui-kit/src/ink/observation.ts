import { type Point } from '../icons/brush.ts'
import { FINE, OWN_CANVAS, widthPx } from './brush-weight.ts'
import { WRITE } from './body.ts'
import { DEFAULT_HAND } from './ink.ts'
import { type Box } from './travel.ts'

export const FRAME = {
  write: { base: 260, perimeter: 0.11, least: 520, most: 1200, spread: 0.1 },
  settle: { duration: 700, to: 0.86 },
  dry: 600,
  corner: 10,
  close: WRITE.mark,
  weight: FINE,
  reach: widthPx(FINE),
  mouth:
    (DEFAULT_HAND.radius * DEFAULT_HAND.gap * Math.PI * OWN_CANVAS.px) / (180 * OWN_CANVAS.units),
} as const

export type Side = 'top' | 'right' | 'bottom' | 'left'

export interface Span {
  readonly from: number
  readonly to: number
}

export interface Run {
  readonly points: readonly Point[]
  readonly along: readonly number[]
}

export interface FrameLines {
  readonly length: number
  readonly runs: readonly Run[]
  readonly mouth: readonly Run[]
}

interface SideLine {
  readonly at: number
  readonly from: number
  readonly to: number
  readonly across: (box: Box) => Span
  readonly along: (box: Box) => Span
}

const NEAREST_STEP = 0.25

const xSpan = (box: Box): Span => ({ from: box.x, to: box.x + box.width })
const ySpan = (box: Box): Span => ({ from: box.y, to: box.y + box.height })

function sideLine(rect: Box, side: Side): SideLine {
  const [right, bottom] = [rect.x + rect.width, rect.y + rect.height]
  if (side === 'top' || side === 'bottom')
    return { at: side === 'top' ? rect.y : bottom, ...xSpan(rect), across: ySpan, along: xSpan }
  return { at: side === 'left' ? rect.x : right, ...ySpan(rect), across: xSpan, along: ySpan }
}

const grown = (box: Box, by: number): Box => ({
  x: box.x - by,
  y: box.y - by,
  width: box.width + by * 2,
  height: box.height + by * 2,
})

function subtract(spans: readonly Span[], cut: Span): Span[] {
  return spans.flatMap(span => {
    if (cut.to <= span.from || cut.from >= span.to) return [span]
    const kept: Span[] = []
    if (cut.from > span.from) kept.push({ from: span.from, to: cut.from })
    if (cut.to < span.to) kept.push({ from: cut.to, to: span.to })
    return kept
  })
}

export function bareSides(
  rect: Box,
  covered: readonly Box[],
  reach: number,
): Readonly<Record<Side, readonly Span[]>> {
  const bare = (side: Side): Span[] => {
    const line = sideLine(rect, side)
    return covered
      .map(box => grown(box, reach))
      .filter(box => {
        const across = line.across(box)
        return line.at >= across.from && line.at <= across.to
      })
      .reduce<Span[]>(
        (spans, box) => subtract(spans, line.along(box)),
        [{ from: line.from, to: line.to }],
      )
  }
  return { top: bare('top'), right: bare('right'), bottom: bare('bottom'), left: bare('left') }
}

interface Piece {
  readonly start: number
  readonly length: number
  readonly at: (s: number) => Point
  readonly side?: Side
  readonly toSide?: (s: number) => number
}

function walk(rect: Box): { readonly pieces: readonly Piece[]; readonly length: number } {
  const r = Math.max(0, Math.min(FRAME.corner, rect.width / 2, rect.height / 2))
  const [x0, y0, x1, y1] = [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height]
  const quarter = (Math.PI * r) / 2
  const arc =
    (cx: number, cy: number, from: number) =>
    (s: number): Point => {
      const angle = from + (r === 0 ? 0 : s / r)
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
    }
  const shapes: Omit<Piece, 'start'>[] = [
    { length: x1 - x0 - 2 * r, at: s => [x0 + r + s, y0], side: 'top', toSide: s => x0 + r + s },
    { length: quarter, at: arc(x1 - r, y0 + r, -Math.PI / 2) },
    { length: y1 - y0 - 2 * r, at: s => [x1, y0 + r + s], side: 'right', toSide: s => y0 + r + s },
    { length: quarter, at: arc(x1 - r, y1 - r, 0) },
    { length: x1 - x0 - 2 * r, at: s => [x1 - r - s, y1], side: 'bottom', toSide: s => x1 - r - s },
    { length: quarter, at: arc(x0 + r, y1 - r, Math.PI / 2) },
    { length: y1 - y0 - 2 * r, at: s => [x0, y1 - r - s], side: 'left', toSide: s => y1 - r - s },
    { length: quarter, at: arc(x0 + r, y0 + r, Math.PI) },
  ]
  let start = 0
  const pieces = shapes.map(shape => {
    const piece = { ...shape, start }
    start += shape.length
    return piece
  })
  return { pieces, length: start }
}

function pointOn(pieces: readonly Piece[], length: number, s: number): Point {
  const at = ((s % length) + length) % length
  const piece = pieces.find(p => at < p.start + p.length) ?? pieces[pieces.length - 1]!
  return piece.at(Math.min(piece.length, at - piece.start))
}

function nearest(pieces: readonly Piece[], to: Point): number {
  let [best, far] = [0, Infinity]
  for (const piece of pieces)
    for (let k = 0; k * NEAREST_STEP <= piece.length; k += 1) {
      const [x, y] = piece.at(k * NEAREST_STEP)
      const d = Math.hypot(x - to[0], y - to[1])
      if (d < far) [best, far] = [piece.start + k * NEAREST_STEP, d]
    }
  return best
}

function hiddenWalk(rect: Box, covered: readonly Box[], reach: number): Span[] {
  const { pieces } = walk(rect)
  const bare = bareSides(rect, covered, reach)
  const boxes = covered.map(box => grown(box, reach))
  return pieces.flatMap(piece => {
    const whole = { from: piece.start, to: piece.start + piece.length }
    if (piece.side === undefined || piece.toSide === undefined) {
      const [x, y] = piece.at(piece.length / 2)
      const inside = boxes.some(
        b => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height,
      )
      return inside ? [whole] : []
    }
    const toSide = piece.toSide
    const shown = bare[piece.side].map(span => {
      const [a, b] = [toSide(0), toSide(piece.length)]
      const flip = b < a
      const s = (v: number): number => (flip ? a - v : v - a)
      const [u, w] = [s(span.from), s(span.to)].sort((p, q) => p - q) as [number, number]
      return { from: piece.start + Math.max(0, u), to: piece.start + Math.min(piece.length, w) }
    })
    return shown.reduce<Span[]>(
      (left, span) => (span.to > span.from ? subtract(left, span) : left),
      [whole],
    )
  })
}

function runsOf(
  bare: readonly Span[],
  pieces: readonly Piece[],
  length: number,
  origin: number,
): Run[] {
  return bare.map(({ from, to }) => {
    const count = Math.max(1, Math.ceil((to - from) / 3))
    const along = Array.from({ length: count + 1 }, (_, i) => from + ((to - from) * i) / count)
    return { along, points: along.map(u => pointOn(pieces, length, origin + u)) }
  })
}

export function frameLines({
  rect,
  covered,
  figure,
  reach = FRAME.reach,
  mouth = FRAME.mouth,
}: {
  readonly rect: Box
  readonly covered: readonly Box[]
  readonly figure: Point
  readonly reach?: number
  readonly mouth?: number
}): FrameLines {
  const { pieces, length } = walk(rect)
  const gap = Math.min(mouth, length / 4)
  const origin = nearest(pieces, figure) + gap / 2
  const inU = (span: Span): Span[] => {
    const [from, to] = [span.from - origin, span.to - origin]
    const wrap = (v: number): number => ((v % length) + length) % length
    const [a, b] = [wrap(from), wrap(from) + (to - from)]
    return b <= length
      ? [{ from: a, to: b }]
      : [
          { from: a, to: length },
          { from: 0, to: b - length },
        ]
  }
  const hidden = hiddenWalk(rect, covered, reach).flatMap(inU)
  const cut = (span: Span): Span[] =>
    hidden.reduce<Span[]>((left, h) => subtract(left, h), [span]).filter(s => s.to - s.from > 0.5)
  const drawn = length - gap
  return {
    length: drawn,
    runs: runsOf(cut({ from: 0, to: drawn }), pieces, length, origin),
    mouth: runsOf(cut({ from: drawn, to: length }), pieces, length, origin),
  }
}

export const frameWriteTime = (
  rect: Box,
  vary: (value: number, spread: number) => number,
): number => {
  const { base, perimeter, least, most, spread } = FRAME.write
  const designed = base + perimeter * 2 * (rect.width + rect.height)
  return vary(Math.min(most, Math.max(least, designed)), spread)
}

const r2 = (value: number): string => String(Math.round(value * 100) / 100)

function prefix(run: Run, upTo: number): { points: Point[]; along: number[] } {
  const points: Point[] = []
  const along: number[] = []
  for (let i = 0; i < run.points.length && run.along[i]! <= upTo; i += 1) {
    points.push(run.points[i]!)
    along.push(run.along[i]!)
  }
  const next = points.length
  if (next > 0 && next < run.points.length && upTo > along[next - 1]!) {
    const [a, b] = [run.points[next - 1]!, run.points[next]!]
    const f = (upTo - run.along[next - 1]!) / (run.along[next]! - run.along[next - 1]!)
    points.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
    along.push(upTo)
  }
  return { points, along }
}

function cap(centre: Point, from: Point, half: number, turns: number): Point[] {
  const start = Math.atan2(from[1] - centre[1], from[0] - centre[0])
  return Array.from({ length: turns - 1 }, (_, k) => {
    const angle = start - (Math.PI * (k + 1)) / turns
    return [centre[0] + half * Math.cos(angle), centre[1] + half * Math.sin(angle)] as const
  })
}

export function inkPath(run: Run, upTo: number, width: (along: number) => number): string {
  const { points, along } = prefix(run, upTo)
  if (points.length < 2) return ''
  const last = points.length - 1
  const half = along.map(u => width(u) / 2)
  const side = (i: number, sign: 1 | -1): Point => {
    const [a, b] = [points[Math.max(0, i - 1)]!, points[Math.min(last, i + 1)]!]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const [nx, ny] = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length]
    return [points[i]![0] + sign * nx * half[i]!, points[i]![1] + sign * ny * half[i]!]
  }
  const left = points.map((_, i) => side(i, 1))
  const right = points.map((_, i) => side(i, -1)).reverse()
  const ring = [
    ...left,
    ...cap(points[last]!, left[last]!, half[last]!, 6),
    ...right,
    ...cap(points[0]!, right[last]!, half[0]!, 6),
  ]
  return `M ${ring.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(' L ')} Z`
}
