import { Service, type Context } from '@deepseek-ai/cordis'
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
  type Seats,
} from './seat.ts'

type CordisFiberState = typeof import('@deepseek-ai/cordis').FiberState

const ACTIVE = 2 satisfies CordisFiberState['ACTIVE']
const UNLOADING = 5 satisfies CordisFiberState['UNLOADING']

export type Made = readonly Entry[] | ((instance: Instance) => readonly Entry[])

/** Called once after the instance began to withdraw; it resolves when this batch has drained. */
export type Drain = (instance: Instance) => Promise<void>

/** A batch that was not taken: an entry is not valid, or the caller holds this spot already. */
export class DynamisRefused extends Error {
  override readonly name = 'DynamisRefused'
  readonly reason: 'invalid' | 'held'
  constructor(reason: 'invalid' | 'held', detail: string) {
    super(detail)
    this.reason = reason
  }
}

/** @owner packages/dynamis/dynamis-cordis */
export class DynamisService extends Service {
  static readonly provide = 'dynamis'
  private seats: Seats = noSeats
  private readonly keys = new WeakMap<object, string>()
  private minted = 0

  constructor(ctx: Context) {
    super(ctx, DynamisService.provide)
    ctx.on('internal/status', fiber => {
      const state = fiber.state as number
      if (state === ACTIVE) this.commit(ready(this.seats, this.keyOf(fiber)))
      if (state === UNLOADING) this.commit(gone(this.seats, this.keyOf(fiber)))
    })
  }

  registry(): Registry {
    return this.seats.registry
  }

  /** Puts one batch as an effect of the calling fiber; the batch shows once that fiber is ready. */
  put(made: Made, { drain }: Readonly<{ drain?: Drain }> = {}): () => unknown {
    const fiber = this.ctx.fiber
    const key = this.keyOf(fiber)
    const entries =
      typeof made === 'function' ? made(instanceFor(this.seats, key, fiber.name)) : made
    const outcome = put(this.seats, key, fiber.name, entries, drain !== undefined)
    if (outcome.kind === 'refused') throw new DynamisRefused(outcome.reason, outcome.detail)
    return fiber.effect(() => {
      this.commit((fiber.state as number) === ACTIVE ? ready(outcome.seats, key) : outcome.seats)
      return () => {
        const instance = leaving(this.seats, key, outcome.batch)
        if (instance === undefined || drain === undefined)
          return this.commit(drop(this.seats, key, outcome.batch))
        const taken = (): void => this.commit(drained(this.seats, key, outcome.batch))
        return drain(instance).finally(taken)
      }
    }, 'dynamis.put')
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
