import { type Point } from '../icons/brush.ts'
import { brushTime, ms, WRITE, type FigureBody, type Frame } from './body.ts'
import { PRESS } from './brush-weight.ts'
import { BODY_CASUAL, casual } from './casual.ts'
import { inkNow } from './clock.ts'
import { CANVAS, CENTRE, circleStroke } from './ink.ts'
import { brushedOf, OWN_PAPER, type Area } from './ink-canvas.ts'
import { designed, freshSeed, seeded, vary, type InkStroke } from './writing.ts'

export interface Placement {
  readonly x: number
  readonly y: number
}

export interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export const FLIGHT = { least: 420, most: 950 } as const

export const flightTime = (distance: number): number =>
  Math.min(FLIGHT.most, Math.max(FLIGHT.least, 320 + distance * 0.45))

export interface Remnant {
  readonly id: number
  readonly frame: Frame
  readonly area: Area
  readonly origin: Placement
  readonly size: number
  written: number
  tail: {
    readonly from: number
    readonly to: number
    readonly alpha: number
    readonly gone: readonly [number, number]
  } | null
  opacity: number
}

export interface Tip {
  readonly point: Placement
  readonly heading: Point
}

interface Drying {
  readonly start: number
  readonly duration: number
  readonly from: number
}

export const TRAVEL_CASUAL = { bow: 0.4, reach: 0.2, time: 0.12 } as const

export interface Timed {
  readonly ms: number
  readonly start?: number
  readonly hold?: boolean
  readonly along?: Readonly<{ from: number; to: number }>
}

const HELD_INK = 26

const CARRY_WAKE = { linger: 30, fade: 35 } as const

interface Way {
  readonly remnant: Remnant
  readonly stroke: InkStroke
  readonly start: number
  readonly duration: number
  readonly passed: { t: number; share: number }[]
  land: ((arrived: boolean) => void) | null
  last: number
  gone: number
  readonly linger: number
  readonly fade: number
  reached: (() => void) | null
  readonly holds: boolean
  held: boolean
  readonly along: Readonly<{ from: number; to: number }> | null
}

const smooth = (from: number, to: number, value: number): number => {
  const u = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return u * u * (3 - 2 * u)
}

