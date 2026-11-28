import { brushTime } from '../ink/body.ts'

export type FlipToward = 'left' | 'right'

export type FlipPoint = Readonly<{ x: number; y: number }>

export type FlipView = Readonly<{ width: number; height: number; size: number }>

export const FLIP = {
  most: 1500,
  edge: 6,
  approach: { least: 240, most: 400 },
  carry: { designed: 600, least: 552, most: 648 },
  settle: { designed: 320, least: 282, most: 358 },
} as const

export const FLIP_CASUAL = { height: 0.05, approach: 0.12, carry: 0.08, settle: 0.12 } as const

export type FlipPlan = Readonly<{
  toward: FlipToward
  take: FlipPoint
  give: FlipPoint
  approach: number
  carry: number
  settle: number
}>

const clamp = (value: number, least: number, most: number): number =>
  Math.min(most, Math.max(least, value))

export function flipPlan(
  { width, height, size }: FlipView,
  toward: FlipToward,
  figure: FlipPoint | null,
  random?: () => number,
): FlipPlan {
  const loosen = (value: number, spread: number, least: number, most: number): number =>
    random === undefined ? value : clamp(value * (1 + (random() * 2 - 1) * spread), least, most)
  const edge = FLIP.edge * size
  const [from, to] = toward === 'left' ? [width - edge, edge] : [edge, width - edge]
  const level = clamp(figure?.y ?? height * 0.45, height * 0.3, height * 0.6)
  const y = Math.round(
    random === undefined
      ? level
      : clamp(level + (random() * 2 - 1) * FLIP_CASUAL.height * height, height * 0.3, height * 0.6),
  )
  const approachTo = (at: number): number =>
    clamp(
      200 + (figure === null ? width / 2 : Math.hypot(from - figure.x, at - figure.y)) * 0.16,
      FLIP.approach.least,
      FLIP.approach.most,
    )
  const designed = Math.round(approachTo(Math.round(level)))
  const approach = Math.round(
    loosen(approachTo(y), FLIP_CASUAL.approach, FLIP.approach.least, FLIP.approach.most),
  )
  const { carry: c, settle: s } = FLIP
  const carry = Math.round(loosen(c.designed, FLIP_CASUAL.carry, c.least, c.most))
  const settle = Math.round(
    Math.min(
      loosen(s.designed, FLIP_CASUAL.settle, s.least, s.most),
      designed + c.designed + s.designed - approach - carry,
    ),
  )
  return { toward, take: { x: from, y }, give: { x: to, y }, approach, carry, settle }
}

export type FlipPhase = 'approach' | 'hold' | 'carry' | 'settle'

export type FlipState =
  | Readonly<{ phase: 'idle'; cut: boolean }>
  | Readonly<{ phase: FlipPhase; plan: FlipPlan; began: number; carried: number | null }>

export interface FlipHost {
  now(): number
  later(run: () => void, ms: number): () => void
  frame(run: () => void): () => void
  reduced(): boolean
  plan(toward: FlipToward): FlipPlan
}

const RESTING: FlipState = { phase: 'idle', cut: false }

export class FaceFlip {
  private state: FlipState = RESTING
  private readonly listeners = new Set<() => void>()
  private cap: () => void = () => undefined
  private next: () => void = () => undefined
  private serial = 0
  private readonly host: FlipHost

  public constructor(host: FlipHost) {
    this.host = host
  }

  public current = (): FlipState => this.state

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  public turn(toward: FlipToward, swap: () => void): void {
    if (this.state.phase !== 'idle') {
      this.stop()
      return
    }
    if (this.host.reduced()) {
      swap()
      return
    }
    const plan = this.host.plan(toward)
    const serial = ++this.serial
    this.set({ phase: 'approach', plan, began: this.host.now(), carried: null })
    swap()
    if (serial !== this.serial) return
    this.cap = this.host.later(() => this.stop(), FLIP.most)
    this.after(plan.approach, () => this.hold(serial))
  }

  public stop(): void {
    if (this.state.phase === 'idle') return
    this.finish(true)
  }

  private hold(serial: number): void {
    if (serial !== this.serial || this.state.phase !== 'approach') return
    this.set({ ...this.state, phase: 'hold' })
    this.next = this.host.frame(() => this.carry(serial))
  }

  private carry(serial: number): void {
    if (serial !== this.serial || this.state.phase !== 'hold') return
    const { plan } = this.state
    this.set({ ...this.state, phase: 'carry', carried: this.host.now() })
    this.after(plan.carry, () => this.settle(serial))
  }

  private settle(serial: number): void {
    if (serial !== this.serial || this.state.phase !== 'carry') return
    this.set({ ...this.state, phase: 'settle' })
    this.after(this.state.plan.settle, () => {
      if (serial === this.serial) this.finish(false)
    })
  }

  private after(ms: number, run: () => void): void {
    this.next = this.host.later(run, ms)
  }

  private finish(cut: boolean): void {
    this.serial += 1
    this.cap()
    this.next()
    this.cap = () => undefined
    this.next = () => undefined
    this.set({ phase: 'idle', cut })
  }

  private set(next: FlipState): void {
    this.state = next
    for (const listener of Array.from(this.listeners)) listener()
  }
}

export function foldAt(
  state: FlipState,
  now: number,
): Readonly<{ x: number; share: number }> | null {
  if (state.phase === 'idle' || state.carried === null) return null
  const { take, give, carry } = state.plan
  const share =
    state.phase === 'settle'
      ? 1
      : brushTime(Math.min(1, Math.max(0, (now - state.carried) / Math.max(1, carry))))
  return { x: take.x + (give.x - take.x) * share, share }
}
