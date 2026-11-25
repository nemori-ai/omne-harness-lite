import { FigureBody, type Doing, type FigureMoment } from './body.ts'
import { casual } from './casual.ts'
import { DoingPolicy } from './doing.ts'
import { Hand, type FigureHand, type PointerAt } from './hand.ts'
import { CANVAS } from './ink.ts'
import { Journeys, type Placement, type Timed } from './travel.ts'

export const FIGURE_SIZE = 56

const BODY_REACH = FIGURE_SIZE * 0.4

export const SEATLESS_HOLD = 500
const NEAR = 1.5

export type Phase = 'seated' | 'flying' | 'held' | 'dropped'

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
  readonly away: boolean
}

export type TurnLeg = Readonly<{ to: Placement; ms: number; hold?: boolean; carry?: boolean }>

export type TurnPlan = Readonly<{ legs: readonly TurnLeg[]; settle: number }>

interface Turning {
  readonly legs: readonly TurnLeg[]
  readonly settle: number
  readonly ticket: number
  index: number
  go: number | null
  holding: boolean
  settling: boolean
}

type Listener = () => void

const inHand = (phase: Phase): boolean => phase === 'held' || phase === 'dropped'

const samePoint = (a: Placement | null, b: Placement | null): boolean =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y)

const round = (value: number): number => Math.round(value * 100) / 100

