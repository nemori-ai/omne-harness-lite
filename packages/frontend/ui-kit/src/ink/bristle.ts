import { HAND, type Point } from '../icons/brush.ts'
import { seeded, type InkStroke } from './writing.ts'

export const BANDS = [0.45, 0.72, 1] as const
const bandOf = (density: number): number => (density > 0.86 ? 2 : density > 0.58 ? 1 : 0)

export interface Paper {
  readonly spacing: number
  readonly tooth: number
}

export const FIGURE_PAPER: Paper = { spacing: 0.28, tooth: 0.55 }

interface Hair {
  readonly u: number
  readonly load: number
  readonly thirst: number
  readonly alpha: number
  readonly band: number
  readonly width: number
  readonly lift: number
  readonly phase: number
  readonly clump: number
  readonly from: number
  readonly to: number
}

export interface Brushed {
  readonly stroke: InkStroke
  readonly x: Float32Array
  readonly y: Float32Array
  readonly nx: Float32Array
  readonly ny: Float32Array
  readonly half: Float32Array
  readonly pressure: Float32Array
  readonly s: Float32Array
  readonly t: Float32Array
  readonly zero: number
  readonly spacing: number
  readonly length: number
  readonly hairs: readonly Hair[]
  readonly paper: Paper
  readonly bounds: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
}

function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x5f356495, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function noise(seed: number, x: number): number {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  return hash(seed, i) * (1 - u) + hash(seed, i + 1) * u
}

function tooth(x: number, y: number, size: number): number {
  const gx = x / size
  const gy = y / size
  const ix = Math.floor(gx)
  const iy = Math.floor(gy)
  const fx = gx - ix
  const fy = gy - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash(ix * 7919 + 13, iy)
  const b = hash((ix + 1) * 7919 + 13, iy)
  const c = hash(ix * 7919 + 13, iy + 1)
  const d = hash((ix + 1) * 7919 + 13, iy + 1)
  const soft = (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy
  return soft * 0.8 + hash(Math.floor(gx * 2.3), Math.floor(gy * 2.3) + 99991) * 0.2
}

const clamp = (value: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, value))
const smooth = (from: number, to: number, value: number): number => {
  const u = clamp((value - from) / (to - from))
  return u * u * (3 - 2 * u)
}

function dense(line: readonly Point[]): Point[] {
  if (line.length < 2) return [...line]
  const pad = (a: Point, b: Point): Point => [2 * a[0] - b[0], 2 * a[1] - b[1]]
  const points = [
    pad(line[0]!, line[1]!),
    ...line,
    pad(line[line.length - 1]!, line[line.length - 2]!),
  ]
  const out: Point[] = []
  for (let i = 1; i < points.length - 2; i += 1) {
    const [p0, p1, p2, p3] = [points[i - 1]!, points[i]!, points[i + 1]!, points[i + 2]!]
    const knot = (a: Point, b: Point): number =>
      Math.max(1e-4, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5)
    const t1 = knot(p0, p1)
    const t2 = t1 + knot(p1, p2)
    const t3 = t2 + knot(p2, p3)
    const steps = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 2))
    for (let k = 0; k < steps; k += 1) {
      const t = t1 + ((t2 - t1) * k) / steps
      const mix = (a: Point, b: Point, ta: number, tb: number): Point => [
        ((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta),
        ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta),
      ]
      const a1 = mix(p0, p1, 0, t1)
      const a2 = mix(p1, p2, t1, t2)
      const a3 = mix(p2, p3, t2, t3)
      const b1 = mix(a1, a2, 0, t2)
      const b2 = mix(a2, a3, t1, t3)
      out.push(mix(b1, b2, t1, t2))
    }
  }
  out.push(line[line.length - 1]!)
  return out
}

export const widthOf = (stroke: InkStroke): number => HAND.width * stroke.weight

