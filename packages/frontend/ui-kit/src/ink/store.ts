import { FigureBody, type Doing, type FigureMoment } from './body.ts'
import { casual } from './casual.ts'
import { DoingPolicy } from './doing.ts'
import { CANVAS } from './ink.ts'
import { Journeys, type Placement } from './travel.ts'

export const FIGURE_SIZE = 56

const BODY_REACH = FIGURE_SIZE * 0.4

export const SEATLESS_HOLD = 500

export type Phase = 'seated' | 'flying'

export interface SeatBeside {
  readonly left?: number
  readonly right?: number
}

export interface SeatOptions {
  readonly element: HTMLElement
  readonly priority: number
  readonly beside: () => SeatBeside | undefined
}

interface Seat {
  readonly id: string
  readonly centre: Placement
  readonly options: SeatOptions
}

export interface FigureSnapshot {
  readonly phase: Phase
  readonly present: boolean
  readonly size: number
  readonly seat: string | null
  readonly point: Placement | null
  readonly hover: boolean
}

type Listener = () => void

const round = (value: number): number => Math.round(value * 100) / 100

const centreOf = (element: HTMLElement): Placement | null => {
  if (!element.isConnected || element.closest('[inert]') !== null) return null
  const box = element.getBoundingClientRect()
  if (box.width < 1 || box.height < 1) return null
  return { x: round(box.left) + round(box.width) / 2, y: round(box.top) + round(box.height) / 2 }
}

export class FigureStore {
  public readonly body = new FigureBody()
  public readonly journeys = new Journeys(FIGURE_SIZE)
  public onPress: (() => void) | null = null
  private readonly policy: DoingPolicy
  private readonly seats = new Map<string, SeatOptions>()
  private readonly listeners = new Set<Listener>()
  private readonly placed = new Set<(placement: Placement) => void>()
  private snapshot: FigureSnapshot = {
    phase: 'seated',
    present: false,
    size: FIGURE_SIZE,
    seat: null,
    point: null,
    hover: false,
  }
  private placement: Placement = { x: -200, y: -200 }
  private seat: string | null = null
  private going: Placement | null = null
  private pressed = false
  private hovering = false
  private reduced = false
  private appSize = 1
  private lastSeat: Seat | null = null
  private heldSeat: { readonly seat: Seat; readonly timer: ReturnType<typeof setTimeout> } | null =
    null

  public constructor(told: number | null = null) {
    this.policy = new DoingPolicy(this.body, undefined, told)
    this.body.random = () => casual.random()
    this.body.roomLeft = () => this.roomLeftInApp()
    this.body.roomRight = () => this.roomRightInApp()
  }

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  public getSnapshot = (): FigureSnapshot => this.snapshot

  public onPlaced(listener: (placement: Placement) => void): () => void {
    this.placed.add(listener)
    listener(this.placement)
    return () => {
      this.placed.delete(listener)
    }
  }

  public centre(): Placement {
    return this.placement
  }

  public follow(doing: Doing | null, moment: FigureMoment | null): void {
    this.policy.follow(doing, moment)
  }

  public setWaiting(count: number): void {
    this.body.setWaiting(count)
  }

  public setReduced(reduced: boolean): void {
    this.reduced = reduced
    casual.setStill(reduced)
    this.body.setReduced(reduced)
    if (reduced) {
      this.journeys.end(true)
      this.journeys.dryQuickly(true)
    }
  }

  public setAppSize(factor: number): void {
    if (!(factor > 0) || factor === this.appSize) return
    this.appSize = factor
    this.journeys.setOwnSize(this.ownSize())
    if (this.snapshot.present) this.set({ size: this.ownSize() })
  }

  public seatAt(id: string, options: SeatOptions): () => void {
    this.seats.delete(id)
    this.seats.set(id, options)
    this.hostChanged()
    return () => {
      if (this.seats.get(id) === options) this.seats.delete(id)
      queueMicrotask(() => this.hostChanged())
    }
  }

  public hostChanged = (): void => {
    this.keepSeat()
  }

  public pointerOver(at: Placement | null): void {
    if (at === null) {
      this.hover(false)
      return
    }
    const centre = this.centre()
    this.hover(
      this.snapshot.present &&
        Math.hypot(at.x - centre.x, at.y - centre.y) < this.reach(BODY_REACH),
    )
  }

  public pointerDown(): void {
    if (!this.snapshot.present) return
    this.pressed = true
    this.body.setPressed(true)
  }

  public pointerUp(): void {
    const pressed = this.pressed
    this.pressed = false
    if (!pressed) return
    this.body.setPressed(false)
    if (this.seat !== null) this.onPress?.()
  }

  public cancel(): void {
    if (!this.pressed) return
    this.pressed = false
    this.body.setPressed(false)
  }

