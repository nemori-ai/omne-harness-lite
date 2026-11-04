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
import type { ListingPage, TransportFailure } from '@omne-harness/mcp-contract/provider'
import { answerOf, untilAborted } from './internal/abort.ts'
import { sameJson } from './internal/canonical.ts'
import { admitForUse, stillAdmitted, type UseGate } from './internal/guard.ts'
import { readAccountOf } from './internal/settings.ts'
import type { CatalogMark, ConnectionTable, Ensured } from './internal/table.ts'

/**
 * The refresh request, with the abort signal of the caller. The contract's request has no
 * signal; this member accepts one in addition (SPEC deviation table). An abort makes the refresh
 * answer `kept` (`cancelled`); it does not stop a build that other callers share.
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
const ABANDONED: TransportFailure = { kind: 'no-answer', cause: 'abandoned' }

/** What a connection failure's catalog marking means for `refresh` (SPEC S5). */
function afterMarking(
  reason: OperationFailure,
  catalog: CatalogMark | 'not-current',
): Outcome<RefreshResult, OperationFailure> {
  switch (catalog) {
    case 'revision-conflict':
    case 'not-current':
      return succeed(SUPERSEDED)
    case 'unavailable':
      return fail(UNKNOWN)
    case 'marked':
    case 'not-acquired':
      return fail(reason)
    default: {
      const exhaustive: never = catalog
      return exhaustive
    }
  }
}

function stateOf(record: ActionCatalogRecord | 'absent'): CatalogState {
  return record === 'absent' ? { kind: 'not-acquired' } : { kind: 'acquired', record }
}

type Pages = readonly Outcome<ListingPage, TransportFailure>[]

export function createDiscovery<P, S>(deps: DiscoveryDependencies<P, S>): McpDiscovery<P> {
  const { ports, config, table } = deps
  const gate: UseGate<P, S> = { ports, table }

  /**
   * Reads pages until the last one, a failed one, or the page bound, under the listing bound of
   * invariant 5. A page the bound cuts off is a page without an answer; an abort of the caller
   * ends the listing as cancelled.
   */
  async function listPages(
    ensured: Ensured,
    signal: AbortSignal | undefined,
  ): Promise<Pages | 'cancelled'> {
    const bound = AbortSignal.timeout(ensured.bound)
    const limit = signal === undefined ? bound : AbortSignal.any([signal, bound])
    const pages: Outcome<ListingPage, TransportFailure>[] = []
    let cursor: string | undefined
    for (let count = 0; count < config.maxListingPages; count += 1) {
      const asked = await untilAborted(ensured.transport.listActions(cursor), limit)
      if (asked.kind === 'aborted') {
        if (signal?.aborted === true) return 'cancelled'
        pages.push({ failure: ABANDONED })
        break
      }
      const page = asked.value
      pages.push(page)
      if ('failure' in page || page.ok.nextCursor === undefined) break
      cursor = page.ok.nextCursor
    }
    return pages
  }

  /** A page the transport could not send: the connection is gone (S5). */
  async function pageNotSent(
    ensured: Ensured,
    failure: Extract<TransportFailure, { kind: 'not-sent' }>,
  ): Promise<Outcome<RefreshResult, OperationFailure>> {
    const { connection, generation } = ensured
    if (failure.cause === 'authorization-required') {
      const catalog = await table.lose(
        connection,
        generation,
        'authorization-required',
        'authorization-required',
      )
      return afterMarking({ kind: 'authorization-required', discovery: failure.discovery }, catalog)
    }
    const catalog = await table.lose(
      connection,
      generation,
      'stream-broken',
      'connection-unavailable',
    )
    return afterMarking({ kind: 'connection-unavailable' }, catalog)
  }

  async function publish(
    access: Access<P>,
    request: RefreshRequest,
    ensured: Ensured,
  ): Promise<Outcome<RefreshResult, OperationFailure>> {
    const { generation, connection, peer, catalogKey } = ensured
    // A store that rejects instead of answering is unavailable (SPEC decision 4): `unknown`.
    const read = await answerOf(ports.store.read(catalogKey), fail('unavailable'))
    if ('failure' in read) return fail(UNKNOWN)
    const current = stateOf(read.ok)
    const basedOn = read.ok === 'absent' ? 'absent' : read.ok.revision
    const pages = await listPages(ensured, request.signal)
    if (pages === 'cancelled') return succeed(CANCELLED)
    const [notSent] = pages.flatMap(page =>
      'failure' in page && page.failure.kind === 'not-sent' ? [page.failure] : [],
    )
    if (notSent !== undefined) return pageNotSent(ensured, notSent)
    const listing = completeListing({
      pages,
      basis: { generation, protocolVersion: peer.protocolVersion, capabilities: peer.capabilities },
      acquiredAt: deps.now().toISOString(),
      limits: { maxPages: config.maxListingPages, maxActions: config.maxActions },
      basedOn,
    })
    const pageFailed = 'failure' in listing && listing.failure === 'page-failed'
    table.settle(connection, generation, pageFailed ? 'page-failed' : 'listed')
    if ('failure' in listing)
      return succeed({
        kind: 'kept',
        reason: { kind: 'listing-incomplete', defect: listing.failure },
      })
    const merged = mergeListing(current, listing.ok)
    if ('failure' in merged) return succeed(SUPERSEDED)
    // The publish boundary. The asynchronous check (eligibility and adoption revision) comes
    // first; the synchronous checks (producing connection still current, not cancelled) sit
    // right before the write, so nothing can slip between them and it.
    const admitted = await stillAdmitted(gate, access, request.ref, ensured.adoptionRevision)
    if ('failure' in admitted) return admitted
    if (admitted.ok === 'superseded') return succeed(SUPERSEDED)
    if (!connection.isCurrent(generation)) return succeed(SUPERSEDED)
    if (request.signal?.aborted === true) return succeed(CANCELLED)
    const written = await answerOf(
      ports.store.write(catalogKey, merged.ok, basedOn),
      fail('unavailable'),
    )
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
    // The build is shared by every caller of the key and bounded by the connection bound; the
    // caller's abort ends only this refresh.
    const options = request.connectBound === undefined ? {} : { connectBound: request.connectBound }
    const asked = await untilAborted(table.ensure(admitted.ok, access, options), request.signal)
    if (asked.kind === 'aborted') return succeed(CANCELLED)
    const ensured = asked.value
    if ('failure' in ensured)
      return ensured.failure.stage === 'settings'
        ? fail(ensured.failure.reason)
        : afterMarking(ensured.failure.reason, ensured.failure.catalog)
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
    const read = await answerOf(
      ports.store.read(catalogKeyOf(access.tenant, admitted.ok, account.ok)),
      fail('unavailable'),
    )
    if ('failure' in read) return fail(UNKNOWN)
    if (read.ok === 'absent') return succeed({ kind: 'not-acquired' })
    const record = read.ok
    const connected = table.current(connectionKeyOf(access.tenant, admitted.ok, account.ok))
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
    const connected = table.current(connectionKeyOf(access.tenant, admitted.ok, account.ok))
    if (connected === undefined) return fail({ kind: 'not-connected' })
    return succeed({ peer: connected.peer, generation: connected.generation })
  }

  return { refresh, current, peer }
}
