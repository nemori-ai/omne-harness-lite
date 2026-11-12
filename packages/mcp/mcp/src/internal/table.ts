// The connection table: one `Connection` per connection key (SPEC K2) with the resources behind
// it, and the operations on them: `ensure` (reuse or build, single flight per key, in the
// critical section of the holding), `settle` and `lose` (what a request on an established
// connection found), `close` (the close order, single flight per key) and `closeAll` (the same
// for every entry, after which nothing connects). The table only orchestrates: the entry is
// `entry.ts`, the build `build.ts`, the close order `teardown.ts`, the turns `turns.ts`. The
// `Connection` aggregate is written by the table and by the build it starts; the services report
// to the table through `settle` and `lose`. An entry leaves the table in one place, `forget`.
// Nothing runs detached: the work an `ensure` stops waiting for at its bound goes on in the
// table's scope, whose errors `closeAll` hands to its caller.
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
} from '@omne-harness/mcp-contract'
import { createBuilder, type Losing } from './build.ts'
import { Connection, type GenerationPolicy } from './connection.ts'
import {
  CONNECTION_UNAVAILABLE,
  adoptLingering,
  ensuredOf,
  forgettable,
  isSettled,
  residualOf,
  viewOf,
  type ConnectionView,
  type Ensured,
  type EnsureFailure,
  type EnsureRefusal,
  type Entry,
  type StopRange,
  type UnavailableMark,
} from './entry.ts'
import { admitWithoutEligibility, assertAdmitted, type AdmittedEndpoint } from './gate.ts'
import { startTimeout, waitAtMost, within, type StartBound } from './port.ts'
import { createTaskScope, type Spawn } from './scope.ts'
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

/** The options of an `ensure` from a request's `connectBound`: absent when the request gives none. */
export function ensureOptionsOf(connectBound: Millis | undefined): EnsureOptions {
  return connectBound === undefined ? {} : { connectBound }
}

/**
 * What the table runs on besides its ports: its source of bounds, and the outlet for an error of
 * this package that its background work raises after `closeAll` exited the scope (SPEC P7).
 */
export type TableRuntime = Readonly<{
  startBound: StartBound
  afterExit?: (error: unknown) => void
}>

/**
 * What the services that wait on the table's connections share with it: the scope its
 * background work goes on in, as a view that can only take work, and its source of bounds.
 */
export type SharedRuntime = Readonly<{ scope: Spawn; startBound: StartBound }>

export type ClosedEndpoint = Readonly<{ ref: EndpointRef; process: StopRange }>

export interface ConnectionTable<P> {
  /**
   * A usable connection for the admitted endpoint: reused, or built in the order of SPEC S4–S9.
   * The answer holds as of the step it settles in: it never hands over a connection whose close
   * began before that step (MC-5).
   */
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
   * A request on `generation` found the connection gone: the connection refuses requests before
   * this returns; what is left is closed and the catalog marked in `done`. A generation that is
   * not current any more is a late result and changes nothing.
   */
  lose(
    connection: ConnectionView,
    generation: Generation,
    reason: LostReason,
    mark: UnavailableMark,
  ): Losing | 'not-current'
  /** The usable connection of a key, without building one. */
  current(key: ConnectionKey): Ensured | undefined
  /** The usable connections of a tenant's holding, without building one. */
  currentOf(tenant: TenantId, holding: EndpointHolding): readonly Ensured[]
  /** The reported state of the endpoint's connection (SPEC S7). */
  stateOf(tenant: TenantId, holding: EndpointHolding): ConnectionState
  /**
   * The close order of every connection of the holding: refuse requests, wait for the build,
   * close the transport, stop the process, release the handle. Every connection of the holding
   * refuses requests before this first yields, so a request read after the call sees the refusal
   * (MC-10, P16). It waits for every close, and rejects with an `AggregateError` when closing
   * raised errors of this package (P7).
   */
  close(tenant: TenantId, holding: EndpointHolding): Promise<ReleaseReport>
  /**
   * The shutdown, and the exit of the table's scope: as `close`, every connection refuses requests
   * before this first yields (S8, P13), and nothing connects after it. It rejects with an
   * `AggregateError` when closing or background work of the table raised errors of this package,
   * after every entry is closed.
   */
  closeAll(): Promise<readonly ClosedEndpoint[]>
  /** True once `closeAll` began: from then on nothing connects (SPEC S8). */
  isShut(): boolean
  /** The scope view and the source of bounds the table runs on. */
  readonly runtime: SharedRuntime
}

