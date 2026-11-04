// The connection table: one `Connection` per connection key (SPEC K2) with the resources behind
// it, and the operations on them: `ensure` (reuse or build, single flight per key, in the
// critical section of the holding), `settle` and `lose` (what a request on an established
// connection found), `close` (the close order, single flight per key) and `closeAll` (the same
// for every entry, after which nothing connects). The table only orchestrates: the entry is
// `entry.ts`, the build `build.ts`, the close order `teardown.ts`, the turns `turns.ts`. Nothing
// outside the table writes the aggregate, and an entry leaves the table in one place, `forget`.
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
import { answerOf, untilAborted } from './abort.ts'
import { createBuilder } from './build.ts'
import { Connection, type GenerationPolicy } from './connection.ts'
import {
  ensuredOf,
  holdsNothing,
  isSettled,
  isUsable,
  residualOf,
  viewOf,
  type CatalogMark,
  type ConnectionView,
  type Ensured,
  type EnsureFailure,
  type EnsureRefusal,
  type Entry,
  type Scope,
  type UnavailableMark,
} from './entry.ts'
import { assertAdmitted, type AdmittedEndpoint } from './gate.ts'
import { prepareSettings, type PreparedSettings } from './settings.ts'
import { abandonLandings, narrowest, teardown } from './teardown.ts'
import { connectionKeyTextOf, tenantTextOf } from './text.ts'
import { createTurns } from './turns.ts'

export type {
  CatalogMark,
  ConnectionView,
  Ensured,
  EnsureFailure,
  EnsureRefusal,
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

const UNKNOWN: EnsureRefusal = { kind: 'unknown' }
const NOT_AVAILABLE: EnsureRefusal = { kind: 'not-available-to-you' }
const CONNECTION_UNAVAILABLE: EnsureRefusal = { kind: 'connection-unavailable' }

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
  // Set by `closeAll`: from then on nothing connects (SPEC decision 5).
  let shut = false

  const entriesOf = (tenantText: string, holding: EndpointHolding): Entry[] =>
    [...entries.values()].filter(
      entry => entry.tenantText === tenantText && entry.ref.holding === holding,
    )

  /**
   * The one place an entry leaves the table: when it refuses requests and holds nothing
   * (`holdsNothing`, decision 20). Its generation stays, for the next connection of the key.
   */
  function forget(entry: Entry): void {
    if (entries.get(entry.keyText) !== entry || entry.connection.state.kind !== 'closed') return
    if (!holdsNothing(entry)) return
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
        landings: [],
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
   * The critical section of a holding: the adoption read again under what is left of the
   * caller's bound (decision 22), the connections of other revisions closed (invariant 6), the
   * key's close or teardown in flight waited for, then the connection reused, joined or built.
   * The build itself runs outside the section. A table that is shut refuses here.
   */
  /**
   * The adoption read again before a build (SPEC MC-5): the token is not trusted for the
   * revision, so a token of another revision cannot build a connection or close one. A port
   * that rejects is read as `unknown`; one that does not answer within `bound` does not hold
   * the critical section (decision 22).
   */
  async function readAgain(
    admitted: AdmittedEndpoint,
    access: Access<P>,
    bound: AbortSignal,
  ): Promise<EnsureRefusal | 'current'> {
    const adoption = await untilAborted(
      answerOf(ports.adoption.endpoint(access, admitted.ref), fail<'unknown'>('unknown')),
      bound,
    )
    if (adoption.kind === 'aborted') return CONNECTION_UNAVAILABLE
    if ('failure' in adoption.value) return UNKNOWN
    if (adoption.value.ok === 'not-adopted') return NOT_AVAILABLE
    return adoption.value.ok.revision === admitted.revision ? 'current' : UNKNOWN
  }

  /**
   * The settled entries of the holding's other revisions hand what still lingers to `entry`,
   * which stops it at its next teardown, and leave the table when they hold nothing else.
   */
  function inheritLingering(entry: Entry, settled: readonly Entry[]): void {
    for (const other of settled) {
      entry.lingering = [...entry.lingering, ...other.lingering]
      other.lingering = []
      forget(other)
    }
  }

  async function begin(
    admitted: AdmittedEndpoint,
    access: Access<P>,
    prepared: PreparedSettings,
    key: ConnectionKey,
    keyText: string,
    tenantText: string,
    bound: AbortSignal,
  ): Promise<Started> {
    const answer = (outcome: Outcome<Ensured, EnsureFailure>): Started => ({
      outcome: Promise.resolve(outcome),
    })
    const refused = (reason: EnsureRefusal): Started => answer(fail({ stage: 'settings', reason }))
    if (shut) return refused(CONNECTION_UNAVAILABLE)
    const read = await readAgain(admitted, access, bound)
    if (read !== 'current') return refused(read)
    const { holding } = admitted.ref
    const ofOtherRevision = (entry: Entry) => entry.adoptionRevision !== admitted.revision
    for (;;) {
      if (shut) return refused(CONNECTION_UNAVAILABLE)
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
      inheritLingering(entry, entriesOf(tenantText, holding).filter(ofOtherRevision))
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
    if (shut) return fail({ stage: 'settings', reason: CONNECTION_UNAVAILABLE })
    const prepared = prepareSettings(admitted, options.connectBound)
    if ('failure' in prepared) return fail({ stage: 'settings', reason: prepared.failure })
    const key = connectionKeyOf(access.tenant, admitted, prepared.ok.account)
    const keyText = connectionKeyTextOf(key)
    const tenantText = tenantTextOf(access.tenant)
    // This call's connection bound, for the critical section; the build keeps its own, from the
    // credential on (MC-5), as the listing keeps its own.
    const bound = AbortSignal.timeout(prepared.ok.bound)
    const started = await turns.inTurn(holdingTextOf(tenantText, admitted.ref.holding), () =>
      begin(admitted, access, prepared.ok, key, keyText, tenantText, bound),
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
    for (const entry of found) scope = narrowest(scope, await closeEntry(entry))
    return { kind: 'released', process: scope }
  }

  /** The shutdown: every entry closed, the landings still in flight abandoned, nothing connects after. */
  async function closeAll(): Promise<readonly ClosedEndpoint[]> {
    shut = true
    const closed: ClosedEndpoint[] = []
    for (const entry of Array.from(entries.values())) {
      const process = await closeEntry(entry)
      await abandonLandings(entry)
      closed.push({ ref: entry.ref, process })
    }
    return closed
  }

  return { ensure, settle, lose, current, stateOf, close, closeAll }
}