const wayOf = (leg: TurnLeg, from: Placement, start: number | undefined): Timed => ({
  ms: leg.ms,
  ...(start !== undefined && { start }),
  ...(leg.hold === true && { hold: true }),
  ...(leg.carry === true && { along: { from: from.x, to: leg.to.x } }),
})

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
  public onHand: ((hand: FigureHand) => boolean | void) | null = null
  public liftable = false
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
    away: false,
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
  private turning: Turning | null = null
  private turns = 0
  private away = false
  private readonly hand = new Hand({
    centre: () => this.placement,
    drawn: () => !this.away,
    reduced: () => this.reduced,
    tell: hand => this.onHand?.(hand) === true,
    lifted: () => this.lifted(),
    carried: at => this.place(at),
    ended: (at, taken) => this.ended(at, taken),
    abandoned: () => this.unpress(),
  })

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
    if (reduced && this.turning !== null) this.placeOnSeat()
    if (reduced) {
      this.journeys.end(true)
      this.journeys.dryQuickly(true)
    }
  }

  public turn(plan: TurnPlan): void {
    if (!this.snapshot.present || inHand(this.snapshot.phase)) return
    if (this.turning !== null || this.reduced) this.placeOnSeat()
    if (this.reduced) return
    this.turns += 1
    this.turning = {
      legs: plan.legs,
      settle: plan.settle,
      ticket: this.turns,
      index: 0,
      go: null,
      holding: false,
      settling: false,
    }
    this.set({ phase: 'flying' })
    this.nextLeg(this.turns)
  }

  public turnGo(start: number): void {
    const turning = this.turning
    if (turning === null) return
    if (!turning.holding) {
      turning.go = start
      return
    }
    turning.holding = false
    this.nextLeg(turning.ticket, start)
  }

  public endTurn(): void {
    if (this.turning !== null) this.placeOnSeat()
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

  private nextLeg(ticket: number, start?: number): void {
    const turning = this.turning
    if (turning === null || turning.ticket !== ticket) return
    const leg = turning.legs[turning.index]
    if (leg === undefined) {
      turning.settling = true
      if (!this.fly(turning.settle)) {
        this.turning = null
        this.keepSeat()
      }
      return
    }
    turning.index += 1
    const before = turning.legs[turning.index - 2]
    const from = before === undefined ? this.placement : before.to
    this.go(leg.to, () => this.legDone(turning, leg), wayOf(leg, from, start))
  }

  private legDone(turning: Turning, leg: TurnLeg): void {
    if (this.turning !== turning) return
    if (leg.hold !== true) {
      this.nextLeg(turning.ticket)
      return
    }
    const go = turning.go
    turning.go = null
    if (go === null) turning.holding = true
    else this.nextLeg(turning.ticket, go)
  }

  private placeOnSeat(): void {
    this.halt()
    this.journeys.dryQuickly(this.reduced)
    const seat = this.activeSeat()
    this.seat = seat?.id ?? null
    const home = this.home()
    if (home === null) {
      this.leave()
      return
    }
    this.place(home)
    this.set({ phase: 'seated', seat: this.seat, point: home })
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

  public pointerDown(at?: PointerAt): void {
    if (!this.snapshot.present) return
    this.pressed = true
    this.body.setPressed(true)
    if (this.liftable && at !== undefined) this.hand.down(at)
  }

  public pointerMove(at: PointerAt): void {
    this.hand.move(at)
  }

  public pointerUp(at?: PointerAt): void {
    if (at !== undefined && this.hand.up(at) !== 'press') return
    const pressed = this.pressed
    this.pressed = false
    if (!pressed) return
    this.body.setPressed(false)
    if (this.seat !== null) this.onPress?.()
  }

  public cancel(pointer?: number): void {
    if (this.hand.cancel(pointer) !== 'press') return
    this.unpress()
  }

  public escape(meta: boolean, shift: boolean): boolean {
    return this.hand.escape(meta, shift)
  }

  public goHome(): void {
    const { phase } = this.snapshot
    if (phase === 'held') {
      this.hand.stop()
      this.unpress()
    }
    if (this.away) {
      if (phase === 'held') this.set({ phase: 'seated' })
      return
    }
    if (inHand(phase)) this.writeHome()
  }

  public seatPoint(): Placement | null {
    return this.seatList()?.centre ?? null
  }

  public setAway(away: boolean): void {
    if (away === this.away) return
    if (!away) {
      this.back()
      return
    }
    this.away = true
    this.halt()
    this.journeys.dryQuickly(true)
    this.body.leave()
    if (!this.hand.holding) {
      this.hand.stop()
      this.pressed = false
    }
    this.hover(false)
    this.set({ phase: this.hand.holding ? 'held' : 'seated', present: false, away: true })
    this.markSeat()
  }

  public dispose(): void {
    this.hand.stop()
    if (this.heldSeat !== null) clearTimeout(this.heldSeat.timer)
    this.heldSeat = null
    this.policy.dispose()
    this.body.dispose()
    this.journeys.dispose()
    this.listeners.clear()
    this.placed.clear()
  }

  private halt(): void {
    this.turning = null
    this.turns += 1
    this.stopGoing()
  }

  private stopGoing(): void {
    if (this.going === null && !this.journeys.travelling) return
    this.journeys.end(false)
    this.going = null
  }

  private unpress(): void {
    if (!this.pressed) return
    this.pressed = false
    if (!this.away) this.body.setPressed(false)
  }

  private lifted(): void {
    this.halt()
    this.journeys.dryQuickly(true)
    this.set({ phase: 'held', point: null })
  }

  private ended(at: Placement, taken: boolean): void {
    this.unpress()
    if (this.away) {
      this.set({ phase: 'seated' })
      return
    }
    this.place(at)
    if (taken) this.set({ phase: 'dropped' })
    else this.writeHome()
  }

  private writeHome(): void {
    if (!this.fly()) this.leave()
  }

  private back(): void {
    this.away = false
    const at = this.hand.point
    if (at === null) {
      this.set({ phase: 'seated', present: false, away: false })
      this.keepSeat()
      return
    }
    this.place(at)
    this.set({ phase: 'held', present: true, away: false, size: this.ownSize(), point: null })
    this.body.writeAnew()
    this.hand.redrawn()
  }

  private markSeat(): void {
    const seat = this.seatList()
    this.seat = seat?.id ?? null
    const point = seat?.centre ?? null
    if (this.snapshot.seat === this.seat && samePoint(this.snapshot.point, point)) return
    this.set({ seat: this.seat, point })
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
    if (this.away) {
      this.markSeat()
      return
    }
    if (inHand(this.snapshot.phase)) return
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
    if (this.turning !== null) return
    if (seat === null || home === null) {
      this.leave()
      return
    }
    if (this.snapshot.phase === 'seated') this.staySeated(seat, home)
    else this.keepGoing(home)
  }

  private staySeated(seat: Seat, home: Placement): void {
    if (seat.id !== this.seat) {
      this.fly()
      return
    }
    const here = this.placement
    if (Math.hypot(here.x - home.x, here.y - home.y) > 0.25) {
      this.place(home)
      this.set({ point: home })
    }
  }

  private keepGoing(home: Placement): void {
    const going = this.going
    const shift = going === null ? Infinity : Math.hypot(going.x - home.x, going.y - home.y)
    if (shift <= 0.5) return
    if (shift < NEAR && this.journeys.travelling) return
    this.fly()
  }

  private leave(): void {
    this.stopGoing()
    this.seat = null
    this.body.dryAway()
    this.set({ phase: 'seated', present: false, seat: null, point: null })
  }

  private fly(settle?: number): boolean {
    const seat = this.activeSeat()
    this.seat = seat?.id ?? null
    const home = this.home()
    if (home === null) return false
    this.set({ phase: 'flying', seat: this.seat, point: home })
    this.go(
      home,
      () => {
        if (this.turning?.settling === true) this.turning = null
        if (this.snapshot.phase !== 'flying') return
        this.set({ phase: 'seated' })
        this.keepSeat()
      },
      settle === undefined ? undefined : { ms: settle },
    )
    return true
  }

  private ownSize(): number {
    return FIGURE_SIZE * this.appSize
  }

  private reach(base: number): number {
    return (base * this.snapshot.size) / FIGURE_SIZE
  }

  private go(to: Placement, arrive: () => void, way?: Timed): void {
    const from = this.placement
    const near = Math.hypot(to.x - from.x, to.y - from.y) < NEAR
    if (this.reduced || !this.snapshot.present || near) {
      this.going = null
      this.journeys.end(false)
      this.place(to)
      arrive()
      return
    }
    this.going = { x: to.x, y: to.y }
    this.journeys.travel(
      this.body,
      from,
      to,
      arrived => {
        this.going = null
        if (arrived) arrive()
      },
      way,
    )
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