/**
 * What the critical section of a holding started: an answer, the build it began, or the build
 * of another call that it joined. `joined` decides whose bound the caller waits under.
 */
type Started = Readonly<{ outcome: Promise<Outcome<Ensured, EnsureFailure>>; joined: boolean }>

function answered(outcome: Outcome<Ensured, EnsureFailure>): Started {
  return { outcome: Promise.resolve(outcome), joined: false }
}

/** The existing entry's build in flight, joined, or its usable connection, reused. */
function reuseOf(existing: Entry): Started | undefined {
  if (existing.pending !== undefined) return { outcome: existing.pending, joined: true }
  const usable = ensuredOf(existing)
  return usable === undefined ? undefined : answered(succeed(usable))
}

const REFUSED_AT_ANSWER: Outcome<never, EnsureFailure> = fail({
  stage: 'settings',
  reason: CONNECTION_UNAVAILABLE,
})

/**
 * What `ensure` answers, as of the step it settles in (MC-5): a handle whose connection
 * closed while the answer was on its way, after the build's last check or after a reuse was
 * decided, is not handed over. A close that begins after this step finds the caller with a handle
 * whose `wire` refuses (MC-16 step 8).
 */
function settledAnswer(answer: Outcome<Ensured, EnsureFailure>): Outcome<Ensured, EnsureFailure> {
  return 'ok' in answer && answer.ok.connection.closed ? REFUSED_AT_ANSWER : answer
}

const UNKNOWN: EnsureRefusal = { kind: 'unknown' }

function policyOf(prepared: PreparedSettings): GenerationPolicy {
  return prepared.transport.kind === 'stdio' ? 'on-attempt' : 'on-negotiation'
}

function holdingTextOf(tenantText: string, holding: EndpointHolding): string {
  return JSON.stringify([tenantText, holding])
}

/**
 * Settled work sorted in one pass: what fulfilled, and the errors of this package that the rest
 * raised, both in order (SPEC P7).
 */
function sortOut<T>(settled: readonly PromiseSettledResult<T>[]): {
  values: T[]
  defects: unknown[]
} {
  const values: T[] = []
  const defects: unknown[] = []
  for (const item of settled) {
    if (item.status === 'fulfilled') values.push(item.value)
    else defects.push(item.reason)
  }
  return { values, defects }
}

function later(left: Generation, right: Generation | undefined): Generation {
  return right !== undefined && right > left ? right : left
}