export function lay(stroke: InkStroke, paper: Paper = FIGURE_PAPER): Brushed {
  const width = widthOf(stroke)
  const path = dense(stroke.line)
  const lengths = [0]
  for (let i = 1; i < path.length; i += 1)
    lengths.push(
      lengths[i - 1]! + Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]),
    )
  const length = Math.max(1e-3, lengths[lengths.length - 1]!)
  const press = (t: number): number => clamp(stroke.press(clamp(t)), 0.02, 1.25)
  const head = (width / 2) * press(0)
  const tail = (width / 2) * press(1)
  const spacing = Math.min(paper.spacing, length / 4)
  const before = Math.ceil(head / spacing) + 1
  const along = Math.ceil(length / spacing)
  const after = Math.ceil(tail / spacing) + 1
  const count = before + along + 1 + after
  const x = new Float32Array(count)
  const y = new Float32Array(count)
  const nx = new Float32Array(count)
  const ny = new Float32Array(count)
  const half = new Float32Array(count)
  const pressure = new Float32Array(count)
  const s = new Float32Array(count)
  const t = new Float32Array(count)
  const end = path.length - 1
  const dirAt = (j: number): Point => {
    const a = path[Math.max(0, j - 1)]!
    const b = path[Math.min(end, j + 1)]!
    const size = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return [(b[0] - a[0]) / size, (b[1] - a[1]) / size]
  }
  const startDir = dirAt(0)
  const endDir = dirAt(end)
  let j = 1
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let k = 0; k < count; k += 1) {
    const at = (k - before) * spacing
    let px: number
    let py: number
    let dir: Point
    if (at <= 0) {
      dir = startDir
      px = path[0]![0] + dir[0] * at
      py = path[0]![1] + dir[1] * at
    } else if (at >= length) {
      dir = endDir
      px = path[end]![0] + dir[0] * (at - length)
      py = path[end]![1] + dir[1] * (at - length)
    } else {
      while (j < end && lengths[j]! < at) j += 1
      const span = lengths[j]! - lengths[j - 1]! || 1
      const f = (at - lengths[j - 1]!) / span
      px = path[j - 1]![0] + (path[j]![0] - path[j - 1]![0]) * f
      py = path[j - 1]![1] + (path[j]![1] - path[j - 1]![1]) * f
      const d0 = dirAt(j - 1)
      const d1 = dirAt(j)
      const dx = d0[0] + (d1[0] - d0[0]) * f
      const dy = d0[1] + (d1[1] - d0[1]) * f
      const size = Math.hypot(dx, dy) || 1
      dir = [dx / size, dy / size]
    }
    const share = clamp(at / length)
    const p = press(share)
    x[k] = px
    y[k] = py
    nx[k] = -dir[1]
    ny[k] = dir[0]
    pressure[k] = p
    half[k] = (width / 2) * p
    s[k] = at
    t[k] = share
    const reach = half[k]! * 1.25 + width * 0.08
    minX = Math.min(minX, px - reach)
    minY = Math.min(minY, py - reach)
    maxX = Math.max(maxX, px + reach)
    maxY = Math.max(maxY, py + reach)
  }

  const random = seeded((stroke.seed ^ 0x2c1b3c6d) + 1)
  const wet = stroke.wet ?? 0.5
  const many = Math.round(clamp(width * 3.6, 10, 40))
  const clumps = 3 + Math.floor(random() * 2)
  const hairs: Hair[] = []
  for (let i = 0; i < many; i += 1) {
    const u = clamp(-1 + (2 * (i + 0.5)) / many + (random() - 0.5) * (1.4 / many), -1, 1)
    const edge = Math.abs(u)
    const cap = Math.sqrt(Math.max(0, 1 - u * u))
    const from = Math.max(0, before - Math.round((cap * head) / spacing))
    const to = Math.min(count - 1, before + along + Math.round((cap * tail) / spacing))
    const load =
      1 - stroke.dry * 0.25 * random() - (edge > 0.75 ? stroke.dry * 0.3 * (edge - 0.75) * 4 : 0)
    const thirst = Math.min(0.7, stroke.dry * (0.48 + 0.36 * random()) * (1 + 0.45 * edge))
    const alpha = clamp(
      stroke.ink * (0.74 + 0.22 * random() + 0.12 * wet) * (1 + (stroke.tint ?? 0) * u * 0.55),
      0.03,
      1,
    )
    const hairWidth = (width / many) * (1.75 + 1.1 * wet) * (0.8 + 0.4 * random())
    const phase = Math.floor(random() * 1e6)
    hairs.push({
      u,
      load,
      thirst,
      alpha,
      width: hairWidth,
      lift: 0.2 * edge * edge * edge,
      phase,
      band: bandOf(
        (1 + (stroke.tint ?? 0) * u * 0.6) *
          (1 - 0.42 * smooth(0.85, 1, wet) * (1 - smooth(0.5, 0.92, edge))) +
          (hash(phase, 7) - 0.5) * 0.14,
      ),
      clump: Math.min(clumps - 1, Math.floor(((u + 1) / 2) * clumps)),
      from,
      to,
    })
  }
  return {
    stroke,
    x,
    y,
    nx,
    ny,
    half,
    pressure,
    s,
    t,
    zero: before,
    spacing,
    length,
    hairs,
    paper,
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  }
}

