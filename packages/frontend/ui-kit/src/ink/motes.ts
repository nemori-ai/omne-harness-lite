import { type Point } from '../icons/brush.ts'
import { brushTime, ms, WRITE } from './body.ts'
import { casual } from './casual.ts'
import { inkNow } from './clock.ts'
import { BACKGROUND_CASUAL, LOOK } from './doing-ink.ts'
import { CENTRE, dab, EYE_WEIGHT, eyeStroke } from './ink.ts'
import { type InkFrame } from './ink-canvas.ts'
import { designed, freshSeed, type InkStroke } from './writing.ts'

export const MOTES = {
  count: 5,
  radius: 18,
  angles: [-15, 50, 118, 190, 258],
  ink: [1, 0.93, 0.85, 0.77, 0.7],
  wet: [0.95, 0.82, 0.68, 0.54, 0.4],
  press: [1.2, 1.08, 0.96, 0.84, 0.72],
  reach: [2.6, 2.2, 1.9, 1.6, 1.3],
  wander: 1.1,
  dab: LOOK.dot,
  scatter: [90, 170],
  dry: WRITE.dry,
  lift: WRITE.interrupt,
  rest: [900, 2600],
  backgroundRest: BACKGROUND_CASUAL.rest,
} as const

export type MotesDoing = 'idle' | 'working' | 'background'

const EAR = -1
const SLOTS = MOTES.angles.map((_, slot) => slot)
const middleOf = (range: readonly [number, number]): number => (range[0] + range[1]) / 2
const pause = (range: readonly [number, number]): number =>
  casual.between(range[0], range[1], middleOf(range))

interface Mote {
  readonly id: number
  readonly slot: number
  readonly stroke: InkStroke
  written: number
  opacity: number
  writing?: { readonly start: number; readonly duration: number } | undefined
  fading?: { readonly start: number; readonly duration: number; readonly from: number } | undefined
}

function moteStroke(slot: number): InkStroke {
  const seed = casual.still() ? 0 : freshSeed()
  if (slot === EAR) return eyeStroke(seed)
  const angle = (MOTES.angles[slot]! * Math.PI) / 180
  const stray = (): number => casual.between(-MOTES.wander, MOTES.wander, 0)
  const at: Point = [
    CENTRE[0] + MOTES.radius * Math.cos(angle) + stray(),
    CENTRE[1] + MOTES.radius * Math.sin(angle) + stray(),
  ]
  const reach = MOTES.reach[slot]! * casual.around(1, 0.12)
  const along = angle + Math.PI / 2 + casual.between(-0.3, 0.3, 0)
  const line: Point[] = [
    [at[0] - Math.cos(along) * reach, at[1] - Math.sin(along) * reach],
    [at[0] + Math.cos(along) * reach, at[1] + Math.sin(along) * reach],
  ]
  const heavy = MOTES.press[slot]!
  return {
    ...designed(line, EYE_WEIGHT, {
      ink: MOTES.ink[slot]!,
      press: t => heavy * dab(t),
      wet: MOTES.wet[slot]!,
    }),
    seed,
    ending: seed === 0 ? 'plain' : 'stop',
  }
}

type Listener = (frame: InkFrame) => void
type Timer = ReturnType<typeof setTimeout>

export class MotesBody {
  private marks: Mote[] = []
  private nextId = 1
  private turn = 0
  private doing: MotesDoing = 'idle'
  private listening = false
  private carried = false
  private reduced: boolean
  private frameRequest = 0
  private timers: Timer[] = []
  private readonly listeners = new Set<Listener>()

  public constructor(reduced = false) {
    this.reduced = reduced
    this.scatter()
  }

  public setReduced(reduced: boolean): void {
    if (this.reduced === reduced) return
    this.reduced = reduced
    if (!reduced) return
    this.halt()
    cancelAnimationFrame(this.frameRequest)
    this.frameRequest = 0
    this.marks = this.marks.filter(mark => mark.fading === undefined)
    for (const mark of this.marks) {
      mark.written = 1
      mark.writing = undefined
    }
    this.scatter()
  }

