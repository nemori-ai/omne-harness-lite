import { FigureBody, WRITE, type Doing, type FigureMoment } from './body.ts'
import { casual } from './casual.ts'
import { inkNow } from './clock.ts'
import { DoingPolicy } from './doing.ts'
import {
  follow,
  FOLLOW,
  Hand,
  pointOf,
  resting,
  type FigureHand,
  type HandPoint,
  type PointerAt,
  type Spring,
} from './hand.ts'
import { FIGURE_SIZE, roomAround } from './store.ts'
import { Journeys, type Box, type Placement } from './travel.ts'

export const DOUBLE_WAIT = 320

export const REACH = 34

const SETTLING = 210

const NEAR = 1.5

export type LooseWhere =
  | { readonly mode: 'none' }
  | { readonly mode: 'hand' | 'rest' | 'home'; readonly at: Placement }

export type LooseMode = LooseWhere['mode']

export interface LooseHands {
  readonly onDown?: ((at: HandPoint) => void) | undefined
  readonly onLift?: ((at: HandPoint) => void) | undefined
  readonly onMove?: ((at: HandPoint) => void) | undefined
  readonly onDrop?: ((at: HandPoint) => void) | undefined
  readonly onCancel?: ((at: HandPoint) => void) | undefined
  readonly onClick?: (() => void) | undefined
  readonly onDoubleClick?: (() => void) | undefined
  readonly onArrived?: (() => void) | undefined
}

interface Glide {
  spring: Spring
  target: Placement
  stiffness: number
  last: number
}

export class LooseStore {
  public readonly body = new FigureBody()
  public readonly journeys = new Journeys(FIGURE_SIZE)
  public hands: LooseHands = {}
  private readonly policy: DoingPolicy
  private readonly placed = new Set<(at: Placement) => void>()
  private where: LooseWhere = { mode: 'none' }
  private placement: Placement = { x: -200, y: -200 }
  private size = FIGURE_SIZE
  private reduced = false
  private pressed = false
  private click: ReturnType<typeof setTimeout> | null = null
  private glide: Glide | null = null
  private rewriteFirst = false
  private rewriting: { timer: ReturnType<typeof setTimeout>; to: Placement } | null = null
  private frameRequest = 0
  private readonly hand = new Hand({
    centre: () => this.placement,
    drawn: () => this.where.mode === 'hand',
    reduced: () => this.reduced,
    tell: hand => {
      this.told(hand)
      return false
    },
    lifted: () => this.lifted(),
    carried: at => this.place(at),
    ended: () => this.unpress(),
    abandoned: () => this.unpress(),
  })

  public constructor(told: number | null = null) {
    this.policy = new DoingPolicy(this.body, undefined, told)
    this.body.random = () => casual.random()
    this.body.leave()
    this.body.roomLeft = () => roomAround(this.placement, this.size).left
    this.body.roomRight = () => roomAround(this.placement, this.size).right
  }

  public onPlaced(listener: (at: Placement) => void): () => void {
    this.placed.add(listener)
    listener(this.placement)
    return () => {
      this.placed.delete(listener)
    }
  }

  public follow(doing: Doing | null, moment: FigureMoment | null): void {
    this.policy.follow(doing, moment)
  }

  public setWaiting(count: number): void {
    this.body.setWaiting(count)
  }

  public setSize(size: number): void {
    if (!(size > 0)) return
    this.size = size
    this.journeys.setOwnSize(size)
  }

  public setRewriteFirst(on: boolean): void {
    this.rewriteFirst = on
  }

  public setReduced(reduced: boolean): void {
    this.reduced = reduced
    casual.setStill(reduced)
    this.body.setReduced(reduced)
    if (!reduced) return
    const rewriting = this.rewriting
    if (rewriting !== null) {
      this.stopRewriting()
      this.goHome(rewriting.to)
    }
    const glide = this.glide
    if (glide !== null) {
      this.stopGlide()
      this.place(glide.target)
    }
    this.journeys.end(true)
    this.journeys.dryQuickly(true)
  }

  public show(next: LooseWhere): void {
    const was = this.where
    this.where = next
    if (next.mode === 'none') {
      this.vanish()
      return
    }
    if (was.mode === 'none') {
      this.appear(next.at, next.mode === 'home')
      return
    }
    if (was.mode === 'home' && next.mode !== 'home') this.endJourney()
    if (next.mode === 'hand') this.toHand(next.at, was.mode === 'hand')
    else if (next.mode === 'rest') this.glideTo(next.at, SETTLING)
    else if (this.rewriting !== null) this.rewriting.to = next.at
    else if (was.mode !== 'home' && this.rewriteFirst && !this.reduced)
      this.rewriteThenHome(next.at)
    else this.goHome(next.at)
  }

  public reach(): Box | null {
    const where = this.where
    if (where.mode === 'none') return null
    const centre = where.mode === 'hand' ? this.placement : where.at
    const half = this.size / 2 + REACH
    return { x: centre.x - half, y: centre.y - half, width: half * 2, height: half * 2 }
  }

