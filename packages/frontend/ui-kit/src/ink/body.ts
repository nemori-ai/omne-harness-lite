import { type Point } from '../icons/brush.ts'
import { BRUSH } from './brush-weight.ts'
import {
  BACKGROUND_CASUAL,
  besideColumns,
  COLUMNS,
  COLUMNS_CLEAR,
  COLUMNS_REACH,
  type ColumnSide,
  draw,
  glanceStroke,
  LOOK,
  THINK_CASUAL,
  thinkingRest,
  threadStroke,
} from './doing-ink.ts'
import {
  CENTRE,
  circleStroke,
  closingStroke,
  DEFAULT_HAND,
  eyeStroke,
  numeralStrokes,
  type Hand,
} from './ink.ts'
import { inkNow } from './clock.ts'
import { type InkFrame, type InkMark } from './ink-canvas.ts'
import { designed, freshSeed, vary, type InkStroke } from './writing.ts'

export type Tone = 'ink' | 'amber'
type Role = 'circle' | 'eye' | 'close' | 'wait' | 'loose' | 'think' | 'glance' | 'beside'

export type Doing = 'thinking' | 'looking' | 'writing' | 'background'

export interface FigureMoment {
  readonly kind: 'received' | 'could-not' | 'landed'
  readonly serial: number
}

interface Mark {
  readonly id: number
  readonly role: Role
  readonly stroke: InkStroke
  readonly tone: Tone
  written: number
  opacity: number
  writing?:
    | { readonly start: number; readonly duration: number; readonly curve?: (u: number) => number }
    | undefined
  fading?:
    | {
        readonly start: number
        readonly duration: number
        readonly from: number
        readonly to: number
      }
    | undefined
}

export type Frame = InkFrame
export type FrameMark = InkMark

export const WRITE = {
  circle: 620,
  rewrite: 520,
  mark: 200,
  pressHold: 260,
  numeralPerUnit: 9,
  numeralMin: 150,
  numeralMax: 320,
  formPause: 110,
  working: 1300,
  workingRest: 650,
  dry: 260,
  journey: 1.9,
  leftDry: 2200,
  wayLinger: 60,
  wayFade: 70,
  cutDry: 360,
  wash: 280,
  interrupt: 120,
  fleetingDry: 780,
  noteFirst: 520,
  noteSecondAt: 340,
  noteSecond: 440,
  noteDry: 700,
  noteFoldSecond: 360,
  noteFoldFirst: 460,
} as const

const COULD_NOT = { flick: 240, hold: 160, dry: 520, after: 380, slow: 1.6 } as const

const PRESSED = 0.4

export const TEMPO = { slow: 1 }
export const ms = (value: number): number => value * TEMPO.slow

const TRACE = 0.18

const STROKES_WAITED: ReadonlySet<Role> = new Set<Role>(['circle', 'beside', 'glance', 'think'])
const LANDING = 0.1

function travel(v: number): number {
  const [x1, y1, x2, y2] = [0.25, 0.4, 0.3, 1]
  let t = v
  for (let i = 0; i < 6; i += 1) {
    const x = 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t * t * x2 + t ** 3 - v
    const dx = 3 * (1 - t) ** 2 * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2)
    if (Math.abs(dx) < 1e-6) break
    t = Math.min(1, Math.max(0, t - x / dx))
  }
  return 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3
}

export function brushTime(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  if (u < LANDING) return 0.025 * (u / LANDING)
  return 0.025 + 0.975 * travel((u - LANDING) / (1 - LANDING))
}

const lengthOf = (line: readonly Point[]): number =>
  line.reduce(
    (sum, point, i) =>
      i === 0 ? 0 : sum + Math.hypot(point[0] - line[i - 1]![0], point[1] - line[i - 1]![1]),
    0,
  )

type Listener = (frame: Frame) => void
type Timer = ReturnType<typeof setTimeout>

export class FigureBody {
  private readonly handNow: Hand = DEFAULT_HAND
  private marks: Mark[] = []
  private nextId = 1
  private wash = { value: 0, from: 0, to: 0, start: 0, duration: WRITE.wash as number, even: false }
  private looking = false
  private pressed = false
  private waiting = 0
  private doing: Doing | null = null
  private doingTimers: Timer[] = []
  private readonly retiring = new WeakSet<Mark>()
  private gaze: Point | null = null
  private restQueue: { readonly timer: Timer; readonly act: () => void }[] = []
  private restUntil = 0
  private away = false
  private timers: Timer[] = []
  private readonly listeners = new Set<Listener>()
  private frameRequest = 0
  private reduced: boolean