  public setDoing(doing: MotesDoing): void {
    if (this.doing === doing) return
    this.doing = doing
    this.scatter()
  }

  public setListening(on: boolean): void {
    if (this.listening === on) return
    this.listening = on
    if (!on) this.dry(mark => mark.slot === EAR, MOTES.dry)
    else if (!this.carried) this.dab(EAR)
  }

  public setCarried(on: boolean): void {
    if (this.carried === on) return
    this.carried = on
    this.halt()
    if (on) this.dry(mark => mark.slot !== 0, MOTES.lift)
    this.scatter()
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.frame())
    return () => {
      this.listeners.delete(listener)
    }
  }

  public dispose(): void {
    this.halt()
    cancelAnimationFrame(this.frameRequest)
    this.frameRequest = 0
    this.listeners.clear()
  }

  public frame(): InkFrame {
    return {
      marks: this.marks
        .toSorted((left, right) => left.slot - right.slot || left.id - right.id)
        .map(mark => ({
          key: mark.id,
          stroke: mark.stroke,
          written: mark.written,
          opacity: mark.opacity,
          tone: 'ink' as const,
        })),
      wash: 0,
    }
  }

  private wanted(): readonly number[] {
    if (this.carried) return [0]
    return this.listening ? [...SLOTS, EAR] : SLOTS
  }

  private standing(slot: number): boolean {
    return this.marks.some(mark => mark.slot === slot && mark.fading === undefined)
  }

  private scatter(): void {
    this.halt()
    let delay = 0
    for (const slot of this.wanted()) {
      if (this.standing(slot)) continue
      this.later(delay, () => this.dab(slot))
      delay += pause(MOTES.scatter)
    }
    if (this.doing === 'idle' || this.carried || this.reduced) return
    const rest = this.doing === 'background' ? MOTES.backgroundRest : MOTES.rest
    this.later(delay + pause(rest), () => this.round())
  }

  private round(): void {
    const slot = this.turn % MOTES.count
    this.turn += 1
    this.dry(mark => mark.slot === slot, MOTES.dry)
    this.dab(slot)
    const rest = this.doing === 'background' ? MOTES.backgroundRest : MOTES.rest
    this.later(pause(rest), () => this.round())
  }

  private dab(slot: number): void {
    const mark: Mote = {
      id: this.nextId++,
      slot,
      stroke: moteStroke(slot),
      written: this.reduced ? 1 : 0,
      opacity: 1,
    }
    if (!this.reduced) mark.writing = { start: inkNow(), duration: ms(MOTES.dab) }
    this.marks.push(mark)
    this.wake()
  }

  private dry(which: (mark: Mote) => boolean, duration: number): void {
    if (this.reduced) {
      this.marks = this.marks.filter(mark => !which(mark))
      this.emit()
      return
    }
    for (const mark of this.marks)
      if (which(mark) && mark.fading === undefined)
        mark.fading = { start: inkNow(), duration: ms(duration), from: mark.opacity }
    this.wake()
  }

  private later(delay: number, act: () => void): void {
    if (this.reduced || delay <= 0) {
      act()
      return
    }
    const timer: Timer = setTimeout(() => {
      this.timers = this.timers.filter(held => held !== timer)
      act()
    }, ms(delay))
    this.timers.push(timer)
  }

  private halt(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers = []
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
      if (mark.writing !== undefined) {
        const u = (now - mark.writing.start) / mark.writing.duration
        mark.written = u >= 1 ? 1 : brushTime(u)
        if (u >= 1) mark.writing = undefined
        else moving = true
      }
      if (mark.fading !== undefined) {
        const u = Math.min(1, Math.max(0, (now - mark.fading.start) / mark.fading.duration))
        mark.opacity = mark.fading.from * (1 - u)
        moving = true
      }
    }
    this.marks = this.marks.filter(mark => mark.fading === undefined || mark.opacity > 0.001)
    this.emit()
    if (moving) this.frameRequest = requestAnimationFrame(this.tick)
  }

  private emit(): void {
    if (this.listeners.size === 0) return
    const frame = this.frame()
    for (const listener of this.listeners) listener(frame)
  }
}
