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
  type CatalogRevision,
  type CatalogState,
  type CatalogView,
  type ConnectionFailure,
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
import { CONNECTION_UNAVAILABLE } from './internal/entry.ts'
import { admitForUse, stillAdmitted, type UseGate } from './internal/guard.ts'
import { connectionFailureOf, loseOn, lostOf, type Lost } from './internal/lost.ts'
import { ask, within } from './internal/port.ts'
import { readAccountOf } from './internal/settings.ts'
import {
  ensureOptionsOf,
  type CatalogMark,
  type ConnectionTable,
  type Ensured,
} from './internal/table.ts'

type RefreshRequest = Parameters<ActionDiscovery<unknown>['refresh']>[1]

export type DiscoveryDependencies<P, S> = Readonly<{
  ports: McpPorts<P, S>
  config: McpConfig<P>
  table: ConnectionTable<P>
  clock: McpClock
}>

const SUPERSEDED: RefreshResult = { kind: 'kept', reason: { kind: 'superseded' } }
const CANCELLED: RefreshResult = { kind: 'kept', reason: { kind: 'cancelled' } }
const UNKNOWN: Refusal = { kind: 'unknown' }
const ABANDONED: TransportFailure = { kind: 'no-answer', cause: 'abandoned' }

const SHUT = 'shut'
type Shut = typeof SHUT

type Refreshed = Outcome<RefreshResult, OperationFailure>

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

type LostPage = Readonly<{ lost: Lost; reason: ConnectionFailure }>

function lostPageOf(page: Outcome<ListingPage, TransportFailure>): readonly LostPage[] {
  if (!('failure' in page)) return []
  const { failure } = page
  const lost = lostOf(failure)
  if (lost === undefined) return []
  const reason = failure.kind === 'not-sent' ? connectionFailureOf(failure) : CONNECTION_UNAVAILABLE
  return [{ lost, reason }]
}

export function createDiscovery<P, S>(deps: DiscoveryDependencies<P, S>): ActionDiscovery<P> {
  const { ports, config, table } = deps
  const { scope, startBound } = table.runtime
  const gate: UseGate<P, S> = { ports, table }

  async function listPages(
    ensured: Ensured,
    signal: AbortSignal | undefined,
  ): Promise<Pages | 'cancelled'> {
    const bound = startBound(ensured.bound, 'listing')
    const limit = signal === undefined ? bound : AbortSignal.any([signal, bound])
    const pages: Outcome<ListingPage, TransportFailure>[] = []
    let cursor: string | undefined
    for (let count = 0; count < config.maxListingPages; count += 1) {
      const wire = ensured.wire()
      if ('failure' in wire) {
        pages.push(wire)
        break
      }
      const page = ask(() => wire.ok.listActions(cursor), fail(ABANDONED))
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

  async function pageLost(
    ensured: Ensured,
    page: LostPage,
  ): Promise<Outcome<RefreshResult, OperationFailure>> {
    const catalog = await loseOn(table, ensured, page.lost)
    return afterMarking(page.reason, catalog)
  }

  async function written(
    access: Access<P>,
    request: RefreshRequest,
    ensured: Ensured,
    merged: ActionCatalogRecord,
    basedOn: CatalogRevision | 'absent',
  ): Promise<Refreshed> {
    const { generation, connection, catalogKey } = ensured
    const admitted = await stillAdmitted(gate, access, request.ref, ensured.adoptionRevision)
    if ('failure' in admitted) return admitted
    if (admitted.ok === 'superseded') return succeed(SUPERSEDED)
    if (!connection.isCurrent(generation)) return succeed(SUPERSEDED)
    if (request.signal?.aborted === true) return succeed(CANCELLED)
    const write = await ask(
      () => ports.store.write(catalogKey, merged, basedOn),
      fail('unavailable'),
    )
    if ('failure' in write)
      return write.failure === 'revision-conflict' ? succeed(SUPERSEDED) : fail(UNKNOWN)
    return succeed({ kind: 'published', revision: merged.revision })
  }

  async function published(
    access: Access<P>,
    request: RefreshRequest,
    ensured: Ensured,
    stored: ActionCatalogRecord | 'absent',
    pages: Pages,
  ): Promise<Refreshed | Shut> {
    const { generation, connection, peer } = ensured
    const [lost] = pages.flatMap(lostPageOf)
    if (lost !== undefined) return pageLost(ensured, lost)
    const basedOn = stored === 'absent' ? 'absent' : stored.revision
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
    const merged = mergeListing(stateOf(stored), listing.ok)
    if ('failure' in merged) return succeed(SUPERSEDED)
    if (table.isShut()) return SHUT
    return written(access, request, ensured, merged.ok, basedOn)
  }

  async function publish(
    access: Access<P>,
    request: RefreshRequest,
    ensured: Ensured,
  ): Promise<Refreshed | Shut> {
    if (table.isShut()) return SHUT
    const read = await ask(() => ports.store.read(ensured.catalogKey), fail('unavailable'))
    if ('failure' in read) return fail(UNKNOWN)
    const pages = await listPages(ensured, request.signal)
    if (pages === 'cancelled') return succeed(CANCELLED)
    return published(access, request, ensured, read.ok, pages)
  }

  function answerAtExit(result: Refreshed | Shut, stop: AbortSignal | undefined): Refreshed {
    if (result !== SHUT && 'ok' in result && result.ok.kind === 'published') return result
    if (stop?.aborted === true) return succeed(CANCELLED)
    return result === SHUT || table.isShut() ? fail(CONNECTION_UNAVAILABLE) : result
  }

  async function refresh(
    access: Access<P>,
    request: RefreshRequest,
  ): Promise<Outcome<RefreshResult, OperationFailure>> {
    return answerAtExit(await refreshOrder(access, request), request.signal)
  }

  async function refreshOrder(
    access: Access<P>,
    request: RefreshRequest,
  ): Promise<Refreshed | Shut> {
    if (table.isShut()) return SHUT
    const admitted = await admitForUse(gate, access, request.ref)
    if ('failure' in admitted) return admitted
    const asked = await within(
      table.ensure(admitted.ok, access, ensureOptionsOf(request.connectBound)),
      request.signal,
      scope,
    )
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