  public random: () => number = Math.random
  public roomLeft: () => number = () => Infinity
  public roomRight: () => number = () => Infinity

  public constructor(reduced = false) {
    this.reduced = reduced
    this.marks.push(this.mark('circle', circleStroke(this.handNow, freshSeed()), 'ink', 1))
  }

  public get hand(): Hand {
    return this.handNow
  }

  public setReduced(reduced: boolean): void {
    this.reduced = reduced
    const doing = this.doing
    if (doing !== null) {
      this.stopDoing(false)
      this.doing = null
      this.perform(doing)
    }
    if (!reduced) return
    const queued = this.restQueue
    this.restQueue = []
    for (const { timer, act } of queued) {
      clearTimeout(timer)
      act()
    }
    for (const mark of this.marks) {
      if (mark.writing) {
        mark.written = 1
        mark.writing = undefined
      }
      if (mark.fading) {
        mark.opacity = mark.fading.to
        mark.fading = undefined
      }
    }
    this.marks = this.marks.filter(mark => mark.opacity > 0)
    this.wash.value = this.wash.to
    this.emit()
  }

  public setLooking(on: boolean): void {
    if (on === this.looking) return
    this.looking = on
    if (on && !this.away) this.write('eye', eyeStroke(freshSeed()), 'ink', WRITE.mark)
    else this.dry('eye')
  }

  public pressOnce(): void {
    this.write('close', closingStroke(this.handNow, freshSeed()), 'ink', WRITE.mark * 1.4)
    this.later(WRITE.mark * 1.4 + WRITE.pressHold, () => {
      this.dry('close', WRITE.dry * 0.6)
      this.washTo(this.pressed ? PRESSED : 0)
    })
  }

  public setWaiting(count: number): void {
    const next = Math.max(0, Math.round(count))
    if (next === this.waiting) return
    this.waiting = next
    this.dry('wait')
    if (next > 0) this.writeNumeral(this.reduced ? 0 : WRITE.dry * 0.4)
  }

  private writeNumeral(after: number): void {
    if (this.away) return
    const count = this.waiting
    let at = after
    for (const stroke of numeralStrokes(count, this.handNow, freshSeed())) {
      const duration = Math.min(
        WRITE.numeralMax,
        Math.max(WRITE.numeralMin, lengthOf(stroke.line) * WRITE.numeralPerUnit),
      )
      this.later(at, () => {
        if (this.waiting === count) this.write('wait', stroke, 'amber', duration)
      })
      at += duration + WRITE.formPause * 0.5
    }
  }

  public setPressed(on: boolean): void {
    this.pressed = on
    this.washTo(on ? PRESSED : 0)
  }

  public absorb(): void {
    this.setLooking(false)
    this.washTo(0.9)
    this.later(WRITE.rewrite * 0.7, () => this.washTo(0))
    this.rewrite()
  }

  public writeAnew(
    circle: InkStroke = circleStroke(this.handNow, freshSeed()),
    duration: number = WRITE.circle,
  ): void {
    this.away = false
    this.cancelForm()
    this.cancelRest()
    this.marks = []
    this.looking = false
    this.wash = { value: 0, from: 0, to: 0, start: 0, duration: WRITE.wash, even: false }
    this.writeRest(0, duration, { circle })
    if (this.waiting > 0) this.writeNumeral(duration * 0.8)
  }

  public leave(): Frame {
    const left = this.frame()
    this.cancelForm()
    this.cancelRest()
    this.marks = []
    this.looking = false
    this.wash = { value: 0, from: 0, to: 0, start: 0, duration: WRITE.wash, even: false }
    this.away = true
    this.emit()
    return left
  }

  public arrive(circle: InkStroke, duration: number = WRITE.circle): void {
    this.writeAnew(circle, duration)
  }

  public circleEnd(): { readonly point: Point; readonly heading: Point } | null {
    const mark = [...this.marks]
      .reverse()
      .find(
        candidate =>
          candidate.role === 'circle' && candidate.opacity > 0.3 && candidate.written > 0.05,
      )
    if (mark === undefined) return null
    const line = mark.stroke.line
    const at = Math.max(1, Math.min(line.length - 1, Math.round(mark.written * (line.length - 1))))
    const [a, b] = [line[at - 1]!, line[at]!]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return { point: b, heading: [(b[0] - a[0]) / length, (b[1] - a[1]) / length] }
  }

  public dryAway(duration: number = WRITE.dry): void {
    this.looking = false
    this.washTo(0)
    for (const mark of this.marks) this.fade(mark, duration, 0)
  }

