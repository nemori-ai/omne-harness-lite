import type { JsonValue } from '@omne-harness/json-text'
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  subscriptionArgumentsText,
  type EndpointRef,
  type EventsConfig,
  type EventType,
  type McpPorts,
  type Millis,
  type PeerAccount,
  type SubscribeFailure,
} from '@omne-harness/mcp-contract'
import type { EventRecords, SubscriptionKey } from '@omne-harness/mcp-contract/provider'
import type { SubscriptionsDependencies } from '../subscriptions.ts'
import type { AdmittedEndpoint } from './gate.ts'
import { admitForUse, type UseGate } from './guard.ts'
import { ask } from './port.ts'
import { receive, type Ready } from './receiver.ts'
import { readAccountOf } from './settings.ts'
import { ensureOptionsOf, type Ensured } from './table.ts'
import { tenantTextOf } from './text.ts'

type Receiver<P> = {
  access: Access<P>
  ref: EndpointRef
  connectBound: Millis | undefined
  readonly stop: AbortController
}

export type Prepared<P> = Readonly<{
  records: EventRecords
  bounds: EventsConfig
  access: Access<P>
  account: PeerAccount
  holding: SubscriptionKey['holding']
  connectBound: Millis | undefined
}>

export const UNKNOWN = { kind: 'unknown' } as const

const keyText = (key: SubscriptionKey): string =>
  JSON.stringify([
    tenantTextOf(key.tenant),
    key.holding,
    JSON.stringify(key.account),
    key.name,
    key.arguments,
  ])

async function typesOf(store: McpPorts<unknown, unknown>['eventStore'], ensured: Ensured) {
  if (store === undefined) return fail(UNKNOWN)
  const read = await ask(() => store.read(ensured.catalogKey), fail('unavailable' as const))
  return 'failure' in read ? fail(UNKNOWN) : succeed(read.ok)
}

async function allowedFor<P, S>(gate: UseGate<P, S>, receiver: Receiver<P>) {
  const now = await admitForUse(gate, receiver.access, receiver.ref)
  if ('ok' in now) return 'yes' as const
  const { kind } = now.failure
  return kind === 'not-available-to-you' || kind === 'blocked'
    ? ('no' as const)
    : ('unknown' as const)
}

