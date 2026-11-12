// The access registry (RFC-0015 §5「登记表与贡献」, §13「登记表里的一个协议」). It knows no domain:
// entries are kept by protocol name and major version, and handlers are only called as functions.
// `enter` and `subscribe` are synchronous: each is one step that no take-down can split
// (§15「两条硬要求」).
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

/** What `enter` gives the pipeline: the member, the abort signal of its contribution, and `leave`. */
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
  /** Called once the answer is written. A second call has no effect. */
  readonly leave: () => void
}

/** One mount of one contribution, from `mount` until its last in-flight work has left. */
type Generation = {
  readonly key: ProtocolKey
  readonly contribution: AccessContribution<ProtocolContract>
  /** One signal for every in-flight work of this mount: a take-down aborts them all at once. */
  readonly controller: AbortController
  readonly inFlight: Set<symbol>
  /** Set by the take-down; settles when `inFlight` is empty. */
  drain?: { readonly promise: Promise<void>; readonly resolve: () => void }
}

/** One change of the registry. `revision` is the registry's revision after the change. */
export type AvailabilityChange = {
  readonly revision: number
  readonly change: 'mounted' | 'unmounted'
  readonly protocol: ProtocolKey
}

/** The registry at the moment of subscribing, and the way to stop. */
export type AvailabilitySubscription = {
  readonly revision: number
  readonly protocols: readonly ProtocolKey[]
  /** A second call has no effect. */
  readonly unsubscribe: () => void
}

/** The pipeline's view of the registry. A domain does not see these two methods. */
export type RegistryForPipeline = {
  /** Synchronous. Looks up the entry and registers the work as in flight, as one step. */
  readonly enter: (key: ProtocolKey, name: string) => Entered | undefined
  /** Synchronous. Reads the snapshot and registers the listener, as one step. */
  readonly subscribe: (listener: (change: AvailabilityChange) => void) => AvailabilitySubscription
}

export type AccessRegistry = RegistryForPipeline & {
  /** Mounts synchronously or throws `AccessAssemblyError`. Returns the take-down. */
  readonly mount: <P extends ProtocolContract>(
    contribution: AccessContribution<P>,
  ) => () => Promise<void>
}

export type AccessRegistryOptions = {
  /** Receives what a listener throws. The registry and the other listeners carry on. */
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
  // Own names only: a name taken from a request must not reach the object prototype. The
  // contribution has a member for every name of its contract; its type guarantees that.
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

  /** Part of the synchronous step of a mount or a take-down: the revision and every listener. */
  function announce(change: AvailabilityChange['change'], protocol: ProtocolKey): void {
    revision += 1
    const event: AvailabilityChange = { revision, change, protocol }
    // Only the listeners of this moment: one that subscribes from a callback already has this
    // change in its snapshot.
    for (const listener of Array.from(listeners)) {
      try {
        listener(event)
      } catch (error) {
        options.onListenerError?.(error)
      }
    }
  }

  /**
   * The synchronous part removes the entry and aborts the in-flight work. The returned promise
   * settles when the last of them has left. A second call returns the same promise.
   */
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
    // The registry only calls handlers as functions; the contract types end at this boundary.
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
