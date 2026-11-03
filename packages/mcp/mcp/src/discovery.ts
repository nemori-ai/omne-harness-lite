// The read port `ActionDiscovery` (SPEC S5, S8): `refresh` discovers and publishes a whole
// listing under the publish boundary; `current` and `peer` answer from the store and the
// connection table and never connect.
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  catalogKeyOf,
  completeListing,
  connectionKeyOf,
  mergeListing,
  type ActionCatalogRecord,
  type ActionDiscovery,
  type CatalogState,
  type CatalogView,
  type EndpointRef,
  type Generation,
  type McpConfig,
  type McpPorts,
  type Millis,
  type OperationFailure,
  type PeerIdentity,
  type ReadFailure,
  type RefreshResult,
  type Refusal,
} from '@omne-harness/mcp-contract'
import type {
  ListingPage,
  McpTransport,
  TransportFailure,
} from '@omne-harness/mcp-contract/provider'
import { sameJson } from './internal/canonical.ts'
import type { Connection } from './internal/connection.ts'
import { admitForUse, stillEligible, type UseGate } from './internal/guard.ts'
import { readAccountOf } from './internal/settings.ts'
import type { CatalogMark, ConnectionTable, Ensured } from './internal/table.ts'

/**
 * The refresh request, with the abort signal that the publish boundary checks (S5 `cancelled`).
 * The contract's request has no signal; this member accepts one in addition.
 */
export type RefreshRequest = Readonly<{
  ref: EndpointRef
  connectBound?: Millis
  signal?: AbortSignal
}>

export interface McpDiscovery<P> extends ActionDiscovery<P> {
  refresh(
    access: Access<P>,
    request: RefreshRequest,
  ): Promise<Outcome<RefreshResult, OperationFailure>>
}

export type DiscoveryDependencies<P, S> = Readonly<{
  ports: McpPorts<P, S>
  config: McpConfig<P>
  table: ConnectionTable<P>
  /** The time a listing is acquired at; a listing's freshness carries it. */
  now: () => Date
}>

const SUPERSEDED: RefreshResult = { kind: 'kept', reason: { kind: 'superseded' } }
const CANCELLED: RefreshResult = { kind: 'kept', reason: { kind: 'cancelled' } }
const UNKNOWN: Refusal = { kind: 'unknown' }

/** What a connection failure's catalog marking means for `refresh` (SPEC S5). */
function afterMarking(
  reason: OperationFailure,
  catalog: CatalogMark,
): Outcome<RefreshResult, OperationFailure> {
  if (catalog === 'revision-conflict') return succeed(SUPERSEDED)
  if (catalog === 'unavailable') return fail(UNKNOWN)
  return fail(reason)
}

function stateOf(record: ActionCatalogRecord | 'absent'): CatalogState {
  return record === 'absent' ? { kind: 'not-acquired' } : { kind: 'acquired', record }
}

