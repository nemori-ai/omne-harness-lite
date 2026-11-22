import { resolve, type Reference, type Registry } from '@omne-harness/dynamis'
import type { ServiceKey } from './service-key.ts'

/** The point of the client tree a need for a protocol refers to. The shell names it; it does not know who declares it. */
export const PROTOCOLS_POINT = 'connection.protocols'

export type ProtocolNeed<C = unknown> = Readonly<{
  kind: 'protocol'
  name: string
  /** The majors the module can speak, the one it prefers first. */
  majors: readonly number[]
  optional: boolean
  /** Never set: it carries the type of the client to `BoundOf`. */
  client?: C
}>

export type PointNeed<T = unknown> = Readonly<{
  kind: 'point'
  point: string
  optional: boolean
  value?: T
}>

export type Need = ProtocolNeed | PointNeed

export function needProtocol<C = unknown>(
  protocol: Readonly<{ name: string; major: number }>,
  options: Readonly<{ majors?: readonly number[]; optional?: true }> = {},
): ProtocolNeed<C> {
  const majors = Object.freeze([...(options.majors ?? [protocol.major])])
  return Object.freeze({
    kind: 'protocol',
    name: protocol.name,
    majors,
    optional: options.optional === true,
  })
}

const NOWHERE = 'shell.nowhere'

export function needPoint<T = unknown>(
  point: ServiceKey<T> | string | undefined,
  options: Readonly<{ optional?: true }> = {},
): PointNeed<T> {
  return Object.freeze({
    kind: 'point',
    point: point ?? NOWHERE,
    optional: options.optional === true,
  })
}

/** What is on a point now, for a module that needs it: nothing while it is not there. */
export type Reader<T> = Readonly<{
  get(): T | undefined
  subscribe(listener: () => void): () => void
}>

export function attachWhile<T>(reader: Reader<T>, attach: (given: T) => () => void): () => void {
  let held: T | undefined
  let detach: (() => void) | undefined
  const settle = (): void => {
    const now = reader.get()
    if (now === held) return
    detach?.()
    held = now
    detach = now === undefined ? undefined : attach(now)
  }
  const stop = reader.subscribe(settle)
  settle()
  return () => {
    stop()
    detach?.()
  }
}

export type BoundOf<N> = {
  readonly [K in keyof N]: N[K] extends ProtocolNeed<infer C>
    ? C
    : N[K] extends PointNeed<infer T>
      ? Reader<T>
      : never
}

export function referenceOf(need: Need): Reference {
  const anyOf = need.kind === 'protocol' ? need.majors.map(major => `${need.name}/v${major}`) : ['']
  const point = need.kind === 'protocol' ? PROTOCOLS_POINT : need.point
  return need.optional ? { point, anyOf, optional: true } : { point, anyOf }
}

export function referencesOf(needs: Readonly<Record<string, Need>>): Record<string, Reference> {
  return Object.fromEntries(Object.entries(needs).map(([slot, need]) => [slot, referenceOf(need)]))
}

const UNAVAILABLE = Object.freeze({ outcome: 'unavailable' as const })

async function* endsUnavailable(): AsyncGenerator<never, { kind: 'unavailable' }> {
  yield* []
  return { kind: 'unavailable' }
}

type Client = Record<string, (...args: unknown[]) => unknown> & {
  observe?: Record<string, (...args: unknown[]) => unknown>
}

/** A client that is always there: each call goes to the client pinned for this need at that moment, or answers unavailable. */
export function pinnedClient(registry: () => Registry, reference: Reference): unknown {
  const pinned = (): Client | undefined => {
    const answer = resolve<{ client: Client }>(registry(), reference, [])
    return answer.kind === 'one' ? answer.entry.item.client : undefined
  }
  const observe = new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args: unknown[]) =>
          pinned()?.observe?.[String(name)]?.(...args) ?? endsUnavailable(),
    },
  )
  return new Proxy(
    {},
    {
      get(_, name) {
        if (name === 'observe') return observe
        if (typeof name !== 'string' || name === 'then') return undefined
        return (...args: unknown[]) => pinned()?.[name]?.(...args) ?? Promise.resolve(UNAVAILABLE)
      },
    },
  )
}

/** What is at the one spot of a point now. */
export function pointReader<T>(
  registry: () => Registry,
  reference: Reference,
  subscribe: (listener: () => void) => () => void,
): Reader<T> {
  return Object.freeze({
    get(): T | undefined {
      const answer = resolve<T>(registry(), reference, [])
      return answer.kind === 'one' ? answer.entry.item : undefined
    },
    subscribe,
  })
}
