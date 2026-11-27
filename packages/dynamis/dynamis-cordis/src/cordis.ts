import { Service, type Context, type Fiber } from '@deepseek-ai/cordis'
import type { Entry, Instance, Registry } from '@omne-harness/dynamis'
import {
  drained,
  drop,
  gone,
  instanceFor,
  leaving,
  noSeats,
  put,
  ready,
  rollout,
  type RolloutRefusal,
  type Seat,
  type Seats,
} from './seat.ts'

type CordisFiberState = typeof import('@deepseek-ai/cordis').FiberState

const ACTIVE = 2 satisfies CordisFiberState['ACTIVE']
const DISPOSED = 4 satisfies CordisFiberState['DISPOSED']
const UNLOADING = 5 satisfies CordisFiberState['UNLOADING']

export type Made = readonly Entry[] | ((instance: Instance) => readonly Entry[])

/** Called once after the instance began to withdraw; it resolves when this batch has drained. */
export type Drain = (instance: Instance) => Promise<void>

export type RolledOut =
  | Readonly<{ kind: 'rolled'; seated: readonly Instance[] }>
  | Readonly<{ kind: 'refused'; reason: RolloutRefusal; detail: string }>

type Refusal = 'invalid' | 'held' | 'awaited'

/** A batch that was not taken: an entry is not valid, or the caller holds this spot already. */
export class DynamisRefused extends Error {
  override readonly name = 'DynamisRefused'
  readonly reason: Refusal
  constructor(reason: Refusal, detail: string) {
    super(detail)
    this.reason = reason
  }
}

/** @owner packages/dynamis/dynamis-cordis */
export class DynamisService extends Service {
  static readonly provide = 'dynamis'
  private seats: Seats = noSeats
  private readonly keys = new WeakMap<object, string>()
  private readonly putters = new Map<string, Fiber>()
  private readonly successions = new WeakMap<Fiber, Fiber>()
  private minted = 0

  constructor(ctx: Context) {
    super(ctx, DynamisService.provide)
    ctx.on('internal/status', fiber => {
      const state = fiber.state as number
      if (state === ACTIVE) this.commit(ready(this.seats, this.keyOf(fiber)))
      if (state === UNLOADING) this.commit(gone(this.seats, this.keyOf(fiber)))
      if (state === DISPOSED) this.putters.delete(this.keyOf(fiber))
    })
  }

  succeed(next: Fiber, old: Fiber): void {
    this.successions.set(itself(next), itself(old))
  }

  rollout(staged: Fiber, alongside?: () => void): RolledOut {
    const next = itself(staged)
    if ((next.state as number) !== ACTIVE)
      return { kind: 'refused', reason: 'not-ready', detail: `${next.name} is not ready` }
    let seats = this.seats
    const seated: Instance[] = []
    for (const seat of this.seats.seats) {
      if (seat.awaits === undefined || !this.under(seat, next)) continue
      const step = rollout(seats, seat.awaits.succeeds, seat.fiber)
      if (step.kind === 'refused') return step
      seats = step.seats
      seated.push(seat.instance)
    }
    this.successions.delete(next)
    alongside?.()
    this.commit(seats)
    return { kind: 'rolled', seated }
  }

  registry(): Registry {
    return this.seats.registry
  }

  /** Puts one batch as an effect of the calling fiber; the batch shows once that fiber is ready. */
  put(made: Made, { drain }: Readonly<{ drain?: Drain }> = {}): () => unknown {
    const fiber = this.ctx.fiber
    const key = this.keyOf(fiber)
    const succeeds = this.predecessor(fiber)
    const entries =
      typeof made === 'function' ? made(instanceFor(this.seats, key, fiber.name, succeeds)) : made
    const outcome = put(this.seats, key, fiber.name, entries, drain !== undefined, succeeds)
    if (outcome.kind === 'refused') throw new DynamisRefused(outcome.reason, outcome.detail)
    this.putters.set(key, fiber)
    return fiber.effect(() => {
      this.commit((fiber.state as number) === ACTIVE ? ready(outcome.seats, key) : outcome.seats)
      return () => {
        const instance = leaving(this.seats, key, outcome.batch)
        if (instance === undefined || drain === undefined)
          return this.commit(drop(this.seats, key, outcome.batch))
        const taken = (): void => this.commit(drained(this.seats, key, outcome.batch))
        // A drain that throws on the spot is a drain that failed: the instance is taken all the same.
        return new Promise<void>(resolve => resolve(drain(instance))).finally(taken)
      }
    }, 'dynamis.put')
  }

  private under(seat: Seat, root: Fiber): boolean {
    const putter = this.putters.get(seat.fiber)
    return putter !== undefined && ancestors(putter).includes(root)
  }

  private predecessor(fiber: Fiber): Instance | undefined {
    const old = ancestors(fiber)
      .map(above => this.successions.get(above))
      .find(found => found !== undefined)
    if (old === undefined) return undefined
    return this.seats.seats.find(
      seat =>
        seat.seated &&
        seat.retiring === undefined &&
        this.putters.get(seat.fiber)?.name === fiber.name &&
        this.under(seat, old),
    )?.instance
  }

  private keyOf(fiber: object): string {
    const held = this.keys.get(fiber)
    if (held !== undefined) return held
    this.minted += 1
    this.keys.set(fiber, `fiber-${this.minted}`)
    return `fiber-${this.minted}`
  }

  private commit(next: Seats): void {
    const changed = next.registry !== this.seats.registry
    this.seats = next
    if (!changed) return
    const { logger } = this.ctx
    this.ctx
      .parallel('dynamis-cordis/changed', next.registry)
      .catch(() => logger.warn('dynamis: a listener of dynamis-cordis/changed threw'))
  }
}

const itself = (fiber: Fiber): Fiber => fiber.ctx.fiber

function ancestors(fiber: Fiber): Fiber[] {
  const found = [fiber]
  for (let above = fiber.parent.fiber; !found.includes(above); above = above.parent.fiber)
    found.push(above)
  return found
}

export const dynamisKey = DynamisService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    dynamis: DynamisService
  }
  interface Events {
    /**
     * The registry changed. Every listener is called at once, in order; one that throws does not
     * keep the change from the others.
     * @mode parallel
     * @param registry the registry after the change
     */
    'dynamis-cordis/changed'(registry: Registry): void
  }
}
