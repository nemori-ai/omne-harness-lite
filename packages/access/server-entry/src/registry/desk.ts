import type { AccessContribution, ProtocolKey } from '@omne-harness/access-cordis-contract'
import {
  declare,
  empty,
  install,
  remove,
  retire,
  type Instance,
  type Registry,
} from '@omne-harness/dynamis'
import type { ProtocolContract } from '@omne-harness/public-contract'
import type {
  AvailabilityChange,
  AvailabilitySubscription,
  RegistryForPipeline,
  ServedProtocol,
  StandaloneRegistry,
} from './registry.ts'
import { noPoints, points } from './points.ts'
import {
  PROTOCOLS,
  busy,
  enter,
  entryOf,
  keyOf,
  leave,
  noCalls,
  open,
  protocolsContract,
  type Open,
  type ProtocolItem,
} from './table.ts'

export type DeskOptions = { readonly onListenerError?: (error: unknown) => void }

/** The side of the registry that moves: the calls in flight, and who hears what is served. */
export type ProtocolDesk = RegistryForPipeline & {
  /** Aborts what this instance runs of the protocol; resolves once none of it runs any more. */
  readonly drained: (instance: Instance, key: string) => Promise<void>
  readonly changed: (registry: Registry) => void
}

const tagOf = (instance: Instance, key: string): string =>
  `${instance.fiber}#${instance.generation}|${key}`

function itemOf(registry: Registry, instance: Instance, key: string): ProtocolItem | undefined {
  const placed = registry.placed.find(
    held =>
      held.point === PROTOCOLS &&
      held.key === key &&
      held.instance.fiber === instance.fiber &&
      held.instance.generation === instance.generation,
  )
  return placed?.item as ProtocolItem | undefined
}

export function createDesk(read: () => Registry, options: DeskOptions = {}): ProtocolDesk {
  let calls = noCalls
  let revision = 0
  const served = new Map<string, ServedProtocol>()
  let conflicts: readonly ProtocolKey[] = []
  let declared = noPoints
  const waiting = new Map<string, () => void>()
  const listeners = new Set<(change: AvailabilityChange) => void>()

  function announce(change: 'mounted' | 'unmounted', protocol: ServedProtocol): void {
    revision += 1
    tell({ revision, change, protocol, conflicts })
  }

  function tell(event: AvailabilityChange): void {
    for (const listener of Array.from(listeners)) {
      try {
        listener(event)
      } catch (error) {
        options.onListenerError?.(error)
      }
    }
  }

  function follow(opened: Open): void {
    const now = new Map(opened.protocols.map(protocol => [protocol.key, protocol]))
    conflicts = opened.conflicts.map(({ name, major }) => ({ name, major }))
    for (const [key, protocol] of Array.from(served))
      if (!now.has(key)) {
        served.delete(key)
        announce('unmounted', protocol)
      }
    for (const [key, { name, major, revision: at, contract }] of now)
      if (!served.has(key)) {
        const protocol = { name, major, revision: at, contract }
        served.set(key, protocol)
        announce('mounted', protocol)
      }
  }

  function settle(instance: Instance, key: string): void {
    const tag = tagOf(instance, key)
    const done = waiting.get(tag)
    if (done === undefined || busy(calls, instance, key)) return
    waiting.delete(tag)
    done()
  }

  return {
    enter(key, name, scope) {
      const text = keyOf(key)
      const outcome = enter(read(), calls, text, name, scope)
      if (outcome.kind === 'conflict')
        return { refused: 'conflict', by: outcome.by.map(by => `${by.fiber}#${by.generation}`) }
      if (outcome.kind !== 'entered') return { refused: outcome.kind }
      const { call, instance, item, member } = outcome
      calls = outcome.calls
      let left = false
      return {
        member,
        revision: item.revision,
        signal: item.controller.signal,
        leave: () => {
          if (left) return
          left = true
          calls = leave(calls, call)
          settle(instance, text)
        },
      }
    },
    subscribe(listener): AvailabilitySubscription {
      listeners.add(listener)
      return {
        revision,
        protocols: [...served.values()],
        conflicts,
        points: declared.facts,
        unsubscribe: () => void listeners.delete(listener),
      }
    },
    drained(instance, key) {
      itemOf(read(), instance, key)?.controller.abort()
      return new Promise<void>(resolve => {
        waiting.set(tagOf(instance, key), resolve)
        settle(instance, key)
      })
    },
    changed(registry) {
      // Unread is not empty: what was last read stands until the point reads again.
      const opened = open(registry)
      if (opened !== undefined) follow(opened)
      const facts = points(registry, declared)
      const same = JSON.stringify(facts.facts) === JSON.stringify(declared.facts)
      declared = facts
      // The points are not counted: a change of them resends the snapshot at the same revision.
      if (!same) tell({ revision, change: 'points', points: declared.facts })
    },
  }
}

function mustInstall(
  registry: Registry,
  instance: Instance,
  entries: Parameters<typeof install>[2],
): Registry {
  const outcome = install(registry, instance, entries)
  if (outcome.kind !== 'installed') throw new Error(outcome.detail)
  return outcome.registry
}

/** A registry with no Cordis under it: every mount is an instance of its own, served at once. */
export function createStandaloneRegistry(options: DeskOptions = {}): StandaloneRegistry {
  let registry = mustInstall(empty, { fiber: 'entry', generation: 1 }, [declare(protocolsContract)])
  let minted = 0
  const desk = createDesk(() => registry, options)
  desk.changed(registry)
  const set = (next: Registry): void => {
    registry = next
    desk.changed(next)
  }
  return {
    enter: desk.enter,
    subscribe: desk.subscribe,
    own: contribution => mount(contribution),
    mount,
  }

  function mount<P extends ProtocolContract>(typed: AccessContribution<P>): () => Promise<void> {
    const contribution = typed as unknown as AccessContribution<ProtocolContract>
    minted += 1
    const instance = { fiber: `mount-${minted}`, generation: 1 }
    set(mustInstall(registry, instance, [entryOf(contribution, instance)]))
    let gone: Promise<void> | undefined
    return () => {
      if (gone !== undefined) return gone
      set(retire(registry, instance))
      gone = desk
        .drained(instance, keyOf(contribution.protocol))
        .then(() => set(remove(registry, instance)))
      return gone
    }
  }
}
