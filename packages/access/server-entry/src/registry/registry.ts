import {
  AccessAssemblyError,
  type AccessContribution,
  type FrameSource,
  type OperationHandler,
  type ProtocolKey,
} from '@omne-harness/access-cordis-contract'
import type {
  ObservationContract,
  OperationContract,
  ProtocolContract,
} from '@omne-harness/public-contract'

export type Entered = {
  readonly member:
    | {
        readonly kind: 'operation'
        readonly contract: OperationContract
        readonly handler: OperationHandler<any>
      }
    | {
        readonly kind: 'observation'
        readonly contract: ObservationContract
        readonly source: FrameSource<any>
      }
  readonly signal: AbortSignal
  readonly leave: () => void
}

type Generation = {
  readonly key: ProtocolKey
  readonly contribution: AccessContribution<ProtocolContract>
  readonly controller: AbortController
  readonly inFlight: Set<symbol>
  drain?: { readonly promise: Promise<void>; readonly resolve: () => void }
}

export type AvailabilityChange = {
  readonly revision: number
  readonly change: 'mounted' | 'unmounted'
  readonly protocol: ProtocolKey
}

export type AvailabilitySubscription = {
  readonly revision: number
  readonly protocols: readonly ProtocolKey[]
  readonly unsubscribe: () => void
}

export type RegistryForPipeline = {
  readonly enter: (key: ProtocolKey, name: string) => Entered | undefined
  readonly subscribe: (listener: (change: AvailabilityChange) => void) => AvailabilitySubscription
}

export type AccessRegistry = RegistryForPipeline & {
  readonly mount: <P extends ProtocolContract>(
    contribution: AccessContribution<P>,
  ) => () => Promise<void>
}

export type AccessRegistryOptions = {
  readonly onListenerError?: (error: unknown) => void
}

function keyText(key: ProtocolKey): string {
  return `${key.name}/v${key.major}`
}

function settleIfDrained(generation: Generation): void {
  if (generation.inFlight.size === 0) generation.drain?.resolve()
}

function memberOf(
  contribution: AccessContribution<ProtocolContract>,
  name: string,
): Entered['member'] | undefined {
  const { operations, observations } = contribution.protocol
  // Own names only: a name taken from a request must not reach the object prototype.
  if (Object.hasOwn(operations, name))
    return {
      kind: 'operation',
      contract: operations[name] as OperationContract,
      handler: contribution.operations[name] as OperationHandler<any>,
    }
  if (Object.hasOwn(observations, name))
    return {
      kind: 'observation',
      contract: observations[name] as ObservationContract,
      source: contribution.observations[name] as FrameSource<any>,
    }
  return undefined
}

export function createAccessRegistry(options: AccessRegistryOptions = {}): AccessRegistry {
  const entries = new Map<string, Generation>()
  const listeners = new Set<(change: AvailabilityChange) => void>()
  let revision = 0

  function announce(change: AvailabilityChange['change'], protocol: ProtocolKey): void {
    revision += 1
    const event: AvailabilityChange = { revision, change, protocol }
    for (const listener of Array.from(listeners)) {
      try {
        listener(event)
      } catch (error) {
        options.onListenerError?.(error)
      }
    }
  }

  function takeDown(generation: Generation): Promise<void> {
    if (generation.drain !== undefined) return generation.drain.promise
    let resolve!: () => void
    const promise = new Promise<void>(settle => {
      resolve = settle
    })
    generation.drain = { promise, resolve }
    entries.delete(keyText(generation.key))
    generation.controller.abort()
    announce('unmounted', generation.key)
    settleIfDrained(generation)
    return promise
  }

  function mount<P extends ProtocolContract>(typed: AccessContribution<P>): () => Promise<void> {
    const contribution = typed as unknown as AccessContribution<ProtocolContract>
    const key: ProtocolKey = {
      name: contribution.protocol.name,
      major: contribution.protocol.major,
    }
    if (entries.has(keyText(key))) throw new AccessAssemblyError(key)
    const generation: Generation = {
      key,
      contribution,
      controller: new AbortController(),
      inFlight: new Set(),
    }
    entries.set(keyText(key), generation)
    announce('mounted', key)
    return () => takeDown(generation)
  }

  function enter(key: ProtocolKey, name: string): Entered | undefined {
    const generation = entries.get(keyText(key))
    if (generation === undefined) return undefined
    const member = memberOf(generation.contribution, name)
    if (member === undefined) return undefined
    const token = Symbol(name)
    generation.inFlight.add(token)
    return {
      member,
      signal: generation.controller.signal,
      leave: () => {
        if (!generation.inFlight.delete(token)) return
        settleIfDrained(generation)
      },
    }
  }

  function subscribe(listener: (change: AvailabilityChange) => void): AvailabilitySubscription {
    listeners.add(listener)
    return {
      revision,
      protocols: [...entries.values()].map(generation => generation.key),
      unsubscribe: () => {
        listeners.delete(listener)
      },
    }
  }

  return { mount, enter, subscribe }
}