  public rewrite(duration: number = WRITE.rewrite): number {
    if (this.away) return 0
    const old = this.restMarks()
    for (const mark of old) {
      this.retiring.add(mark)
      this.fade(mark, WRITE.dry * 0.5, TRACE)
    }
    const end = this.writeRest(0, duration)
    this.later(end, () => {
      for (const mark of old) this.fade(mark, WRITE.dry, 0)
    })
    return end
  }

  public setThinking(on: boolean): void {
    if (on) this.perform('thinking')
    else if (this.doing === 'thinking') this.perform(null)
  }

  public get doingNow(): Doing | null {
    return this.doing
  }

  public strokeLeft(): number {
    const now = inkNow()
    let left = 0
    for (const mark of this.marks) {
      if (mark.writing !== undefined && STROKES_WAITED.has(mark.role))
        left = Math.max(left, mark.writing.start + mark.writing.duration - now)
    }
    return left
  }

  public perform(next: Doing | null): void {
    if (next === this.doing) return
    this.stopDoing(true)
    this.doing = next
    if (next === 'thinking')
      this.doingLater(this.reduced ? 0 : draw(this.random, ...THINK_CASUAL.lead), () =>
        this.thinkRound(),
      )
    else if (next === 'background')
      this.doingLater(this.reduced ? 0 : draw(this.random, ...BACKGROUND_CASUAL.lead), () =>
        this.thinkRound(),
      )
    else if (next === 'looking') {
      this.gaze = null
      this.lookRound(0)
    } else if (next === 'writing') this.doingLater(this.reduced ? 0 : 120, () => this.writeRound())
  }

  public moment(kind: FigureMoment['kind']): void {
    if (kind === 'received') {
      if (!this.away) this.absorb()
    } else if (kind === 'landed') {
      if (!this.away) this.pressOnce()
    } else this.couldNot()
  }

  private stopDoing(rise: boolean): void {
    for (const timer of this.doingTimers) clearTimeout(timer)
    this.doingTimers = []
    const was = this.doing
    if (was === 'thinking' || was === 'background' || was === 'looking') {
      this.dry('think', THINK_CASUAL.rise)
      if (rise) {
        for (const mark of this.restMarks()) {
          if (
            !this.retiring.has(mark) &&
            (mark.opacity < 0.999 || (mark.fading !== undefined && mark.fading.to < 1))
          )
            this.fade(mark, THINK_CASUAL.rise, 1)
        }
      }
    }
    if (was === 'looking') this.dry('glance', LOOK.dry)
    else if (was === 'writing') this.dry('beside', COLUMNS.dry)
  }

  private doingLater(delay: number, act: () => void): void {
    if (delay <= 0) {
      act()
      return
    }
    this.doingTimers.push(setTimeout(act, ms(delay)))
  }

  private notNow(): number {
    if (this.away) return 400
    const writing = (this.restUntil - inkNow()) / Math.max(1e-6, TEMPO.slow)
    return writing > 30 ? writing + 80 : 0
  }

  private besideSide(): ColumnSide {
    let [left, right] = [Infinity, -Infinity]
    for (const mark of this.restMarks())
      for (const [x] of mark.stroke.line) {
        left = Math.min(left, x - mark.stroke.weight * 1.05)
        right = Math.max(right, x + mark.stroke.weight * 1.05)
      }
    if (!Number.isFinite(left))
      [left, right] = [
        CENTRE[0] - this.handNow.radius - BRUSH,
        CENTRE[0] + this.handNow.radius + BRUSH,
      ]
    const roomLeft = this.roomLeft() + left - COLUMNS_CLEAR
    const roomRight = this.roomRight() + (CENTRE[0] * 2 - right) - COLUMNS_CLEAR
    if (roomLeft >= COLUMNS_REACH) return { side: 'left', at: left }
    if (roomRight >= COLUMNS_REACH) return { side: 'right', at: right }
    return roomLeft >= roomRight
      ? { side: 'left', at: left, room: roomLeft }
      : { side: 'right', at: right, room: roomRight }
  }

  private thinkRound(): void {
    if (this.doing !== 'thinking' && this.doing !== 'looking' && this.doing !== 'background') return
    const wait = this.notNow()
    if (wait > 0) {
      this.doingLater(wait, () => this.thinkRound())
      return
    }
    if (this.reduced) {
      for (const mark of this.restMarks()) this.fade(mark, 0, THINK_CASUAL.still)
      return
    }
    const random = this.random
    const took = this.rewrite(WRITE.working * draw(random, ...THINK_CASUAL.write))
    const rest =
      this.doing === 'background'
        ? draw(random, ...BACKGROUND_CASUAL.rest)
        : thinkingRest(WRITE.workingRest, random)
    this.doingLater(Math.max(WRITE.working * 0.5, took) + rest, () => this.thinkRound())
  }