interface Touch {
  x: number
  y: number
  width: number
  alpha: number
}

function touch(brushed: Brushed, hair: Hair, k: number, out: Touch): Touch {
  const { stroke, paper } = brushed
  const share = brushed.t[k]!
  const p = brushed.pressure[k]!
  const along = brushed.s[k]!
  const width = widthOf(stroke)
  const streak = Math.max(1.6, width * 0.85)
  let u = hair.u + (noise(hair.phase, along / (streak * 1.3)) - 0.5) * (0.1 + 0.2 * stroke.dry)
  const parting =
    stroke.parting !== undefined
      ? stroke.parting(share)
      : stroke.split > 0
        ? smooth(1 - 0.16 - 0.1 * stroke.split, 1, share) * stroke.split
        : 0
  if (parting > 0) u += ((hair.clump + 0.5) / 3 - 0.5) * 0.9 * parting + u * 0.25 * parting
  const off = u * brushed.half[k]!
  out.x = brushed.x[k]! + brushed.nx[k]! * off
  out.y = brushed.y[k]! + brushed.ny[k]! * off
  const beyond = along < 0 ? -along : along > brushed.length ? along - brushed.length : 0
  const cap = beyond > 0 ? 1 - 0.3 * clamp(beyond / Math.max(0.01, brushed.half[k]!)) : 1
  out.width = hair.width * (0.45 + 0.55 * Math.min(1, p) ** 0.8) * cap
  if (p < hair.lift) {
    out.alpha = 0
    return out
  }
  const drying = stroke.drying !== undefined ? stroke.drying(share) : smooth(0.38, 1, share) ** 1.25
  let left =
    hair.load - hair.thirst * drying - (1 - Math.min(1, p)) * 0.12 * stroke.dry - parting * 0.3
  if (parting > 0) {
    const inClump = (((hair.u + 1) / 2) * 3.5) % 1
    left -= parting * 0.75 * (1 - Math.sin(inClump * Math.PI)) ** 2
  }
  if (left >= 1) {
    out.alpha = hair.alpha
    return out
  }
  const rough =
    0.46 * noise(hair.phase + 17, along / streak) +
    0.2 * noise(hair.phase + 31, (along * 2.9) / streak) +
    0.34 * tooth(out.x, out.y, paper.tooth)
  const room = left - (rough * 0.92 + 0.04)
  out.alpha = room <= 0 ? 0 : hair.alpha * (0.45 + 0.55 * clamp(left)) * smooth(0, 0.22, room)
  return out
}

function halfWidth(hair: Hair, k: number, t: Touch): number {
  const half =
    t.alpha <= 0.004
      ? 0
      : (t.width / 2) *
        (0.12 + 0.88 * Math.min(1, t.alpha / hair.alpha)) *
        (0.55 + 0.45 * hair.alpha)
  return k === hair.from || k === hair.to ? half * 0.6 : half
}

export class Painter {
  private readonly next: Int32Array
  private readonly touched: Touch = { x: 0, y: 0, width: 0, alpha: 0 }
  private readonly rx: Float32Array
  private readonly ry: Float32Array
  private readonly rw: Float32Array
  private readonly rnx: Float32Array
  private readonly rny: Float32Array
  private run = 0
  private band: CanvasRenderingContext2D | undefined = undefined
  private drew = false
  public readonly brushed: Brushed

  public constructor(brushed: Brushed) {
    this.brushed = brushed
    this.next = Int32Array.from(brushed.hairs, hair => hair.from)
    const room = brushed.x.length + 2
    this.rx = new Float32Array(room)
    this.ry = new Float32Array(room)
    this.rw = new Float32Array(room)
    this.rnx = new Float32Array(room)
    this.rny = new Float32Array(room)
  }