/** How a subscription reaches its peer: the endpoint admitted for the person, its connection, its event type, its receiver. */
export function createSubscriptionLinks<P, S>(deps: SubscriptionsDependencies<P, S>) {
  const { ports, config, table, clock, changes, eventTypes, pause, timer } = deps
  const gate: UseGate<P, S> = { ports, table }
  const receivers = new Map<string, Receiver<P>>()
  let closed = false

  async function prepare(access: Access<P>, ref: EndpointRef, connectBound?: Millis) {
    const records = ports.eventRecords
    const bounds = config.events
    if (records === undefined || bounds === undefined || closed) return fail(UNKNOWN)
    const admitted = await admitForUse(gate, access, ref)
    if ('failure' in admitted) return admitted
    const account = readAccountOf(admitted.ok)
    if ('failure' in account) return account
    const prepared: Prepared<P> = {
      records,
      bounds,
      access,
      account: account.ok,
      holding: admitted.ok.ref.holding,
      connectBound,
    }
    return succeed({ prepared, admitted: admitted.ok })
  }

  const keyOf = (prepared: Prepared<P>, name: string, args: JsonValue): SubscriptionKey => ({
    tenant: prepared.access.tenant,
    holding: prepared.holding,
    account: prepared.account,
    name,
    arguments: subscriptionArgumentsText(args),
  })

  const typesIn = (ensured: Ensured) => typesOf(ports.eventStore, ensured)

  async function ensureOn(
    admitted: AdmittedEndpoint,
    access: Access<P>,
    connectBound: Millis | undefined,
  ) {
    const ensured = await table.ensure(admitted, access, ensureOptionsOf(connectBound))
    if ('ok' in ensured) return ensured
    const { reason } = ensured.failure
    return fail(reason.kind === 'effect-unknown' ? UNKNOWN : reason)
  }

  async function ensuredFor(receiver: Receiver<P>) {
    const admitted = await admitForUse(gate, receiver.access, receiver.ref)
    return 'failure' in admitted
      ? admitted
      : ensureOn(admitted.ok, receiver.access, receiver.connectBound)
  }

  async function typeFor(
    prepared: Prepared<P>,
    admitted: AdmittedEndpoint,
    name: string,
  ): Promise<Outcome<EventType, SubscribeFailure>> {
    const { access } = prepared
    const ensured = await ensureOn(admitted, access, prepared.connectBound)
    if ('failure' in ensured) return ensured
    let catalog = await typesIn(ensured.ok)
    if ('ok' in catalog && catalog.ok === 'absent') {
      await eventTypes.publish(ensured.ok, access)
      catalog = await typesIn(ensured.ok)
    }
    if ('failure' in catalog) return catalog
    if (catalog.ok === 'absent' || !catalog.ok.declared)
      return fail({ kind: 'not-subscribable', reason: 'no-events' })
    const type = catalog.ok.types.find(each => each.name === name)
    return type === undefined
      ? fail({ kind: 'not-subscribable', reason: 'no-such-type' })
      : succeed(type)
  }

  async function ready(receiver: Receiver<P>, key: SubscriptionKey): Promise<Ready> {
    const ensured = await ensuredFor(receiver)
    if ('failure' in ensured) {
      const { kind } = ensured.failure
      return kind === 'not-available-to-you' || kind === 'blocked'
        ? { kind: 'ended', reason: 'unavailable' }
        : { kind: 'waiting' }
    }
    if (JSON.stringify(ensured.ok.catalogKey.account) !== JSON.stringify(key.account))
      return { kind: 'ended', reason: 'unavailable' }
    const wire = ensured.ok.wire()
    const catalog = await typesIn(ensured.ok)
    if ('failure' in wire || 'failure' in catalog) return { kind: 'waiting' }
    const type =
      catalog.ok === 'absent' ? undefined : catalog.ok.types.find(each => each.name === key.name)
    if (type === undefined) return { kind: 'ended', reason: 'type-gone' }
    const refetch = () => eventTypes.publish(ensured.ok, receiver.access)
    const allowed = () => allowedFor(gate, receiver)
    return { kind: 'ready', transport: wire.ok, type, refetch, allowed }
  }

  /** A standing subscription is received by whoever touched it last; a restart takes it up again at the next touch. */
  function resume(prepared: Prepared<P>, ref: EndpointRef, key: SubscriptionKey, fresh: boolean) {
    const text = keyText(key)
    const running = receivers.get(text)
    if (running !== undefined) {
      running.access = prepared.access
      running.ref = ref
      running.connectBound = prepared.connectBound ?? running.connectBound
      return
    }
    const receiver: Receiver<P> = {
      access: prepared.access,
      ref,
      connectBound: prepared.connectBound,
      stop: new AbortController(),
    }
    receivers.set(text, receiver)
    const work = receive({
      key,
      records: prepared.records,
      bounds: prepared.bounds,
      clock,
      pause,
      timer,
      signal: receiver.stop.signal,
      fresh,
      ready: () => ready(receiver, key),
      changed: () => changes.changed(key.tenant, 'events'),
    })
      .catch(() => undefined)
      .finally(() => {
        if (receivers.get(text) === receiver) receivers.delete(text)
      })
    table.runtime.scope.spawn(work)
  }

  function stopReceiving(key: SubscriptionKey): void {
    const text = keyText(key)
    receivers.get(text)?.stop.abort()
    receivers.delete(text)
  }

  function close(): void {
    closed = true
    for (const receiver of receivers.values()) receiver.stop.abort()
    receivers.clear()
  }

  return { prepare, keyOf, typeFor, resume, stopReceiving, close }
}
