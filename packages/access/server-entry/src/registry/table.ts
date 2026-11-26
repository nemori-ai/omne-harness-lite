import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import {
  admit,
  ask,
  finish,
  list,
  noCalls as noLedger,
  settled,
  type Contract,
  type Entry,
  type Instance,
  type Ledger,
  type Registry,
  type Scope,
} from '@omne-harness/dynamis'
import { revisionOf, type ProtocolContract } from '@omne-harness/public-contract'
import { memberOf, type Entered } from './registry.ts'

export const PROTOCOLS = 'access.protocols'

export const protocolsContract: Contract = Object.freeze({
  name: PROTOCOLS,
  tree: 'server',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the protocol, <name>/v<major>',
  gives: 'the call context and the body its contract reads',
  item: Object.freeze({
    kind: 'effect',
    fields: Object.freeze({ contribution: 'object', revision: 'number', controller: 'object' }),
  }),
  resolve: 'conflict',
  binding: 'run',
  onError: 'the call is answered as the failure its contract names',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: null,
  summary: 'The protocols the entry serves: one item is one protocol with its handlers.',
})

export type ProtocolItem = Readonly<{
  contribution: AccessContribution<ProtocolContract>
  revision: number
  controller: AbortController
}>

/** The books of the calls in flight; every call is pinned to the instance that took it. */
export type Calls = Readonly<{ ledger: Ledger; serial: number }>

export const noCalls: Calls = Object.freeze({ ledger: noLedger, serial: 0 })

export type Enter =
  | Readonly<{
      kind: 'entered'
      calls: Calls
      call: string
      instance: Instance
      item: ProtocolItem
      member: Entered['member']
    }>
  | Readonly<{ kind: 'not-mounted' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'not-offered' }>
  | Readonly<{ kind: 'conflict'; by: readonly Instance[] }>

export type Open = Readonly<{
  protocols: readonly Readonly<{
    key: string
    name: string
    major: number
    revision: number
    contract: ProtocolContract
  }>[]
  conflicts: readonly Readonly<{ key: string; name: string; major: number }>[]
}>

export const keyOf = (protocol: Readonly<{ name: string; major: number }>): string =>
  `${protocol.name}/v${protocol.major}`

export function protocolItem(contribution: AccessContribution<ProtocolContract>): ProtocolItem {
  return {
    contribution,
    revision: revisionOf(contribution.protocol),
    controller: new AbortController(),
  }
}

/** The digest names the instance: two instances with one protocol are two items, never one. */
export function entryOf(
  contribution: AccessContribution<ProtocolContract>,
  instance: Instance,
): Entry<ProtocolItem> {
  const key = keyOf(contribution.protocol)
  return {
    point: PROTOCOLS,
    key,
    id: '',
    scope: [],
    rank: 0,
    digest: `${key}@${instance.fiber}#${instance.generation}`,
    item: protocolItem(contribution),
    lock: true,
  }
}

const byFiber = (left: Instance, right: Instance): number =>
  left.fiber === right.fiber
    ? left.generation - right.generation
    : left.fiber < right.fiber
      ? -1
      : 1

/** Takes the protocol as it stands now and pins the call to the instance that serves it. */
export function enter(
  registry: Registry,
  calls: Calls,
  key: string,
  name: string,
  scope: Scope = [],
): Enter {
  const answer = ask<ProtocolItem>(registry, PROTOCOLS, key, scope)
  if (answer.kind === 'conflict')
    return { kind: 'conflict', by: answer.entries.map(entry => entry.instance).sort(byFiber) }
  // The point cannot be read: that is not the same as nothing being on it.
  if (answer.kind === 'unavailable') return { kind: 'unavailable' }
  if (answer.kind !== 'one') return { kind: 'not-mounted' }
  const { instance, item } = answer.entry
  const member = memberOf(item.contribution, name)
  if (member === undefined) return { kind: 'not-offered' }
  const serial = calls.serial + 1
  const call = `${key}#${serial}`
  const admitted = admit(registry, calls.ledger, instance, call)
  if (admitted.kind !== 'admitted') return { kind: 'not-mounted' }
  return {
    kind: 'entered',
    calls: { ledger: admitted.ledger, serial },
    call,
    instance,
    item,
    member,
  }
}

export function leave(calls: Calls, call: string): Calls {
  const moved = finish(calls.ledger, call)
  if (moved.kind !== 'moved' || moved.ledger === calls.ledger) return calls
  return { ledger: settled(moved.ledger), serial: calls.serial }
}

/** Whether this instance still runs a call of this protocol: its withdrawal waits for that. */
export function busy(calls: Calls, instance: Instance, key: string): boolean {
  return calls.ledger.calls.some(
    call =>
      call.state === 'running' &&
      call.instance.fiber === instance.fiber &&
      call.instance.generation === instance.generation &&
      call.id.startsWith(`${key}#`),
  )
}

/** What the entry serves now, and the protocols that two instances hold at once; nothing when unread. */
export function open(registry: Registry): Open | undefined {
  const listing = list<ProtocolItem>(registry, PROTOCOLS, null, [])
  if (listing.kind !== 'read') return undefined
  const named = ({ key, item }: Entry<ProtocolItem>) => {
    const { name, major } = item.contribution.protocol
    return { key, name, major }
  }
  return {
    protocols: listing.items.map(({ entry }) => ({
      ...named(entry),
      revision: entry.item.revision,
      contract: entry.item.contribution.protocol,
    })),
    conflicts: listing.conflicts.map(([first]) => named(first as Entry<ProtocolItem>)),
  }
}