  private reach(hair: Hair, written: number): number {
    const b = this.brushed
    if (written >= 1) return hair.to
    const at = written * b.length
    const k = Math.min(b.x.length - 1, b.zero + Math.floor(at / b.spacing))
    const ahead = Math.sqrt(Math.max(0, 1 - hair.u * hair.u)) * b.half[k]!
    return Math.min(hair.to, b.zero + Math.floor((at + ahead) / b.spacing))
  }

  public paint(bands: readonly CanvasRenderingContext2D[], written: number): boolean {
    if (written <= 0) return false
    this.drew = false
    this.run = 0
    this.band = undefined
    for (let h = 0; h < this.brushed.hairs.length; h += 1) this.paintHair(bands, h, written)
    return this.drew
  }

  private paintHair(bands: readonly CanvasRenderingContext2D[], h: number, written: number): void {
    const b = this.brushed
    const hair = b.hairs[h]!
    const target = this.reach(hair, written)
    const start = this.next[h]!
    if (target < start) return
    this.band = bands[hair.band]
    let px = 0
    let py = 0
    let pk = -1
    for (let k = Math.max(hair.from, start - 2); k <= target; k += 1) {
      const t = touch(b, hair, k, this.touched)
      const half = halfWidth(hair, k, t)
      if (half <= 0) {
        if (this.run > 0) {
          this.push(k, t.x, t.y, 0)
          this.flush()
        }
      } else {
        if (this.run === 0 && pk >= 0 && pk === k - 1) this.push(pk, px, py, 0)
        this.push(k, t.x, t.y, half)
      }
      px = t.x
      py = t.y
      pk = k
    }
    this.flush()
    this.next[h] = target + 1
  }

  private push(k: number, x: number, y: number, half: number): void {
    const n = this.run
    this.rx[n] = x
    this.ry[n] = y
    this.rw[n] = half
    this.rnx[n] = this.brushed.nx[k]!
    this.rny[n] = this.brushed.ny[k]!
    this.run = n + 1
  }

  private flush(): void {
    const ctx = this.band
    const n = this.run
    if (n >= 2 && ctx !== undefined) {
      const { rx, ry, rw, rnx, rny } = this
      ctx.beginPath()
      ctx.moveTo(rx[0]! + rnx[0]! * rw[0]!, ry[0]! + rny[0]! * rw[0]!)
      for (let i = 1; i < n; i += 1)
        ctx.lineTo(rx[i]! + rnx[i]! * rw[i]!, ry[i]! + rny[i]! * rw[i]!)
      for (let i = n - 1; i >= 0; i -= 1)
        ctx.lineTo(rx[i]! - rnx[i]! * rw[i]!, ry[i]! - rny[i]! * rw[i]!)
      ctx.closePath()
      ctx.fill()
      this.drew = true
    }
    this.run = 0
  }

  public erase(
    bands: readonly CanvasRenderingContext2D[],
    from: number,
    to: number,
    alpha: number,
  ): void {
    if (alpha <= 0 || to <= from) return
    const b = this.brushed
    const last = b.x.length - 1
    const index = (share: number): number =>
      share <= 0
        ? 0
        : share >= 1
          ? last
          : Math.min(last, b.zero + Math.floor((share * b.length) / b.spacing))
    const k0 = index(from)
    const k1 = index(to)
    if (k1 <= k0) return
    let widest = 0
    for (let k = k0; k <= k1; k += 1) widest = Math.max(widest, b.half[k]!)
    const step = 3
    for (const ctx of bands) {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.globalAlpha = alpha
      ctx.strokeStyle = 'CanvasText'
      ctx.lineCap = 'butt'
      ctx.lineJoin = 'round'
      ctx.lineWidth = widest * 4.4 + 1.5
      ctx.beginPath()
      ctx.moveTo(b.x[k0]!, b.y[k0]!)
      for (let k = k0 + step; k < k1; k += step) ctx.lineTo(b.x[k]!, b.y[k]!)
      ctx.lineTo(b.x[k1]!, b.y[k1]!)
      ctx.stroke()
      ctx.restore()
    }
  }

  public get done(): boolean {
    return this.brushed.hairs.every((hair, h) => this.next[h]! > hair.to)
  }
}
