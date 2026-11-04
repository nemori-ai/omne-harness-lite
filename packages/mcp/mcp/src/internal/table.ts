// The connection table: one `Connection` per connection key (SPEC K2) with the resources behind
// it, and the operations on them: `ensure` (reuse or build, single flight per key, in the
// critical section of the holding), `settle` and `lose` (what a request on an established
// connection found), `close` (the close order, single flight per key) and `closeAll`. The table
// only orchestrates: the entry is `entry.ts`, the build `build.ts`, the close order
// `teardown.ts`, the turns `turns.ts`. Nothing outside the table writes the aggregate.
import type { Access, TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  catalogKeyOf,
  connectionKeyOf,
  type ConnectionKey,
  type ConnectionState,
  type EndpointHolding,
  type EndpointRef,
  type Generation,
  type LostReason,
  type McpConfig,
  type McpPorts,
  type Millis,
  type ReleaseReport,
  type StopScope,
} from '@omne-harness/mcp-contract'
import { createBuilder } from './build.ts'
import { Connection, type GenerationPolicy } from './connection.ts'
import {
  ensuredOf,
  isSettled,
  isUsable,
  residualOf,
  viewOf,
  type CatalogMark,
  type ConnectionView,
  type Ensured,
  type EnsureFailure,
  type Entry,
  type Scope,
  type UnavailableMark,
} from './entry.ts'
import { assertAdmitted, type AdmittedEndpoint, type AdoptionRefusal } from './gate.ts'
import { prepareSettings, type PreparedSettings } from './settings.ts'
import { narrowest, teardown } from './teardown.ts'
import { connectionKeyTextOf, tenantTextOf } from './text.ts'
import { createTurns } from './turns.ts'

export type {
  CatalogMark,
  ConnectionView,
  Ensured,
  EnsureFailure,
  UnavailableMark,
} from './entry.ts'

export type EnsureOptions = Readonly<{ connectBound?: Millis }>

export type ClosedEndpoint = Readonly<{ ref: EndpointRef; process: StopScope | 'no-process' }>

export interface ConnectionTable<P> {
  /** A usable connection for the admitted endpoint: reused, or built in the order of SPEC S4–S9. */
  ensure(
    admitted: AdmittedEndpoint,
    access: Access<P>,
    options?: EnsureOptions,
  ): Promise<Outcome<Ensured, EnsureFailure>>
  /** A non-call request on `generation` ended: a failed page degrades, a complete listing recovers. */
  settle(
    connection: ConnectionView,
    generation: Generation,
    outcome: 'page-failed' | 'listed',
  ): void
  /**
   * A request on `generation` found the connection gone: close what is left, mark the catalog.
   * A generation that is not current any more is a late result and changes nothing.
   */
  lose(
    connection: ConnectionView,
    generation: Generation,
    reason: LostReason,
    mark: UnavailableMark,
  ): Promise<CatalogMark | 'not-current'>
  /** The usable connection of a key, without building one. */
  current(key: ConnectionKey): Ensured | undefined
  /** The reported state of the endpoint's connection (SPEC S7). */
  stateOf(tenant: TenantId, holding: EndpointHolding): ConnectionState
  /** The close order: refuse requests, close the transport, stop the process, release the handle. */
  close(tenant: TenantId, holding: EndpointHolding): Promise<ReleaseReport>
  closeAll(): Promise<readonly ClosedEndpoint[]>
}

/** What the critical section of a holding started: an answer, or the build it joined or began. */
type Started = Readonly<{ outcome: Promise<Outcome<Ensured, EnsureFailure>> }>

const UNKNOWN: AdoptionRefusal = { kind: 'unknown' }
const NOT_AVAILABLE: AdoptionRefusal = { kind: 'not-available-to-you' }

function policyOf(prepared: PreparedSettings): GenerationPolicy {
  return prepared.transport.kind === 'stdio' ? 'on-attempt' : 'on-negotiation'
}

function holdingTextOf(tenantText: string, holding: EndpointHolding): string {
  return JSON.stringify([tenantText, holding])
}

function later(left: Generation, right: Generation | undefined): Generation {
  return right !== undefined && right > left ? right : left
}

