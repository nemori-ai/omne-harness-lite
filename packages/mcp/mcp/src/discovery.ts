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
  sameJson,
  type ActionCatalogRecord,
  type ActionDiscovery,
  type CatalogState,
  type CatalogView,
  type EndpointRef,
  type Generation,
  type McpClock,
  type McpConfig,
  type McpPorts,
  type OperationFailure,
  type PeerIdentity,
  type ReadFailure,
  type RefreshResult,
  type Refusal,
} from '@omne-harness/mcp-contract'
import type { ListingPage, TransportFailure } from '@omne-harness/mcp-contract/provider'
import { admitForUse, stillAdmitted, type UseGate } from './internal/guard.ts'
import { connectionFailureOf, lostOfNotSent, type NotSent } from './internal/lost.ts'
import { ask, within } from './internal/port.ts'
import { readAccountOf } from './internal/settings.ts'
import type { CatalogMark, ConnectionTable, Ensured } from './internal/table.ts'

/** The refresh request of the contract: the caller's signal belongs to this refresh alone (S5). */
type RefreshRequest = Parameters<ActionDiscovery<unknown>['refresh']>[1]

export type DiscoveryDependencies<P, S> = Readonly<{
  ports: McpPorts<P, S>
  config: McpConfig<P>
  table: ConnectionTable<P>
  /** The clock that stamps the time a listing is acquired at (SPEC S3): `McpPorts.clock` or the host's. */
  clock: McpClock
}>

const SUPERSEDED: RefreshResult = { kind: 'kept', reason: { kind: 'superseded' } }
const CANCELLED: RefreshResult = { kind: 'kept', reason: { kind: 'cancelled' } }
const UNKNOWN: Refusal = { kind: 'unknown' }
const ABANDONED: TransportFailure = { kind: 'no-answer', cause: 'abandoned' }

/**
 * What a connection failure's catalog marking means for `refresh` (SPEC S5). A mark still
 * `pending` at the build's bound leaves the failure itself as the answer.
 */
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
    case 'pending':
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

export function createDiscovery<P, S>(deps: DiscoveryDependencies<P, S>): ActionDiscovery<P> {
  const { ports, config, table } = deps
  const { scope, startBound } = table.runtime
  const gate: UseGate<P, S> = { ports, table }

  /**
   * Reads pages until the last one, a failed one, or the page bound, under the listing bound of
   * invariant 5. A page the bound cuts off is a page without an answer, and so is a `listActions`
   * that breaches its contract (contract T9); an abort of the caller ends the listing as cancelled.
   */
  async function listPages(
    ensured: Ensured,
    signal: AbortSignal | undefined,
  ): Promise<Pages | 'cancelled'> {
    const bound = startBound(ensured.bound, 'listing')
    const limit = signal === undefined ? bound : AbortSignal.any([signal, bound])
    const pages: Outcome<ListingPage, TransportFailure>[] = []
    let cursor: string | undefined
    for (let count = 0; count < config.maxListingPages; count += 1) {
      const page = ask(() => ensured.transport.listActions(cursor), fail(ABANDONED))
      const asked = await within(page, limit, scope)
      if (asked.kind === 'expired') {
        if (signal?.aborted === true) return 'cancelled'
        pages.push({ failure: ABANDONED })
        break
      }
      const answered = asked.value
      pages.push(answered)
      if ('failure' in answered || answered.ok.nextCursor === undefined) break
      cursor = answered.ok.nextCursor
    }
    return pages
  }

  /** A page the transport could not send: the connection is gone (S5, S7). */
  async function pageNotSent(
    ensured: Ensured,
    failure: NotSent,
  ): Promise<Outcome<RefreshResult, OperationFailure>> {
    const { connection, generation } = ensured
    const lost = lostOfNotSent(failure)
    const catalog = await table.lose(connection, generation, lost.reason, lost.mark)
    return afterMarking(connectionFailureOf(failure), catalog)
  }

  async function publish(
    access: Access<P>,
    request: RefreshRequest,
    ensured: Ensured,
  ): Promise<Outcome<RefreshResult, OperationFailure>> {
    const { generation, connection, peer, catalogKey } = ensured
    // A store that breaches is unavailable (SPEC MC-15): `unknown`.
    const read = await ask(() => ports.store.read(catalogKey), fail('unavailable'))
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
      acquiredAt: deps.clock.now().toISOString(),
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
    const written = await ask(
      () => ports.store.write(catalogKey, merged.ok, basedOn),
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
    const asked = await within(table.ensure(admitted.ok, access, options), request.signal, scope)
    if (asked.kind === 'expired') return succeed(CANCELLED)
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
    const key = catalogKeyOf(access.tenant, admitted.ok, account.ok)
    const read = await ask(() => ports.store.read(key), fail('unavailable'))
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