const through =
  (keys: readonly (readonly [number, number])[]) =>
  (t: number): number => {
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

export function wayStroke(
  from: Tip,
  to: Tip,
  unit: number,
  weight: number,
  seed: number,
  loose: readonly number[] | null = null,
  carries = false,
): InkStroke {
  const a: Point = [from.point.x / unit, from.point.y / unit]
  const d: Point = [to.point.x / unit, to.point.y / unit]
  const span = Math.hypot(d[0] - a[0], d[1] - a[1])
  const reach = Math.min(72, Math.max(6, span * 0.32))
  let [nx, ny] = span > 0 ? [-(d[1] - a[1]) / span, (d[0] - a[0]) / span] : [0, 0]
  const middle: Point = [
    globalThis.innerWidth / 2 / unit - (a[0] + d[0]) / 2,
    globalThis.innerHeight / 2 / unit - (a[1] + d[1]) / 2,
  ]
  if (nx * middle[0] + ny * middle[1] < 0) {
    nx = -nx
    ny = -ny
  }
  const bow = carries ? Math.min(18, span * 0.02) : Math.min(84, span * 0.18)
  const loosely = carries ? null : loose
  const by = (index: number, spread: number): number =>
    loosely === null ? 1 : 1 + ((loosely[index] ?? 0.5) * 2 - 1) * spread
  const [bowFrom, bowTo, reachFrom, reachTo] = [
    by(0, TRAVEL_CASUAL.bow),
    by(1, TRAVEL_CASUAL.bow),
    by(2, TRAVEL_CASUAL.reach),
    by(3, TRAVEL_CASUAL.reach),
  ]
  const inside = ([x, y]: Point): Point =>
    loosely === null
      ? [x, y]
      : [
          Math.min(globalThis.innerWidth / unit, Math.max(0, x)),
          Math.min(globalThis.innerHeight / unit, Math.max(0, y)),
        ]
  const b: Point = inside([
    a[0] + from.heading[0] * reach * reachFrom + nx * bow * bowFrom,
    a[1] + from.heading[1] * reach * reachFrom + ny * bow * bowFrom,
  ])
  const c: Point = inside([
    d[0] - to.heading[0] * reach * reachTo + nx * bow * bowTo,
    d[1] - to.heading[1] * reach * reachTo + ny * bow * bowTo,
  ])
  const count = Math.round(Math.min(48, Math.max(8, span / 5)))
  const line: Point[] = []
  for (let i = 0; i <= count; i += 1) {
    const t = i / count
    const s = 1 - t
    line.push([
      s * s * s * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t * t * t * d[0],
      s * s * s * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t * t * t * d[1],
    ])
  }
  const random = seeded(seed ^ 0x5bd1e995)
  const span01 = (least: number, most: number): number => least + (most - least) * random()
  if (carries) return carriedStroke(line, weight, seed, span01)
  const far = smooth(40, 640, span)
  const thin = span01(0.56, 0.66) - 0.08 * far
  const press = through([
    [0, span01(0.66, 0.8)],
    [0.05, 0.96],
    [span01(0.14, 0.2), 0.68],
    [span01(0.3, 0.38), thin + 0.06],
    [span01(0.55, 0.65), thin],
    [span01(0.8, 0.84), 0.5],
    [0.93, 0.94],
    [1, 1],
  ])
  const peak = span01(0.26, 0.34) + 0.12 * far
  const drying = (t: number): number =>
    peak * smooth(0.05, 0.32, t) * (1 - 0.6 * smooth(0.74, 0.95, t))
  const apart = (0.25 + 0.2 * far) * span01(0.85, 1.1)
  const parting = (t: number): number => apart * smooth(0.12, 0.36, t) * (1 - smooth(0.64, 0.88, t))
  const plain = designed(line, weight * PRESS.way, {
    ink: 0.95,
    wet: 0.25,
    dry: 0.62 + 0.36 * far,
    drying,
    parting,
  })
  return {
    ...vary(plain, seed, { wander: 0.3, freedom: 0.3, endings: { stop: 1 } }),
    press,
    dry: plain.dry,
    ending: 'stop',
  }
}

function carriedStroke(
  line: readonly Point[],
  weight: number,
  seed: number,
  span01: (least: number, most: number) => number,
): InkStroke {
  const firm = through([
    [0, 0.86],
    [0.06, 1],
    [span01(0.3, 0.4), 0.9],
    [span01(0.55, 0.65), span01(0.8, 0.86)],
    [0.88, 0.92],
    [1, 0.96],
  ])
  const drying = (t: number): number => 0.12 * smooth(0.1, 0.5, t) * (1 - 0.5 * smooth(0.8, 1, t))
  const parting = (t: number): number => 0.08 * smooth(0.2, 0.5, t) * (1 - smooth(0.7, 0.9, t))
  const held = designed(line, weight * PRESS.way, {
    ink: 0.95,
    wet: 0.35,
    dry: 0.35,
    drying,
    parting,
  })
  return {
    ...vary(held, seed, { wander: 0.3, freedom: 0.3, endings: { stop: 1 } }),
    press: firm,
    dry: held.dry,
    ending: 'stop',
  }
}

function alongShare(way: Way, u: number): number {
  const { from, to } = way.along!
  const unit = way.remnant.size / CANVAS
  const target = (from + (to - from) * brushTime(Math.min(1, Math.max(0, u)))) / unit
  const toward = to >= from ? 1 : -1
  const { x, zero, spacing, length } = brushedOf(way.stroke)
  const last = Math.min(x.length - 1, zero + Math.ceil(length / spacing))
  if ((x[zero]! - target) * toward >= 0) return 0
  for (let k = zero + 1; k <= last; k += 1) {
    if ((x[k]! - target) * toward < 0) continue
    const f = (target - x[k - 1]!) / (x[k]! - x[k - 1]! || 1)
    return Math.min(1, ((k - 1 - zero + f) * spacing) / length)
  }
  return 1
}

const toward = (here: Placement, there: Placement): Point => {
  const span = Math.hypot(there.x - here.x, there.y - here.y) || 1
  return [(there.x - here.x) / span, (there.y - here.y) / span]
}

interface WayTiming {
  readonly duration?: number
  readonly leftDry?: number
  readonly start?: number
  readonly reached?: () => void
  readonly along?: Readonly<{ from: number; to: number }>
}

const holdsAtEnd = (way: Timed | undefined): boolean =>
  way?.hold === true || way?.along !== undefined

function endsOf(
  way: Timed | undefined,
  corner: boolean,
  leaving: Tip,
  to: Placement,
  landing: Tip,
): Readonly<{ from: Tip; to: Tip }> {
  const arriving = holdsAtEnd(way) ? { point: to, heading: toward(leaving.point, to) } : landing
  const from = corner
    ? { point: leaving.point, heading: toward(leaving.point, arriving.point) }
    : leaving
  return { from, to: arriving }
}

function timingOf(way: Timed | undefined, reached: () => void): WayTiming {
  if (way === undefined) return {}
  return {
    ...(holdsAtEnd(way) && { reached }),
    duration: way.ms,
    leftDry: way.ms,
    ...(way.start !== undefined && { start: way.start }),
    ...(way.along !== undefined && { along: way.along }),
  }
}

const stillWet = (way: Way): number =>
  way.held && way.land !== null ? 1 - Math.min(0.6, HELD_INK / brushedOf(way.stroke).length) : 1

type Listener = (remnants: readonly Remnant[]) => void

export class Journeys {
  private remnants: Remnant[] = []
  private readonly drying = new Map<number, Drying>()
  private ways: Way[] = []
  private nextId = 1
  private frameRequest = 0
  private readonly listeners = new Set<Listener>()
  private size: number

  public constructor(size: number) {
    this.size = size
  }

  public setOwnSize(size: number): void {
    if (size > 0) this.size = size
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.remnants)
    return () => {
      this.listeners.delete(listener)
    }
  }

  public get travelling(): boolean {
    return this.flying() !== null
  }

  public travel(
    body: FigureBody,
    from: Placement,
    to: Placement,
    landed: (arrived: boolean) => void,
    way?: Timed,
  ): void {
    const size = this.size
    const onScreen = (centre: Placement, [x, y]: readonly [number, number]): Placement => ({
      x: centre.x + ((x - CENTRE[0]) * size) / CANVAS,
      y: centre.y + ((y - CENTRE[1]) * size) / CANVAS,
    })
    const corner = this.holding()
    const cut = this.cut()
    let leaving: Tip
    let left: Frame | null = null
    if (cut !== null) leaving = cut
    else {
      const end = body.circleEnd()
      leaving = { point: onScreen(from, end?.point ?? CENTRE), heading: end?.heading ?? [1, 0] }
      left = body.leave()
    }
    const circle = circleStroke(body.hand, freshSeed())
    const [a, b] = [circle.line[0]!, circle.line[1]!]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const landing: Tip = {
      point: onScreen(to, a),
      heading: [(b[0] - a[0]) / length, (b[1] - a[1]) / length],
    }
    this.go({
      left,
      at: from,
      ...endsOf(way, corner, leaving, to, landing),
      weight: body.hand.weight,
      seed: freshSeed(),
      land: arrived => {
        body.arrive(circle, casual.around(WRITE.circle, BODY_CASUAL.landing))
        landed(arrived)
      },
      ...timingOf(way, () => landed(true)),
    })
  }

  public go({
    left,
    at,
    from,
    to,
    weight,
    seed,
    land,
    duration: timed,
    leftDry,
    start,
    reached,
    along,
  }: {
    readonly left: Frame | null
    readonly at: Placement
    readonly from: Tip
    readonly to: Tip
    readonly weight: number
    readonly seed: number
    readonly land: (arrived: boolean) => void
  } & WayTiming): void {
    const now = inkNow()
    const size = this.size
    if (left !== null) this.leaveBehind(left, at, leftDry)
    const unit = size / CANVAS
    const loose =
      along !== undefined || casual.still()
        ? null
        : [casual.random(), casual.random(), casual.random(), casual.random()]
    const stroke = wayStroke(from, to, unit, weight, seed, loose, along !== undefined)
    const { bounds } = brushedOf(stroke)
    const pad = 2
    const area = {
      x: bounds.x - pad,
      y: bounds.y - pad,
      width: bounds.width + pad * 2,
      height: bounds.height + pad * 2,
    }
    const remnant = this.add(
      { marks: [{ key: 1, stroke, written: 0, opacity: 1, tone: 'ink' }], wash: 0 },
      area,
      { x: 0, y: 0 },
      0,
      size,
    )
    const distance = Math.hypot(to.point.x - from.point.x, to.point.y - from.point.y)
    const pace = WRITE.journey
    const duration =
      timed ??
      ms(
        casual.around(
          flightTime(distance) * pace,
          TRAVEL_CASUAL.time,
          FLIGHT.least * pace,
          FLIGHT.most * pace,
        ),
      )
    const near = 1 - smooth(40, 640, distance / unit)
    this.ways.push({
      remnant,
      stroke,
      start: start ?? now,
      duration,
      passed: [],
      land,
      last: now,
      gone: 0,
      linger: along === undefined ? WRITE.wayLinger * (1 + 4 * near) : CARRY_WAKE.linger,
      fade: along === undefined ? WRITE.wayFade * (1 + 2 * near) : CARRY_WAKE.fade,
      reached: reached ?? null,
      holds: reached !== undefined,
      held: false,
      along: along ?? null,
    })
    this.wake()
  }

  public leaveBehind(left: Frame, at: Placement, duration = ms(WRITE.leftDry)): void {
    if (left.marks.length === 0) return
    const size = this.size
    const origin = { x: at.x - size / 2, y: at.y - size / 2 }
    const remnant = this.add(left, OWN_PAPER, origin, 1, size)
    this.drying.set(remnant.id, { start: inkNow(), duration, from: 1 })
    this.wake()
  }

  public cut(): Tip | null {
    const way = this.flying()
    if (way === null) return null
    way.land = null
    way.reached = null
    this.stopped(way, inkNow())
    const line = way.stroke.line
    const at = Math.max(
      1,
      Math.min(line.length - 1, Math.round(way.remnant.written * (line.length - 1))),
    )
    const [a, b] = [line[at - 1]!, line[at]!]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const unit = way.remnant.size / CANVAS
    return {
      point: { x: b[0] * unit, y: b[1] * unit },
      heading: [(b[0] - a[0]) / length, (b[1] - a[1]) / length],
    }
  }

  public end(arrived: boolean): void {
    const way = this.flying()
    if (way === null) return
    const land = way.land!
    way.land = null
    way.reached = null
    this.stopped(way, inkNow())
    land(arrived)
  }

  public dryQuickly(now = false): void {
    if (now) {
      this.remnants = []
      this.ways = []
      this.drying.clear()
      this.emit()
      return
    }
    const start = inkNow()
    for (const remnant of this.remnants)
      this.drying.set(remnant.id, { start, duration: ms(WRITE.cutDry), from: remnant.opacity })
    this.wake()
  }

  public dispose(): void {
    cancelAnimationFrame(this.frameRequest)
    this.frameRequest = 0
    this.ways = []
    this.remnants = []
    this.listeners.clear()
  }

  private flying(): Way | null {
    return this.ways.find(way => way.land !== null) ?? null
  }

  private holding(): boolean {
    return this.flying()?.holds === true
  }

  private stopped(way: Way, now: number): void {
    const fade = ms(way.fade)
    if (!this.drying.has(way.remnant.id))
      this.drying.set(way.remnant.id, {
        start: now + ms(way.linger) + fade * 4,
        duration: fade * 2,
        from: 1,
      })
    this.wake()
  }

  private add(frame: Frame, area: Area, origin: Placement, written: number, size: number): Remnant {
    const remnant: Remnant = {
      id: this.nextId++,
      frame,
      area,
      origin,
      size,
      written,
      tail: null,
      opacity: 1,
    }
    this.remnants = [...this.remnants, remnant]
    return remnant
  }

  private wake(): void {
    if (this.frameRequest !== 0) return
    this.frameRequest = requestAnimationFrame(this.tick)
  }

  private readonly tick = (): void => {
    const now = inkNow()
    this.frameRequest = 0
    for (const way of this.ways.slice()) {
      const { remnant } = way
      const linger = ms(way.linger)
      const fade = ms(way.fade)
      if (way.land !== null && !way.held) this.advance(way, now)
      way.passed.push({ t: now, share: remnant.written })
      const at = (time: number): number | null => {
        for (let i = way.passed.length - 1; i >= 0; i -= 1)
          if (way.passed[i]!.t <= time) return way.passed[i]!.share
        return null
      }
      const wet = stillWet(way)
      const to = at(now - linger)
      const gone = Math.max(way.gone, Math.min(wet, at(now - linger - fade * 4) ?? 0))
      const dt = now - way.last
      way.last = now
      remnant.tail =
        to === null
          ? null
          : {
              from: gone,
              to: Math.min(wet, to),
              alpha: 1 - Math.exp(-dt / Math.max(1, fade)),
              gone: [Math.max(0, way.gone - 0.002), gone],
            }
      way.gone = gone
      while (way.passed.length > 2 && way.passed[1]!.t < now - linger - fade * 5) way.passed.shift()
    }
    let gone = false
    for (const remnant of this.remnants) {
      const drying = this.drying.get(remnant.id)
      if (drying === undefined) continue
      const u = Math.min(1, Math.max(0, (now - drying.start) / Math.max(1, drying.duration)))
      remnant.opacity = drying.from * (1 - u) * (1 - u)
      if (u >= 1) {
        this.drying.delete(remnant.id)
        gone = true
      }
    }
    if (gone) {
      this.remnants = this.remnants.filter(
        remnant =>
          this.drying.has(remnant.id) ||
          this.ways.some(way => way.remnant === remnant && way.land !== null),
      )
      this.ways = this.ways.filter(way => this.remnants.includes(way.remnant))
    }
    this.emit()
    if (this.ways.length > 0 || this.drying.size > 0)
      this.frameRequest = requestAnimationFrame(this.tick)
  }

  private advance(way: Way, now: number): void {
    const u = (now - way.start) / Math.max(1, way.duration)
    const { remnant } = way
    remnant.written = Math.max(
      remnant.written,
      way.along === null ? brushTime(Math.min(1, u)) : alongShare(way, u),
    )
    if (u < 1) return
    if (way.reached !== null) {
      remnant.written = 1
      way.held = true
      const reached = way.reached
      way.reached = null
      reached()
      return
    }
    const land = way.land!
    way.land = null
    this.stopped(way, now)
    land(true)
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.remnants)
  }
}
