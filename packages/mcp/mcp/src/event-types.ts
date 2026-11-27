import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  catalogKeyOf,
  declaresEvents,
  readEventType,
  type CatalogRevision,
  type EndpointRef,
  type EventCatalogRecord,
  type EventCatalogView,
  type EventType,
  type McpClock,
  type McpConfig,
  type McpPorts,
  type ReadFailure,
} from '@omne-harness/mcp-contract'
import type { EventListingPage, TransportFailure } from '@omne-harness/mcp-contract/provider'
import type { ChangeFeed } from './internal/changes.ts'
import { admitForUse, type UseGate } from './internal/guard.ts'
import { ask, within } from './internal/port.ts'
import { readAccountOf } from './internal/settings.ts'
import type { ConnectionTable, Ensured } from './internal/table.ts'

export type EventTypesDependencies<P, S> = Readonly<{
  ports: McpPorts<P, S>
  config: McpConfig<P>
  table: ConnectionTable<P>
  clock: McpClock
  changes: ChangeFeed
}>

export type EventTypes<P> = Readonly<{
  publish(ensured: Ensured, access: Access<P>): Promise<void>
  view(access: Access<P>, ref: EndpointRef): Promise<Outcome<EventCatalogView, ReadFailure>>
}>

const ABANDONED: TransportFailure = { kind: 'no-answer', cause: 'abandoned' }

/** The event types of a peer, taken whole with each published catalog of actions; a listing not taken whole keeps the last one. */
export function createEventTypes<P, S>(deps: EventTypesDependencies<P, S>): EventTypes<P> {
  const { ports, config, table, clock, changes } = deps
  const { scope, startBound } = table.runtime
  const gate: UseGate<P, S> = { ports, table }

  async function listed(ensured: Ensured): Promise<readonly EventType[] | undefined> {
    const bound = startBound(ensured.bound, 'listing')
    const types: EventType[] = []
    let cursor: string | undefined
    for (let count = 0; count < config.maxListingPages; count += 1) {
      const wire = ensured.wire()
      if ('failure' in wire) return undefined
      const transport = wire.ok
      if (transport.listEventTypes === undefined) return undefined
      const page = ask(
        (): Promise<Outcome<EventListingPage, TransportFailure>> =>
          transport.listEventTypes?.(cursor) ?? Promise.resolve(fail(ABANDONED)),
        fail(ABANDONED),
      )
      const asked = await within(page, bound, scope)
      if (asked.kind === 'expired' || 'failure' in asked.value) return undefined
      for (const json of asked.value.ok.events) {
        const read = readEventType(json)
        if ('ok' in read) types.push(read.ok)
      }
      if (asked.value.ok.nextCursor === undefined) return types
      cursor = asked.value.ok.nextCursor
    }
    return undefined
  }

  async function publish(ensured: Ensured, access: Access<P>): Promise<void> {
    const store = ports.eventStore
    if (store === undefined) return
    const stored = await ask(() => store.read(ensured.catalogKey), fail('unavailable'))
    if ('failure' in stored) return
    const declared = declaresEvents(ensured.peer)
    if (!declared && stored.ok !== 'absent' && !stored.ok.declared) return
    const types = declared ? await listed(ensured) : []
    if (types === undefined) return
    const basedOn = stored.ok === 'absent' ? 'absent' : stored.ok.revision
    const record: EventCatalogRecord = {
      revision: ((basedOn === 'absent' ? 0 : basedOn) + 1) as CatalogRevision,
      basis: {
        generation: ensured.generation,
        protocolVersion: ensured.peer.protocolVersion,
        capabilities: ensured.peer.capabilities,
      },
      freshness: { acquiredAt: clock.now().toISOString(), changedNotified: false },
      declared,
      types,
    }
    const written = await ask(
      () => store.write(ensured.catalogKey, record, basedOn),
      fail('unavailable'),
    )
    if ('ok' in written) changes.changed(access.tenant)
  }

  async function view(
    access: Access<P>,
    ref: EndpointRef,
  ): Promise<Outcome<EventCatalogView, ReadFailure>> {
    const admitted = await admitForUse(gate, access, ref)
    if ('failure' in admitted) return admitted
    const account = readAccountOf(admitted.ok)
    if ('failure' in account) return account
    const store = ports.eventStore
    if (store === undefined) return succeed({ kind: 'not-acquired' })
    const key = catalogKeyOf(access.tenant, admitted.ok, account.ok)
    const read = await ask(() => store.read(key), fail('unavailable'))
    if ('failure' in read) return fail({ kind: 'unknown' })
    if (read.ok === 'absent') return succeed({ kind: 'not-acquired' })
    const { revision, freshness, declared, types } = read.ok
    return succeed(
      declared
        ? { kind: 'acquired', revision, freshness, types }
        : { kind: 'not-declared', freshness },
    )
  }

  return { publish, view }
}
