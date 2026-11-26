import type { Context, Fiber, Plugin } from '@deepseek-ai/cordis'
import {
  admitCall,
  createCloseProtocol,
  finishCall,
  generationFell,
  noGenerations,
  prepareGeneration,
  promoteGeneration,
  standbyFailed,
  stateOfGeneration,
  type Clock,
  type CloseProtocol,
  type Generations,
  type GenerationState,
} from '@omne-harness/assembly'

type CordisFiberState = typeof import('@deepseek-ai/cordis').FiberState

const ACTIVE = 2 satisfies CordisFiberState['ACTIVE']

type Method = (...args: never[]) => unknown

export type Methods<Service> = {
  readonly [Name in keyof Service as Service[Name] extends Method ? Name : never]: Service[Name]
}

export type EntryEvent = Readonly<{
  kind: 'unknown'
  key: string
  generation: number
  calls: number
}>

export type EntryShape<Service> = Readonly<{
  key: string
  /** For every method the entry forwards: the answer of a call that finds no generation in service. */
  unavailable: Methods<Service>
  drainTimeoutMs: number
  clock: Clock
  report?: (event: EntryEvent) => void
}>

export type EntryStanding =
  | Readonly<{ kind: 'serving'; generation: number }>
  | Readonly<{ kind: 'basis-unavailable' }>

export type EntryPromoted =
  | Readonly<{ kind: 'promoted'; serving: number; superseded: number | null }>
  | Readonly<{ kind: 'refused'; reason: 'no-standby' }>

export type Entry<Service> = Readonly<{
  key: string
  service: Methods<Service>
  plugin: Plugin.Object
  standing(): EntryStanding
  /** Said in the `apply` of a generation. It serves when its fiber is ready and none serves; else when promoted. */
  offer(ctx: Context, implementation: Methods<Service>): void
  offered(root: Fiber): Readonly<{ generation: number; state: GenerationState }> | undefined
  promote(root: Fiber): EntryPromoted
}>

export class EntryRefused extends Error {
  override readonly name = 'EntryRefused'
}

type Held<Service> = Readonly<{
  implementation: Methods<Service>
  fiber: Fiber
  protocol: CloseProtocol
}>

export const fiberItself = (fiber: Fiber): Fiber => fiber.ctx.fiber

export function isUnder(fiber: Fiber, root: Fiber): boolean {
  const top = fiberItself(root)
  const seen = new Set<Fiber>()
  for (let above = fiber; !seen.has(above); above = above.parent.fiber) {
    if (above === top) return true
    seen.add(above)
  }
  return false
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'then') === 'function'

export function defineEntry<Service>(shape: EntryShape<Service>): Entry<Service> {
  const { key, unavailable, report } = shape
  let state: Generations = noGenerations
  const held = new Map<number, Held<Service>>()
  const drains = new Map<number, Promise<void>>()
  let calls = 0
  let home: Context | undefined
  let provided = false

  function provide(): void {
    if (home === undefined || provided || state.serving === null) return
    provided = true
    home.provide(key, service)
  }

  function unknown(generation: number): void {
    const fell = generationFell(state, generation)
    if (fell.kind !== 'fell') return
    state = fell.generations
    if (fell.unknown > 0) report?.({ kind: 'unknown', key, generation, calls: fell.unknown })
  }

  function drain(generation: number, protocol: CloseProtocol): void {
    const closed = protocol.close().then(closing => {
      if (closing.status === 'timed-out') unknown(generation)
      held.delete(generation)
      drains.delete(generation)
    })
    drains.set(generation, closed)
  }

  function promoteStandby(): EntryPromoted {
    const promoted = promoteGeneration(state)
    if (promoted.kind === 'refused') return promoted
    state = promoted.generations
    const { superseded } = promoted
    const old = superseded === null ? undefined : held.get(superseded)
    if (superseded !== null && old !== undefined) {
      if (promoted.drained.includes(superseded)) held.delete(superseded)
      else drain(superseded, old.protocol)
    }
    provide()
    return { kind: 'promoted', serving: promoted.serving, superseded }
  }

  function withdraw(generation: number): Promise<void> | undefined {
    const standing = stateOfGeneration(state, generation)
    if (standing === 'retiring') return drains.get(generation)
    if (standing === 'standby') {
      const failed = standbyFailed(state)
      if (failed.kind === 'failed') state = failed.generations
    }
    if (standing === 'serving') unknown(generation)
    held.delete(generation)
    return undefined
  }

  function forward(name: string): Method {
    return (...args) => {
      const admitted = admitCall(state)
      if (admitted.kind === 'unavailable')
        return Reflect.apply(Reflect.get(unavailable, name) as Method, undefined, args)
      const { generation } = admitted
      const pinned = held.get(generation)
      if (pinned === undefined) throw new Error(`${key}: generation ${generation} is not held`)
      state = admitted.generations
      calls += 1
      const lease = pinned.protocol.admit(`call-${calls}`)
      const done = (): void => {
        pinned.protocol.release(lease)
        const finished = finishCall(state, generation)
        if (finished.kind === 'finished') state = finished.generations
      }
      let answer: unknown
      try {
        const method = Reflect.get(pinned.implementation, name) as Method
        answer = Reflect.apply(method, pinned.implementation, args)
      } catch (error) {
        done()
        throw error
      }
      if (isThenable(answer)) return Promise.resolve(answer).finally(done)
      done()
      return answer
    }
  }

  const service = Object.freeze(
    Object.fromEntries(Object.keys(unavailable).map(name => [name, forward(name)])),
  ) as Methods<Service>

  const offeredBy = (root: Fiber): number | undefined =>
    [...held].find(([, { fiber }]) => isUnder(fiber, root))?.[0]

  return {
    key,
    service,
    plugin: {
      name: `entry:${key}`,
      apply(ctx: Context) {
        ctx.effect(() => {
          home = ctx
          provide()
          return () => {
            home = undefined
            provided = false
          }
        }, 'assembly.entry')
      },
    },
    standing: () =>
      state.serving === null
        ? { kind: 'basis-unavailable' }
        : { kind: 'serving', generation: state.serving },
    offer(ctx, implementation) {
      const { fiber } = ctx
      const prepared = prepareGeneration(state)
      if (prepared.kind === 'refused')
        throw new EntryRefused(`${key}: generation ${state.standby} stands by already`)
      const { generation } = prepared
      const protocol = createCloseProtocol({
        steps: [],
        drainTimeoutMs: shape.drainTimeoutMs,
        clock: shape.clock,
      })
      ctx.effect(() => {
        state = prepared.generations
        held.set(generation, { implementation, fiber, protocol })
        return () => withdraw(generation)
      }, 'assembly.entry.offer')
      ctx.on('internal/status', changed => {
        if (changed !== fiber || (changed.state as number) !== ACTIVE) return
        if (state.standby === generation && state.serving === null) promoteStandby()
      })
    },
    offered(root) {
      const generation = offeredBy(root)
      return generation === undefined
        ? undefined
        : { generation, state: stateOfGeneration(state, generation) }
    },
    promote(root) {
      if (state.standby === null || offeredBy(root) !== state.standby)
        return { kind: 'refused', reason: 'no-standby' }
      return promoteStandby()
    },
  }
}