  public pointerDown(at: PointerAt): void {
    if (this.where.mode === 'none') return
    this.pressed = true
    this.body.setPressed(true)
    this.hand.down(at)
    this.hands.onDown?.(pointOf(at))
  }

  public pointerMove(at: PointerAt): void {
    this.hand.move(at)
  }

  public pointerUp(at: PointerAt): void {
    const ended = this.hand.up(at)
    if (ended === 'other') return
    const pressed = this.pressed
    this.unpress()
    if (ended === 'press' && pressed) this.clicked()
  }

  public cancel(pointer: number): void {
    if (this.hand.cancel(pointer) === 'other') return
    this.unpress()
  }

  public dispose(): void {
    this.hand.stop()
    this.stopGlide()
    this.stopRewriting()
    this.forgetClick()
    this.policy.dispose()
    this.body.dispose()
    this.journeys.dispose()
    this.placed.clear()
  }

  private appear(at: Placement, home: boolean): void {
    this.place(at)
    this.body.writeAnew()
    if (home) this.hands.onArrived?.()
  }

  private vanish(): void {
    this.stopRewriting()
    this.hand.stop()
    this.unpress()
    this.forgetClick()
    this.stopGlide()
    this.journeys.dryQuickly(true)
    this.body.leave()
  }

  private toHand(at: Placement, following: boolean): void {
    if (this.hand.holding) {
      if (following) return
      this.stopGlide()
      this.hand.redrawn()
      return
    }
    if (following) {
      this.glideTo(at, FOLLOW)
      return
    }
    this.stopGlide()
    this.place(at)
  }

  private goHome(to: Placement): void {
    this.stopGlide()
    const from = this.placement
    if (this.reduced || Math.hypot(to.x - from.x, to.y - from.y) < NEAR) {
      this.journeys.end(false)
      this.place(to)
      this.hands.onArrived?.()
      return
    }
    this.journeys.travel(this.body, from, to, arrived => {
      if (arrived) this.hands.onArrived?.()
    })
    this.place(to)
  }

  private rewriteThenHome(to: Placement): void {
    this.stopGlide()
    const took = this.body.rewrite(WRITE.rewrite)
    const timer = setTimeout(() => {
      const rewriting = this.rewriting
      this.rewriting = null
      if (rewriting !== null) this.goHome(rewriting.to)
    }, took)
    this.rewriting = { timer, to }
  }

  private stopRewriting(): void {
    if (this.rewriting !== null) clearTimeout(this.rewriting.timer)
    this.rewriting = null
  }

  private endJourney(): void {
    this.stopRewriting()
    this.journeys.end(false)
    this.journeys.dryQuickly(true)
  }

  private glideTo(target: Placement, stiffness: number): void {
    if (this.reduced) {
      this.stopGlide()
      this.place(target)
      return
    }
    const { x, y } = this.placement
    const glide = this.glide
    this.glide = {
      spring: glide?.spring ?? { x, y, vx: 0, vy: 0 },
      target,
      stiffness,
      last: glide?.last ?? inkNow(),
    }
    if (this.frameRequest === 0) this.frameRequest = requestAnimationFrame(this.tick)
  }

  private readonly tick = (): void => {
    this.frameRequest = 0
    const glide = this.glide
    if (glide === null) return
    const now = inkNow()
    const next = follow(
      glide.spring,
      glide.target,
      Math.max(0, now - glide.last) / 1000,
      glide.stiffness,
    )
    glide.last = now
    if (resting(next, glide.target)) {
      this.glide = null
      this.place(glide.target)
      return
    }
    glide.spring = next
    this.place({ x: next.x, y: next.y })
    this.frameRequest = requestAnimationFrame(this.tick)
  }

  private stopGlide(): void {
    this.glide = null
    cancelAnimationFrame(this.frameRequest)
    this.frameRequest = 0
  }

  private told(hand: FigureHand): void {
    const at = pointOf(hand)
    if (hand.kind === 'lift') this.hands.onLift?.(at)
    else if (hand.kind === 'move') this.hands.onMove?.(at)
    else if (hand.kind === 'drop') this.hands.onDrop?.(at)
    else this.hands.onCancel?.(at)
  }

  private lifted(): void {
    this.forgetClick()
  }

  private clicked(): void {
    if (this.click !== null) {
      this.forgetClick()
      this.hands.onDoubleClick?.()
      return
    }
    this.click = setTimeout(() => {
      this.click = null
      this.hands.onClick?.()
    }, DOUBLE_WAIT)
  }

  private forgetClick(): void {
    if (this.click !== null) clearTimeout(this.click)
    this.click = null
  }

  private unpress(): void {
    if (!this.pressed) return
    this.pressed = false
    this.body.setPressed(false)
  }

  private place(at: Placement): void {
    this.placement = at
    for (const listener of this.placed) listener(at)
  }
}