  public dispose(): void {
    if (this.heldSeat !== null) clearTimeout(this.heldSeat.timer)
    this.heldSeat = null
    this.policy.dispose()
    this.body.dispose()
    this.journeys.dispose()
    this.listeners.clear()
    this.placed.clear()
  }

  private hover(on: boolean): void {
    if (on === this.hovering) return
    this.hovering = on
    this.body.setLooking(on)
    this.set({ hover: on })
  }

  private set(patch: Partial<FigureSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }

  private seatList(): Seat | null {
    let active: Seat | null = null
    for (const [id, options] of this.seats) {
      const centre = centreOf(options.element)
      if (centre === null) continue
      if (active === null || options.priority >= active.options.priority)
        active = { id, centre, options }
    }
    return active
  }

  private activeSeat(): Seat | null {
    return this.seatList() ?? this.heldSeat?.seat ?? null
  }

  private keepLastSeat(): void {
    const seat = this.seatList()
    if (seat !== null) {
      if (this.heldSeat !== null) {
        clearTimeout(this.heldSeat.timer)
        this.heldSeat = null
      }
      this.lastSeat = seat
      return
    }
    const last = this.lastSeat
    if (this.heldSeat !== null || last === null) return
    const timer = setTimeout(() => {
      if (this.heldSeat?.timer !== timer) return
      this.heldSeat = null
      this.lastSeat = null
      this.hostChanged()
    }, SEATLESS_HOLD)
    this.heldSeat = { seat: last, timer }
  }

  private home(): Placement | null {
    return this.activeSeat()?.centre ?? null
  }

  private keepSeat(): void {
    this.keepLastSeat()
    const seat = this.activeSeat()
    const home = this.home()
    if (!this.snapshot.present) {
      if (seat === null || home === null) return
      this.seat = seat.id
      this.place(home)
      this.set({ phase: 'seated', present: true, size: this.ownSize(), seat: seat.id, point: home })
      this.body.writeAnew()
      return
    }
    if (seat === null || home === null) {
      this.leave()
      return
    }
    const phase = this.snapshot.phase
    if (phase === 'seated') {
      if (seat.id !== this.seat) {
        this.fly()
        return
      }
      const here = this.placement
      if (Math.hypot(here.x - home.x, here.y - home.y) > 0.25) {
        this.place(home)
        this.set({ point: home })
      }
    } else {
      const going = this.going
      if (going === null || Math.hypot(going.x - home.x, going.y - home.y) > 0.5) this.fly()
    }
  }

  private leave(): void {
    if (this.going !== null || this.journeys.travelling) {
      this.journeys.end(false)
      this.going = null
    }
    this.seat = null
    this.body.dryAway()
    this.set({ phase: 'seated', present: false, seat: null, point: null })
  }

  private fly(): void {
    const seat = this.activeSeat()
    this.seat = seat?.id ?? null
    const home = this.home()
    if (home === null) return
    this.set({ phase: 'flying', seat: this.seat, point: home })
    this.go(home, () => {
      if (this.snapshot.phase !== 'flying') return
      this.set({ phase: 'seated' })
    })
  }

  private ownSize(): number {
    return FIGURE_SIZE * this.appSize
  }

  private reach(base: number): number {
    return (base * this.snapshot.size) / FIGURE_SIZE
  }

  private go(to: Placement, arrive: () => void): void {
    const from = this.placement
    const near = Math.hypot(to.x - from.x, to.y - from.y) < 1.5
    if (this.reduced || !this.snapshot.present || near) {
      this.going = null
      this.journeys.end(false)
      this.place(to)
      arrive()
      return
    }
    this.going = { x: to.x, y: to.y }
    this.journeys.travel(this.body, from, to, arrived => {
      this.going = null
      if (arrived) arrive()
    })
    this.place(to)
  }

  private place(at: Placement): void {
    this.placement = at
    for (const listener of this.placed) listener(at)
  }

  private roomLeftInApp(): number {
    const room = this.room().left
    const unit = this.snapshot.size / CANVAS
    const edge = this.besideHere()?.left ?? 0
    return Math.min(room, (this.centre().x - this.snapshot.size / 2 - edge) / unit)
  }

  private roomRightInApp(): number {
    const room = this.room().right
    const unit = this.snapshot.size / CANVAS
    const edge = this.besideHere()?.right ?? window.innerWidth
    return Math.min(room, (edge - this.centre().x - this.snapshot.size / 2) / unit)
  }

  private besideHere(): SeatBeside | undefined {
    return this.snapshot.phase === 'seated' ? this.activeSeat()?.options.beside() : undefined
  }

  private room(): { readonly left: number; readonly right: number } {
    const centre = this.centre()
    const { size } = this.snapshot
    const unit = size / CANVAS
    const edge = size / 2 + 8
    return {
      left: (centre.x - edge) / unit,
      right: (window.innerWidth - centre.x - edge) / unit,
    }
  }
}
