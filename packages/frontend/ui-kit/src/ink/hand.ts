import { inkNow } from './clock.ts'
import { type Placement } from './travel.ts'

export const LIFT_DISTANCE = 4

export const FOLLOW = 1100

const REST = { off: 0.05, speed: 1 } as const

export interface HandPoint {
  readonly client: Placement
  readonly screen: Placement
  readonly meta: boolean
  readonly shift: boolean
}

export interface FigureHand extends HandPoint {
  readonly kind: 'lift' | 'move' | 'drop' | 'escape'
}

export interface PointerAt extends HandPoint {
  readonly id: number
  readonly buttons: number
}

export interface Spring {
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
}

export const travelled = (from: Placement, to: Placement): boolean =>
  Math.hypot(to.x - from.x, to.y - from.y) > LIFT_DISTANCE

function axis(at: number, speed: number, target: number, t: number): readonly [number, number] {
  const omega = Math.sqrt(FOLLOW)
  const off = at - target
  const lead = speed + omega * off
  const decay = Math.exp(-omega * t)
  return [target + (off + lead * t) * decay, (speed - omega * lead * t) * decay]
}

export function follow(spring: Spring, target: Placement, t: number): Spring {
  const [x, vx] = axis(spring.x, spring.vx, target.x, t)
  const [y, vy] = axis(spring.y, spring.vy, target.y, t)
  return { x, y, vx, vy }
}

const resting = (spring: Spring, target: Placement): boolean =>
  Math.hypot(spring.x - target.x, spring.y - target.y) < REST.off &&
  Math.hypot(spring.vx, spring.vy) < REST.speed

export interface HandFigure {
  centre(): Placement
  drawn(): boolean
  reduced(): boolean
  tell(hand: FigureHand): boolean
  lifted(): void
  carried(at: Placement): void
  ended(at: Placement, taken: boolean): void
  abandoned(): void
}

interface Held {
  readonly id: number
  at: HandPoint
  spring: Spring
  moved: boolean
  last: number
}

type State =
  | { readonly kind: 'none' }
  | { readonly kind: 'pressed'; readonly id: number; readonly from: Placement }
  | ({ readonly kind: 'held' } & Held)

export type Ended = 'press' | 'held' | 'other'

type Way = 'drop' | 'escape'

const pointOf = ({ client, screen, meta, shift }: HandPoint): HandPoint => ({
  client,
  screen,
  meta,
  shift,
})

export class Hand {
  private state: State = { kind: 'none' }
  private frameRequest = 0
  private readonly figure: HandFigure

  public constructor(figure: HandFigure) {
    this.figure = figure
  }

  public get holding(): boolean {
    return this.state.kind === 'held'
  }

  public get point(): Placement | null {
    return this.state.kind === 'held' ? this.state.at.client : null
  }

  public down(at: PointerAt): void {
    this.stop()
    this.state = { kind: 'pressed', id: at.id, from: at.client }
  }

  public move(at: PointerAt): void {
    const state = this.state
    if (state.kind === 'none' || state.id !== at.id) return
    if ((at.buttons & 1) === 0) {
      if (state.kind === 'held') this.release('drop', at)
      else {
        this.state = { kind: 'none' }
        this.figure.abandoned()
      }
      return
    }
    if (state.kind === 'pressed') {
      if (travelled(state.from, at.client)) this.lift(at)
      return
    }
    state.at = pointOf(at)
    state.moved = true
    if (this.figure.reduced()) this.carry(state)
    if (this.frameRequest === 0) state.last = inkNow()
    this.wake()
  }

  public up(at: PointerAt): Ended {
    return this.end(at.id, 'drop', at)
  }

  public escape(meta: boolean, shift: boolean): boolean {
    const state = this.state
    if (state.kind !== 'held') return false
    this.release('escape', { ...state.at, meta, shift })
    return true
  }

  public cancel(id: number | undefined): Ended {
    return this.end(id, 'escape', null)
  }

  public redrawn(): void {
    const state = this.state
    if (state.kind !== 'held') return
    this.carry(state)
  }

  public stop(): void {
    this.state = { kind: 'none' }
    cancelAnimationFrame(this.frameRequest)
    this.frameRequest = 0
  }

  private end(id: number | undefined, kind: Way, at: HandPoint | null): Ended {
    const state = this.state
    if (state.kind === 'none') return 'press'
    if (id !== undefined && state.id !== id) return 'other'
    if (state.kind === 'pressed') {
      this.state = { kind: 'none' }
      return 'press'
    }
    this.release(kind, at ?? state.at)
    return 'held'
  }

  private lift(at: PointerAt): void {
    const centre = this.figure.centre()
    const held: State = {
      kind: 'held',
      id: at.id,
      at: pointOf(at),
      spring: { x: centre.x, y: centre.y, vx: 0, vy: 0 },
      moved: false,
      last: inkNow(),
    }
    this.state = held
    this.figure.lifted()
    this.figure.tell({ kind: 'lift', ...held.at })
    if (this.figure.reduced()) this.carry(held)
    else this.wake()
  }

  private carry(held: Held): void {
    const { x, y } = held.at.client
    held.spring = { x, y, vx: 0, vy: 0 }
    if (this.figure.drawn()) this.figure.carried({ x, y })
  }

  private release(kind: Way, at: HandPoint): void {
    this.stop()
    const point = pointOf(at)
    this.figure.ended(point.client, this.figure.tell({ kind, ...point }))
  }

  private wake(): void {
    if (this.frameRequest !== 0) return
    this.frameRequest = requestAnimationFrame(this.tick)
  }

  private readonly tick = (): void => {
    this.frameRequest = 0
    const state = this.state
    if (state.kind !== 'held') return
    const now = inkNow()
    const t = Math.max(0, now - state.last) / 1000
    state.last = now
    if (state.moved) {
      state.moved = false
      this.figure.tell({ kind: 'move', ...state.at })
      if (this.state !== state) return
    }
    if (!this.figure.drawn() || this.figure.reduced()) return
    const target = state.at.client
    const next = follow(state.spring, target, t)
    if (resting(next, target)) this.carry(state)
    else {
      state.spring = next
      this.figure.carried({ x: next.x, y: next.y })
      this.wake()
    }
  }
}