export function createConnectionTable<P, S>(
  ports: McpPorts<P, S>,
  config: McpConfig<P>,
  runtime: TableRuntime = { startBound: startTimeout },
): ConnectionTable<P> {
  const { startBound } = runtime
  // The table's own scope: it alone exits it, at `closeAll`; the services get the spawn view.
  const scope = createTaskScope(runtime.afterExit)
  const entries = new Map<string, Entry>()
  const byView = new WeakMap<ConnectionView, Entry>()
  // The generation a forgotten connection of each key reached: a new connection of the key
  // continues the count, so no generation is used twice in one run (invariant 2).
  const lastGeneration = new Map<string, Generation>()
  // One `ensure` at a time per tenant and holding decides which revision's connection exists.
  const turns = createTurns()
  // Set by `closeAll`: from then on nothing connects (MC-5).
  let shut = false
  const builder = createBuilder(ports, config, { afterLanding: forget, scope, startBound })

  const entriesOf = (tenantText: string, holding: EndpointHolding): Entry[] =>
    [...entries.values()].filter(
      entry => entry.tenantText === tenantText && entry.ref.holding === holding,
    )

  /**
   * The one place an entry leaves the table: when `forgettable` says so (MC-14). Called
   * after every change of what the entry holds or of its state. Its generation stays, for the
   * next connection of the key.
   */
  function forget(entry: Entry): void {
    if (entries.get(entry.keyText) !== entry || !forgettable(entry)) return
    lastGeneration.set(
      entry.keyText,
      later(entry.connection.generation, lastGeneration.get(entry.keyText)),
    )
    entries.delete(entry.keyText)
  }

  /**
   * Closes one entry, once: a second close of the same entry joins the first. The order of MC-10:
   * the connection refuses requests before this returns; a build in flight sees that at its next
   * check and answers within its bound, tearing nothing down; then this close tears the entry
   * down, the only teardown since it began, and forgets it.
   */
  function closeEntry(entry: Entry): Promise<StopRange> {
    if (entry.closing !== undefined) return entry.closing
    if (!entry.connection.closed) entry.connection.close()
    const closing = (async () => {
      while (entry.pending !== undefined) await entry.pending.catch(() => undefined)
      const range = await teardown(entry)
      forget(entry)
      return range
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
    if (existing.connection.closed) {
      const from = later(existing.connection.generation, lastGeneration.get(keyText))
      existing.connection = new Connection(key, policy, from)
      existing.view = viewOf(existing.connection)
    }
    return existing
  }

  /**
   * The adoption read again before a build (SPEC MC-5): the token is not trusted for the
   * revision, so a token of another revision cannot build a connection or close one. The read
   * is the gate's adoption-only read; one that does not answer within `bound` does not hold the
   * critical section (MC-5).
   */
  async function readAgain(
    admitted: AdmittedEndpoint,
    access: Access<P>,
    bound: AbortSignal,
  ): Promise<EnsureRefusal | 'current'> {
    const read = await within(admitWithoutEligibility(ports, access, admitted.ref), bound, scope)
    if (read.kind === 'expired') return CONNECTION_UNAVAILABLE
    if ('failure' in read.value) return read.value.failure
    return read.value.ok.revision === admitted.revision ? 'current' : UNKNOWN
  }

  /**
   * The settled entries of the holding's other revisions hand what still lingers to `entry`,
   * which stops it at its next teardown, and leave the table when they hold nothing else.
   */
  function inheritLingering(entry: Entry, settled: readonly Entry[]): void {
    for (const other of settled) {
      adoptLingering(entry, other)
      forget(other)
    }
  }

  /**
   * What the critical section waits for before it decides, and whose it is: the close of a
   * connection of the holding's other revisions (invariant 6), which this call starts and owns,
   * else the close or teardown already in flight on the key, which belongs to the call that
   * started it.
   */
  function blockingOf(
    tenantText: string,
    holding: EndpointHolding,
    keyText: string,
    ofOtherRevision: (entry: Entry) => boolean,
  ): Readonly<{ work: Promise<StopRange>; owned: boolean }> | undefined {
    const other = entriesOf(tenantText, holding).find(
      entry => ofOtherRevision(entry) && !isSettled(entry),
    )
    if (other !== undefined) return { work: closeEntry(other), owned: true }
    const existing = entries.get(keyText)
    const work = existing?.closing ?? existing?.tearing
    return work === undefined ? undefined : { work, owned: false }
  }

  /**
   * The critical section of a holding: the adoption read again under what is left of the
   * caller's bound (MC-5), the connections of other revisions closed (invariant 6), the
   * key's close or teardown in flight waited for under the same bound, then the connection
   * reused, joined or built. The build itself runs outside the section. A table that is shut
   * refuses here, and so does a call whose bound fired while it waited for its turn: its caller
   * has its answer, and it asks no port.
   */
  async function begin(
    admitted: AdmittedEndpoint,
    access: Access<P>,
    prepared: PreparedSettings,
    key: ConnectionKey,
    keyText: string,
    tenantText: string,
    bound: AbortSignal,
  ): Promise<Started> {
    const refused = (reason: EnsureRefusal): Started =>
      answered(fail({ stage: 'settings', reason }))
    if (shut || bound.aborted) return refused(CONNECTION_UNAVAILABLE)
    const read = await readAgain(admitted, access, bound)
    if (read !== 'current') return refused(read)
    const { holding } = admitted.ref
    const ofOtherRevision = (entry: Entry) => entry.adoptionRevision !== admitted.revision
    for (;;) {
      if (shut || bound.aborted) return refused(CONNECTION_UNAVAILABLE)
      const blocking = blockingOf(tenantText, holding, keyText, ofOtherRevision)
      if (blocking !== undefined) {
        // At most to this call's bound (MC-5): a close or teardown that does not end
        // within it goes on, in the scope when this call started it, else for the call that did.
        const waited = blocking.owned
          ? await within(blocking.work, bound, scope)
          : await waitAtMost(blocking.work, bound)
        if (waited.kind === 'expired') return refused(CONNECTION_UNAVAILABLE)
        continue
      }
      const existing = entries.get(keyText)
      const reused = existing === undefined ? undefined : reuseOf(existing)
      if (reused !== undefined) return reused
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
      return { outcome: pending, joined: false }
    }
  }

  /**
   * A call that joined the build of another call waits for it at most to its own connection
   * bound (SPEC P8 T2). Past it, the build goes on for the call that began it, and this call
   * answers with the mark `pending`. An error of this package in the build reaches the call that
   * began it, and this call too while it still waits.
   */
  async function join(
    build: Promise<Outcome<Ensured, EnsureFailure>>,
    connectBound: number,
  ): Promise<Outcome<Ensured, EnsureFailure>> {
    const waited = await waitAtMost(build, startBound(connectBound, 'join'))
    if (waited.kind === 'expired')
      return fail({ stage: 'connect', reason: CONNECTION_UNAVAILABLE, catalog: 'pending' })
    return waited.value
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
    // This call's bounds (SPEC P8 T2): one for the critical section, the wait for its turn
    // included; one for the build it begins, from the start of the build (MC-5), or for the
    // build of another call that it joins, from the join.
    const bound = startBound(prepared.ok.bound, 'section')
    const turn = turns.inTurn(holdingTextOf(tenantText, admitted.ref.holding), () =>
      begin(admitted, access, prepared.ok, key, keyText, tenantText, bound),
    )
    const started = await within(turn, bound, scope)
    if (started.kind === 'expired')
      return fail({ stage: 'settings', reason: CONNECTION_UNAVAILABLE })
    const { outcome, joined } = started.value
    const answer = joined ? await join(outcome, prepared.ok.bound) : await outcome
    return settledAnswer(answer)
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

  function lose(
    connection: ConnectionView,
    generation: Generation,
    reason: LostReason,
    mark: UnavailableMark,
  ): Losing | 'not-current' {
    const entry = byView.get(connection)
    if (entry === undefined || !entry.connection.isCurrent(generation)) return 'not-current'
    return builder.markLost(entry, reason, mark)
  }

  function current(key: ConnectionKey): Ensured | undefined {
    const entry = entries.get(connectionKeyTextOf(key))
    return entry === undefined ? undefined : ensuredOf(entry)
  }

  function currentOf(tenant: TenantId, holding: EndpointHolding): readonly Ensured[] {
    return entriesOf(tenantTextOf(tenant), holding).flatMap(entry => {
      const usable = ensuredOf(entry)
      return usable === undefined ? [] : [usable]
    })
  }

  function stateOf(tenant: TenantId, holding: EndpointHolding): ConnectionState {
    const found = entriesOf(tenantTextOf(tenant), holding)
    const live = found.find(entry => !entry.connection.closed) ?? found[0]
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
    // Every connection of the holding refuses requests before the first wait (MC-10); every close
    // is waited for, whatever the others answer, so no error is left without a destination (P7).
    const { values: ranges, defects } = sortOut(await Promise.allSettled(found.map(closeEntry)))
    if (defects.length > 0)
      throw new AggregateError(defects, 'the MCP connections of the holding did not close cleanly')
    return { kind: 'released', process: ranges.reduce<StopRange>(narrowest, 'no-process') }
  }

  /**
   * The shutdown: nothing connects after it; the handles of the landings in flight are released
   * first, all at once (MC-14); then every entry is closed, all at once. It waits for both,
   * then hands over the errors the table's background work raised.
   */
  async function closeAll(): Promise<readonly ClosedEndpoint[]> {
    shut = true
    const all = [...entries.values()]
    // Every entry is closed before the answer, even when closing another one fails (SPEC P3).
    const [abandoned, closing] = await Promise.all([
      Promise.allSettled(all.map(abandonLandings)),
      Promise.allSettled(
        all.map(async entry => ({ ref: entry.ref, process: await closeEntry(entry) })),
      ),
    ])
    const closed = sortOut(closing)
    const defects = [...sortOut(abandoned).defects, ...closed.defects, ...scope.exit()]
    if (defects.length > 0)
      throw new AggregateError(defects, 'the MCP connection table did not close cleanly')
    return closed.values
  }

  return {
    ensure,
    settle,
    lose,
    current,
    currentOf,
    stateOf,
    close,
    closeAll,
    isShut: () => shut,
    runtime: { scope: { spawn: task => scope.spawn(task) }, startBound },
  }
}