  private lookRound(n: number): void {
    if (this.doing !== 'looking') return
    const wait = this.notNow()
    if (wait > 0) {
      this.doingLater(wait, () => this.lookRound(n))
      return
    }
    const random = this.random
    const hold = this.reduced ? 0 : draw(random, ...LOOK.hold)
    if (this.looking) {
      this.doingLater(Math.max(400, hold), () => this.lookRound(n))
      return
    }
    const angle = random() * Math.PI * 2
    const far = n === 0 ? draw(random, ...LOOK.first) : draw(random, ...LOOK.reach)
    const at: Point = this.reduced
      ? CENTRE
      : [CENTRE[0] + Math.cos(angle) * far, CENTRE[1] + Math.sin(angle) * far * 0.85]
    const from = this.gaze
    this.gaze = at
    this.dry('glance', LOOK.dry)
    let lead = 0
    if (from !== null && !this.reduced && random() < LOOK.thread) {
      lead = draw(random, ...LOOK.threadMs)
      const thread = this.write('glance', threadStroke(from, at, freshSeed(), random), 'ink', lead)
      this.doingLater(lead + 60, () => this.fade(thread, LOOK.threadDry, 0))
    }
    this.doingLater(this.reduced ? 0 : Math.max(LOOK.beat, lead * 0.6), () => {
      if (this.doing === 'looking' && !this.looking)
        this.write('glance', glanceStroke(at, freshSeed()), 'ink', LOOK.dot)
    })
    if (!this.reduced) this.doingLater(lead + hold, () => this.lookRound(n + 1))
  }

  private writeRound(): void {
    if (this.doing !== 'writing') return
    const wait = this.notNow()
    if (wait > 0) {
      this.doingLater(wait, () => this.writeRound())
      return
    }
    const random = this.random
    const { strokes, end } = besideColumns(freshSeed(), random, this.besideSide())
    const written: Mark[] = []
    for (const { stroke, at, took, mark } of strokes) {
      this.doingLater(this.reduced ? 0 : at, () => {
        if (this.doing === 'writing') written[mark] = this.write('beside', stroke, 'ink', took)
      })
    }
    if (this.reduced) return
    const hold = end + draw(random, ...COLUMNS.hold)
    strokes.forEach((_, i) =>
      this.doingLater(hold + i * COLUMNS.stagger, () => {
        const column = written[i]
        if (column !== undefined) this.fade(column, COLUMNS.dry, 0)
      }),
    )
    this.doingLater(hold + COLUMNS.dry * 0.7 + draw(random, ...COLUMNS.next), () =>
      this.writeRound(),
    )
  }

  public couldNot(): void {
    if (this.away) return
    this.cancelRest()
    for (const mark of this.marks) if (mark.role !== 'wait') this.fade(mark, COULD_NOT.dry, 0)
    const { radius, gapAt, gap, weight } = this.handNow
    const from = gapAt - gap / 2 + 4
    const line = [0, 0.5, 1].map(k => {
      const angle = ((from + k * 20) * Math.PI) / 180
      const r = radius + k * 9
      return [CENTRE[0] + r * Math.cos(angle), CENTRE[1] + r * Math.sin(angle)] as const
    })
    const flick = this.write(
      'loose',
      vary(designed(line, weight * 0.5, { dry: 0.95, ink: 0.7 }), freshSeed(), {
        freedom: 0.8,
        endings: { taper: 1 },
      }),
      'ink',
      COULD_NOT.flick,
    )
    this.later(COULD_NOT.flick + COULD_NOT.hold, () => this.fade(flick, WRITE.fleetingDry, 0))
    this.writeRest(COULD_NOT.after, WRITE.circle * COULD_NOT.slow)
  }

  private restMarks(): Mark[] {
    return this.marks.filter(
      mark => mark.role === 'circle' && (mark.fading === undefined || mark.fading.to > 0),
    )
  }

  private writeRest(
    after = 0,
    duration: number = WRITE.circle,
    { circle }: { readonly circle?: InkStroke } = {},
  ): number {
    const stroke = circle ?? circleStroke(this.handNow, freshSeed())
    this.laterRest(after, () => this.write('circle', stroke, 'ink', duration))
    const end = after + duration
    this.restUntil = inkNow() + (this.reduced ? 0 : ms(end))
    return end
  }