export function createConnectionTable<P, S>(
  ports: McpPorts<P, S>,
  config: McpConfig<P>,
): ConnectionTable<P> {
  const entries = new Map<string, Entry>()
  const byView = new WeakMap<ConnectionView, Entry>()
  // The generation a forgotten connection of each key reached: a new connection of the key
  // continues the count, so no generation is used twice in one run (invariant 2).
  const lastGeneration = new Map<string, Generation>()
  // One `ensure` at a time per tenant and holding decides which revision's connection exists.
  const turns = createTurns()
  const builder = createBuilder(ports, config, { afterLanding: forget })

  const entriesOf = (tenantText: string, holding: EndpointHolding): Entry[] =>
    [...entries.values()].filter(
      entry => entry.tenantText === tenantText && entry.ref.holding === holding,
    )

  /** Removes a closed entry that holds nothing and expects nothing; keeps its generation. */
  function forget(entry: Entry): void {
    if (entries.get(entry.keyText) !== entry || entry.connection.state.kind !== 'closed') return
    if (entry.pending !== undefined || entry.tearing !== undefined) return
    if (entry.lingering.length > 0 || entry.landings > 0) return
    lastGeneration.set(
      entry.keyText,
      later(entry.connection.generation, lastGeneration.get(entry.keyText)),
    )
    entries.delete(entry.keyText)
  }

  /** Closes one entry, once: a second close of the same entry joins the first. */
  function closeEntry(entry: Entry): Promise<Scope> {
    if (entry.closing !== undefined) return entry.closing
    const closing = (async () => {
      // A build in flight ends within its bound; the close takes its connection afterwards.
      while (entry.pending !== undefined) await entry.pending.catch(() => undefined)
      if (entry.connection.state.kind !== 'closed') entry.connection.close()
      const scope = await teardown(entry)
      forget(entry)
      return scope
    })()
    entry.closing = closing
    return closing.finally(() => {
      if (entry.closing === closing) entry.closing = undefined
    })
  }

  /** The entry of a key: the existing one, with a new connection when the old one is closed. */
  function entryOf(
    existing: Entry | undefined,
    admitted: AdmittedEndpoint,
    access: Access<P>,
    prepared: PreparedSettings,
    key: ConnectionKey,
    keyText: string,
  ): Entry {
    const policy = policyOf(prepared)
    if (existing === undefined) {
      const connection = new Connection(key, policy, lastGeneration.get(keyText))
      return {
        ref: admitted.ref,
        tenantText: tenantTextOf(access.tenant),
        keyText,
        catalogKey: catalogKeyOf(access.tenant, admitted, prepared.account),
        adoptionRevision: admitted.revision,
        bound: prepared.bound,
        connection,
        view: viewOf(connection),
        transport: undefined,
        process: undefined,
        credential: undefined,
        lingering: [],
        landings: 0,
        pending: undefined,
        tearing: undefined,
        closing: undefined,
      }
    }
    if (existing.connection.state.kind === 'closed') {
      const from = later(existing.connection.generation, lastGeneration.get(keyText))
      existing.connection = new Connection(key, policy, from)
      existing.view = viewOf(existing.connection)
    }
    return existing
  }

  /**
   * The critical section of a holding: the adoption read again, the connections of other
   * revisions closed (invariant 6), the key's close or teardown in flight waited for, then the
   * connection reused, joined or built. The build itself runs outside the section.
   */
  async function begin(
    admitted: AdmittedEndpoint,
    access: Access<P>,
    prepared: PreparedSettings,
    key: ConnectionKey,
    keyText: string,
    tenantText: string,
  ): Promise<Started> {
    const answer = (outcome: Outcome<Ensured, EnsureFailure>): Started => ({
      outcome: Promise.resolve(outcome),
    })
    const refused = (reason: AdoptionRefusal): Started =>
      answer(fail({ stage: 'settings', reason }))
    // The token is not trusted for the revision: the adoption is read again, and a token of
    // another revision cannot build a connection or close one (SPEC MC-5).
    const adoption = await ports.adoption.endpoint(access, admitted.ref)
    if ('failure' in adoption) return refused(UNKNOWN)
    if (adoption.ok === 'not-adopted') return refused(NOT_AVAILABLE)
    if (adoption.ok.revision !== admitted.revision) return refused(UNKNOWN)
    const { holding } = admitted.ref
    const ofOtherRevision = (entry: Entry) => entry.adoptionRevision !== admitted.revision
    for (;;) {
      const other = entriesOf(tenantText, holding).find(
        entry => ofOtherRevision(entry) && !isSettled(entry),
      )
      if (other !== undefined) {
        await closeEntry(other)
        continue
      }
      const existing = entries.get(keyText)
      const inFlight = existing?.closing ?? existing?.tearing
      if (inFlight !== undefined) {
        await inFlight
        continue
      }
      if (existing?.pending !== undefined) return { outcome: existing.pending }
      if (existing !== undefined && isUsable(existing)) {
        const usable = ensuredOf(existing)
        if (usable !== undefined) return answer(succeed(usable))
      }
      // From here to the start of the build nothing yields: the entry of the holding is this one.
      const entry = entryOf(existing, admitted, access, prepared, key, keyText)
      for (const settled of entriesOf(tenantText, holding).filter(ofOtherRevision)) {
        entry.lingering = [...entry.lingering, ...settled.lingering]
        settled.lingering = []
        forget(settled)
      }
      entries.set(keyText, entry)
      byView.set(entry.view, entry)
      const pending = builder.build(entry, access, prepared)
      const done = () => {
        if (entry.pending === pending) entry.pending = undefined
      }
      entry.pending = pending
      void pending.then(done, done)
      return { outcome: pending }
    }
  }

  async function ensure(
    admitted: AdmittedEndpoint,
    access: Access<P>,
    options: EnsureOptions = {},
  ): Promise<Outcome<Ensured, EnsureFailure>> {
    assertAdmitted(admitted)
    const prepared = prepareSettings(admitted, options.connectBound)
    if ('failure' in prepared) return fail({ stage: 'settings', reason: prepared.failure })
    const key = connectionKeyOf(access.tenant, admitted, prepared.ok.account)
    const keyText = connectionKeyTextOf(key)
    const tenantText = tenantTextOf(access.tenant)
    const started = await turns.inTurn(holdingTextOf(tenantText, admitted.ref.holding), () =>
      begin(admitted, access, prepared.ok, key, keyText, tenantText),
    )
    return started.outcome
  }

  function settle(
    connection: ConnectionView,
    generation: Generation,
    outcome: 'page-failed' | 'listed',
  ): void {
    const entry = byView.get(connection)
    if (entry === undefined || !entry.connection.isCurrent(generation)) return
    const { state, peer } = entry.connection
    if (outcome === 'page-failed' && state.kind === 'ready') entry.connection.degrade('list-failed')
    if (outcome === 'listed' && state.kind === 'degraded' && peer !== undefined)
      entry.connection.ready(peer)
  }

  async function lose(
    connection: ConnectionView,
    generation: Generation,
    reason: LostReason,
    mark: UnavailableMark,
  ): Promise<CatalogMark | 'not-current'> {
    const entry = byView.get(connection)
    if (entry === undefined || !entry.connection.isCurrent(generation)) return 'not-current'
    return builder.markLost(entry, reason, mark)
  }

  function current(key: ConnectionKey): Ensured | undefined {
    const entry = entries.get(connectionKeyTextOf(key))
    return entry !== undefined && isUsable(entry) ? ensuredOf(entry) : undefined
  }

  function stateOf(tenant: TenantId, holding: EndpointHolding): ConnectionState {
    const found = entriesOf(tenantTextOf(tenant), holding)
    const live = found.find(entry => entry.connection.state.kind !== 'closed') ?? found[0]
    if (live === undefined) return { kind: 'none' }
    const state = live.connection.state
    const residual = residualOf(found)
    if (state.kind === 'closed')
      return residual === undefined
        ? { kind: 'none' }
        : { kind: 'lost', reason: 'close-unconfirmed', residual }
    if (state.kind === 'lost')
      return residual === undefined
        ? { kind: 'lost', reason: state.reason }
        : { kind: 'lost', reason: state.reason, residual }
    return state
  }

  async function close(tenant: TenantId, holding: EndpointHolding): Promise<ReleaseReport> {
    const found = entriesOf(tenantTextOf(tenant), holding)
    if (found.length === 0) return { kind: 'no-connection' }
    let scope: Scope = 'no-process'
    for (const entry of found) {
      const confirmed = await closeEntry(entry)
      if (confirmed !== 'no-process') scope = narrowest(scope, confirmed)
    }
    return { kind: 'released', process: scope }
  }

  async function closeAll(): Promise<readonly ClosedEndpoint[]> {
    const closed: ClosedEndpoint[] = []
    for (const entry of Array.from(entries.values()))
      closed.push({ ref: entry.ref, process: await closeEntry(entry) })
    return closed
  }

  return { ensure, settle, lose, current, stateOf, close, closeAll }
}