export function createDiscovery<P, S>(deps: DiscoveryDependencies<P, S>): McpDiscovery<P> {
  const { ports, config, table } = deps
  const gate: UseGate<P, S> = { ports, table }

  /** Reads pages until the last one, a failed one, or the page bound. */
  async function listPages(
    transport: McpTransport,
  ): Promise<readonly Outcome<ListingPage, TransportFailure>[]> {
    const pages: Outcome<ListingPage, TransportFailure>[] = []
    let cursor: string | undefined
    for (let count = 0; count < config.maxListingPages; count += 1) {
      const page = await transport.listActions(cursor)
      pages.push(page)
      if ('failure' in page || page.ok.nextCursor === undefined) break
      cursor = page.ok.nextCursor
    }
    return pages
  }

  /** A page the transport could not send: the connection is gone (S5). */
  async function pageNotSent(
    connection: Connection,
    failure: Extract<TransportFailure, { kind: 'not-sent' }>,
  ): Promise<Outcome<RefreshResult, OperationFailure>> {
    if (failure.cause === 'authorization-required') {
      const catalog = await table.lose(
        connection,
        'authorization-required',
        'authorization-required',
      )
      return afterMarking({ kind: 'authorization-required', discovery: failure.discovery }, catalog)
    }
    const catalog = await table.lose(connection, 'stream-broken', 'connection-unavailable')
    return afterMarking({ kind: 'connection-unavailable' }, catalog)
  }

  /** The non-call request outcome on the connection state: degrade on a failed page, else recover. */
  function settleConnection(
    connection: Connection,
    generation: Generation,
    pageFailed: boolean,
  ): void {
    if (!connection.isCurrent(generation)) return
    const peer = connection.peer
    if (pageFailed && connection.state.kind === 'ready') connection.degrade('list-failed')
    if (!pageFailed && connection.state.kind === 'degraded' && peer !== undefined)
      connection.ready(peer)
  }

  async function publish(
    access: Access<P>,
    request: RefreshRequest,
    ensured: Ensured,
  ): Promise<Outcome<RefreshResult, OperationFailure>> {
    const { transport, generation, connection, peer, catalogKey } = ensured
    const read = await ports.store.read(catalogKey)
    if ('failure' in read) return fail(UNKNOWN)
    const current = stateOf(read.ok)
    const basedOn = read.ok === 'absent' ? 'absent' : read.ok.revision
    const pages = await listPages(transport)
    const notSent = pages.flatMap(page =>
      'failure' in page && page.failure.kind === 'not-sent' ? [page.failure] : [],
    )
    const [first] = notSent
    if (first !== undefined) return pageNotSent(connection, first)
    const listing = completeListing({
      pages,
      basis: { generation, protocolVersion: peer.protocolVersion, capabilities: peer.capabilities },
      acquiredAt: deps.now().toISOString(),
      limits: { maxPages: config.maxListingPages, maxActions: config.maxActions },
      basedOn,
    })
    settleConnection(
      connection,
      generation,
      'failure' in listing && listing.failure === 'page-failed',
    )
    if ('failure' in listing)
      return succeed({
        kind: 'kept',
        reason: { kind: 'listing-incomplete', defect: listing.failure },
      })
    const merged = mergeListing(current, listing.ok)
    if ('failure' in merged) return succeed(SUPERSEDED)
    // The publish boundary: the producing connection is still current, the refresh was not
    // cancelled, and the principal is still eligible. Only then is the record written.
    if (!connection.isCurrent(generation)) return succeed(SUPERSEDED)
    if (request.signal?.aborted === true) return succeed(CANCELLED)
    const eligible = await stillEligible(gate, access, request.ref)
    if ('failure' in eligible) return eligible
    const written = await ports.store.write(catalogKey, merged.ok, basedOn)
    if ('failure' in written)
      return written.failure === 'revision-conflict' ? succeed(SUPERSEDED) : fail(UNKNOWN)
    return succeed({ kind: 'published', revision: merged.ok.revision })
  }

  async function refresh(
    access: Access<P>,
    request: RefreshRequest,
  ): Promise<Outcome<RefreshResult, OperationFailure>> {
    const admitted = await admitForUse(gate, access, request.ref)
    if ('failure' in admitted) return admitted
    const ensured = await table.ensure(admitted.ok, access, {
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      ...(request.connectBound === undefined ? {} : { connectBound: request.connectBound }),
    })
    if ('failure' in ensured) return afterMarking(ensured.failure.reason, ensured.failure.catalog)
    return publish(access, request, ensured.ok)
  }

  function basisCurrent(
    record: ActionCatalogRecord,
    connected: Ensured | undefined,
  ): Extract<CatalogView, { kind: 'acquired' }>['basisCurrent'] {
    if (connected === undefined) return 'no-connection'
    const fits =
      record.basis.protocolVersion === connected.peer.protocolVersion &&
      sameJson(record.basis.capabilities, connected.peer.capabilities)
    return fits ? 'matches' : 'differs'
  }

  async function current(
    access: Access<P>,
    ref: EndpointRef,
  ): Promise<Outcome<CatalogView, ReadFailure>> {
    const admitted = await admitForUse(gate, access, ref)
    if ('failure' in admitted) return admitted
    const account = readAccountOf(admitted.ok)
    if ('failure' in account) return account
    const read = await ports.store.read(
      catalogKeyOf(access.tenant, admitted.ok, account.ok.account),
    )
    if ('failure' in read) return fail(UNKNOWN)
    if (read.ok === 'absent') return succeed({ kind: 'not-acquired' })
    const record = read.ok
    const connected = table.current(connectionKeyOf(access.tenant, admitted.ok, account.ok.account))
    return succeed({
      kind: 'acquired',
      revision: record.revision,
      basis: record.basis,
      freshness: record.freshness,
      basisCurrent: basisCurrent(record, connected),
      actions: record.actions,
    })
  }

  async function peer(
    access: Access<P>,
    ref: EndpointRef,
  ): Promise<
    Outcome<
      Readonly<{ peer: PeerIdentity; generation: Generation }>,
      ReadFailure | Readonly<{ kind: 'not-connected' }>
    >
  > {
    const admitted = await admitForUse(gate, access, ref)
    if ('failure' in admitted) return admitted
    const account = readAccountOf(admitted.ok)
    if ('failure' in account) return account
    const connected = table.current(connectionKeyOf(access.tenant, admitted.ok, account.ok.account))
    if (connected === undefined) return fail({ kind: 'not-connected' })
    return succeed({ peer: connected.peer, generation: connected.generation })
  }

  return { refresh, current, peer }
}