  private laterRest(delay: number, act: () => void): void {
    if (this.reduced || delay <= 0) {
      act()
      return
    }
    const entry = {
      timer: setTimeout(() => {
        this.restQueue = this.restQueue.filter(other => other !== entry)
        act()
      }, ms(delay)),
      act,
    }
    this.restQueue.push(entry)
  }

  private cancelRest(): void {
    for (const { timer } of this.restQueue) clearTimeout(timer)
    this.restQueue = []
  }

  private mark(role: Role, stroke: InkStroke, tone: Tone, written = 0): Mark {
    return { id: this.nextId++, role, stroke, tone, written, opacity: 1 }
  }

  private write(
    role: Role,
    stroke: InkStroke,
    tone: Tone,
    duration: number,
    curve?: (u: number) => number,
  ): Mark {
    const mark = this.mark(role, stroke, tone, this.reduced ? 1 : 0)
    if (!this.reduced)
      mark.writing = {
        start: inkNow(),
        duration: ms(duration),
        ...(curve === undefined ? {} : { curve }),
      }
    this.marks.push(mark)
    this.wake()
    return mark
  }

  private dry(role: Role, duration: number = WRITE.dry): void {
    for (const mark of this.marks)
      if (mark.role === role && (mark.fading === undefined || mark.fading.to > 0))
        this.fade(mark, duration, 0)
  }

  private fade(mark: Mark, duration: number, to: number): void {
    if (this.reduced) {
      mark.opacity = to
      mark.fading = undefined
      if (to <= 0) this.marks = this.marks.filter(other => other !== mark)
      this.emit()
      return
    }
    mark.fading = { start: inkNow(), duration: ms(duration), from: mark.opacity, to }
    this.wake()
  }

  private washTo(value: number, duration: number = WRITE.wash, even = false): void {
    this.wash = {
      value: this.wash.value,
      from: this.wash.value,
      to: value,
      start: inkNow(),
      duration,
      even,
    }
    if (this.reduced) {
      this.wash.value = value
      this.emit()
      return
    }
    this.wake()
  }

  private later(delay: number, act: () => void): void {
    if (this.reduced) {
      act()
      return
    }
    this.timers.push(setTimeout(act, ms(delay)))
  }

  private cancelForm(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers = []
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.frame())
    return () => {
      this.listeners.delete(listener)
    }
  }

  public dispose(): void {
    cancelAnimationFrame(this.frameRequest)
    this.frameRequest = 0
    for (const timer of this.doingTimers) clearTimeout(timer)
    this.doingTimers = []
    this.doing = null
    this.cancelForm()
    this.cancelRest()
    this.listeners.clear()
  }

  public frame(): Frame {
    return {
      marks: this.marks.map(mark => ({
        key: mark.id,
        stroke: mark.stroke,
        written: mark.written,
        opacity: mark.opacity,
        tone: mark.tone,
      })),
      wash: this.wash.value,
    }
  }

  private wake(): void {
    if (this.reduced) {
      this.emit()
      return
    }
    if (this.frameRequest !== 0) return
    this.frameRequest = requestAnimationFrame(this.tick)
  }

  private readonly tick = (): void => {
    const now = inkNow()
    this.frameRequest = 0
    let moving = false
    for (const mark of this.marks) {
      if (mark.writing) {
        const u = (now - mark.writing.start) / mark.writing.duration
        if (u >= 1) {
          mark.written = 1
          mark.writing = undefined
        } else {
          mark.written = (mark.writing.curve ?? brushTime)(u)
          moving = true
        }
      }
      if (mark.fading) {
        const u = Math.min(1, Math.max(0, (now - mark.fading.start) / mark.fading.duration))
        mark.opacity = mark.fading.from + (mark.fading.to - mark.fading.from) * u
        if (u >= 1) mark.fading = undefined
        else moving = true
      }
    }
    this.marks = this.marks.filter(mark => mark.opacity > 0.001 || mark.fading !== undefined)
    const w = Math.min(1, Math.max(0, (now - this.wash.start) / ms(this.wash.duration)))
    this.wash.value =
      this.wash.from +
      (this.wash.to - this.wash.from) * (this.wash.even ? w : 1 - (1 - w) * (1 - w))
    if (w < 1) moving = true
    this.emit()
    if (moving) this.frameRequest = requestAnimationFrame(this.tick)
  }

  private emit(): void {
    if (this.listeners.size === 0) return
    const frame = this.frame()
    for (const listener of this.listeners) listener(frame)
  }
}
