// The connection table: one `Connection` per connection key (SPEC K2), the resources behind it
// (transport, process, credential handle, processes not yet confirmed stopped), and the
// operations on them: `ensure` (reuse or build, single flight per key), `settle` and `lose` (what
// a request on an established connection found), `close` (the close order of the group page,
// single flight per key) and `closeAll`. The table does the I/O; the aggregate does the state;
// nothing outside the table writes the aggregate. Every entry has one teardown at a time, shared
// by a lose, a failed build, a rebuild and a close, in the order transport, processes, handle.
import type { Access, TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  catalogKeyOf,
  connectionKeyOf,
  markUnavailable,
  type AdoptionRevision,
  type CatalogKey,
  type ConnectionFailure,
  type ConnectionKey,
  type ConnectionState,
  type EffectUnknown,
  type EndpointHolding,
  type EndpointRef,
  type Generation,
  type LostReason,
  type McpConfig,
  type McpPorts,
  type Millis,
  type NoAnswerCause,
  type PeerIdentity,
  type ReleaseReport,
  type Residual,
  type StopScope,
  type UnavailableReason,
} from '@omne-harness/mcp-contract'
import type {
  CredentialFailure,
  HttpCredentialHandle,
  McpTransport,
  ProcessCredentialHandle,
  ProcessEnvironment,
  ProcessHandle,
  TransportFailure,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import { afterwards, untilAborted } from './abort.ts'
import { Connection, type GenerationPolicy } from './connection.ts'
import { assertAdmitted, type AdmittedEndpoint, type AdoptionRefusal } from './gate.ts'
import { prepareSettings, type PreparedSettings, type SettingsFailure } from './settings.ts'
import { connectionKeyTextOf, tenantTextOf } from './text.ts'

export type EnsureOptions = Readonly<{ connectBound?: Millis }>

/** The read-only view of a connection's generation; the aggregate itself stays in the table. */
export type ConnectionView = Readonly<{
  readonly generation: Generation
  isCurrent(generation: Generation): boolean
}>

/**
 * A usable connection, as it was when `ensure` answered: the transport, the generation and the
 * peer of that moment, the adoption revision it was built under, and the bound its requests use.
 */
export type Ensured = Readonly<{
  transport: McpTransport
  generation: Generation
  connection: ConnectionView
  peer: PeerIdentity
  catalogKey: CatalogKey
  adoptionRevision: AdoptionRevision
  bound: Millis
}>

/** What marking a connection failure into the catalog did. */
export type CatalogMark = 'marked' | 'revision-conflict' | 'unavailable' | 'not-acquired'

export type EnsureFailure =
  | Readonly<{ stage: 'settings'; reason: SettingsFailure | AdoptionRefusal }>
  | Readonly<{ stage: 'connect'; reason: ConnectionFailure | EffectUnknown; catalog: CatalogMark }>

export type UnavailableMark = Exclude<UnavailableReason, 'no-longer-offered'>

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

type CredentialHandle = ProcessCredentialHandle | HttpCredentialHandle

type Scope = StopScope | 'no-process'

/** A process whose stop was not confirmed for the whole tree. Stopped again at every close. */
type Lingering = Readonly<{ handle: ProcessHandle; confirmed: StopScope }>

type Entry = {
  readonly ref: EndpointRef
  readonly tenantText: string
  readonly keyText: string
  readonly catalogKey: CatalogKey
  readonly adoptionRevision: AdoptionRevision
  readonly bound: Millis
  connection: Connection
  view: ConnectionView
  transport: McpTransport | undefined
  process: ProcessHandle | undefined
  credential: CredentialHandle | undefined
  lingering: readonly Lingering[]
  /** Landings still pending after their bound; each may hand over a process this entry keeps. */
  landings: number
  pending: Promise<Outcome<Ensured, EnsureFailure>> | undefined
  /** The teardown in flight, shared by a lose, a failed build, a rebuild and a close. */
  tearing: Promise<Scope> | undefined
  /** The close in flight: refuse requests, wait for the build, tear down, forget. */
  closing: Promise<Scope> | undefined
}

/** What the critical section of a holding started: an answer, or the build it joined or began. */
type Started = Readonly<{ outcome: Promise<Outcome<Ensured, EnsureFailure>> }>

const CONNECTION_UNAVAILABLE: ConnectionFailure = { kind: 'connection-unavailable' }
const UNKNOWN: AdoptionRefusal = { kind: 'unknown' }
const NOT_AVAILABLE: AdoptionRefusal = { kind: 'not-available-to-you' }

type Failed = Readonly<{
  reason: ConnectionFailure | EffectUnknown
  lost: LostReason
  mark: UnavailableMark
}>

const PREPARATION_FAILED: Failed = {
  reason: CONNECTION_UNAVAILABLE,
  lost: 'preparation-failed',
  mark: 'connection-unavailable',
}

function lostOfNoAnswer(cause: NoAnswerCause): LostReason {
  switch (cause) {
    case 'stream-broken':
      return 'stream-broken'
    case 'process-exited':
      return 'process-exited'
    case 'abandoned':
      return 'preparation-failed'
    default: {
      const exhaustive: never = cause
      return exhaustive
    }
  }
}

/** How a failure of `open` or `discover` is reported (SPEC R6, S5, S7). */
function failedOf(failure: TransportFailure): Failed {
  switch (failure.kind) {
    case 'not-sent':
      return failure.cause === 'authorization-required'
        ? {
            reason: { kind: 'authorization-required', discovery: failure.discovery },
            lost: 'authorization-required',
            mark: 'authorization-required',
          }
        : PREPARATION_FAILED
    case 'no-answer':
      return {
        reason: { kind: 'effect-unknown', cause: failure.cause },
        lost: lostOfNoAnswer(failure.cause),
        mark: 'connection-unavailable',
      }
    case 'error-answer':
    case 'answer-malformed':
      return { ...PREPARATION_FAILED, lost: 'discover-failed' }
    default: {
      const exhaustive: never = failure
      return exhaustive
    }
  }
}

const STOP_ORDER: readonly StopScope[] = ['unconfirmed', 'root-only', 'tree-confirmed']

/** The least confirmed of two stop ranges. */
function narrower(left: StopScope, right: StopScope): StopScope {
  return STOP_ORDER.indexOf(left) <= STOP_ORDER.indexOf(right) ? left : right
}

function narrowest(scope: Scope, confirmed: StopScope): StopScope {
  return scope === 'no-process' ? confirmed : narrower(scope, confirmed)
}

function viewOf(connection: Connection): ConnectionView {
  return Object.freeze({
    get generation() {
      return connection.generation
    },
    isCurrent: (generation: Generation) => connection.isCurrent(generation),
  })
}

function isUsable(entry: Entry): entry is Entry & { transport: McpTransport } {
  const kind = entry.connection.state.kind
  return entry.transport !== undefined && (kind === 'ready' || kind === 'degraded')
}

/** True when nothing of the entry is in flight and it refuses requests: only leftovers remain. */
function isSettled(entry: Entry): boolean {
  return (
    entry.connection.state.kind === 'closed' &&
    entry.pending === undefined &&
    entry.tearing === undefined &&
    entry.closing === undefined
  )
}

function ensuredOf(entry: Entry & { transport: McpTransport }): Ensured | undefined {
  const peer = entry.connection.peer
  if (peer === undefined) return undefined
  return {
    transport: entry.transport,
    generation: entry.connection.generation,
    connection: entry.view,
    peer,
    catalogKey: entry.catalogKey,
    adoptionRevision: entry.adoptionRevision,
    bound: entry.bound,
  }
}

/** The processes the entries of one holding left, as the status view reports them. */
function residualOf(found: readonly Entry[]): readonly Residual[] | undefined {
  const lingering = found.flatMap(entry => entry.lingering)
  if (lingering.length === 0) return undefined
  return lingering.map(({ confirmed }) => ({ kind: 'process', confirmed }))
}

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
  const turns = new Map<string, Promise<void>>()

  const entriesOf = (tenantText: string, holding: EndpointHolding): Entry[] =>
    [...entries.values()].filter(
      entry => entry.tenantText === tenantText && entry.ref.holding === holding,
    )

  /** Runs `run` after every earlier run of the same holding; the result is the section's, not awaited here. */
  function inTurn<T>(holdingText: string, run: () => Promise<T>): Promise<T> {
    const previous = turns.get(holdingText) ?? Promise.resolve()
    const turn = previous.then(run)
    const done = turn.then(
      () => undefined,
      () => undefined,
    )
    turns.set(holdingText, done)
    void done.then(() => {
      if (turns.get(holdingText) === done) turns.delete(holdingText)
    })
    return turn
  }

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

  /** A process confirmed for less than the whole tree stays with the entry, to be stopped again. */
  function keep(entry: Entry, handle: ProcessHandle, confirmed: StopScope): void {
    if (confirmed === 'tree-confirmed') return
    entry.lingering = [...entry.lingering, { handle, confirmed }]
  }

  /** Stops the process and every lingering one; keeps those not confirmed for the whole tree. */
  async function stopProcesses(entry: Entry): Promise<Scope> {
    const own = entry.process
    entry.process = undefined
    const handles = [
      ...(own === undefined ? [] : [own]),
      ...entry.lingering.map(({ handle }) => handle),
    ]
    let scope: Scope = 'no-process'
    for (const handle of handles) {
      const confirmed = await handle.stop()
      entry.lingering = entry.lingering.filter(lingering => lingering.handle !== handle)
      keep(entry, handle, confirmed)
      scope = narrowest(scope, confirmed)
    }
    return scope
  }

  /**
   * The close order of the group page on the resources of one entry, once: a teardown asked while
   * one is in flight joins it. Close the transport, stop the processes, then release the
   * credential handle (S9: a process handle after `stop()` returned, an HTTP handle with the close).
   */
  function teardown(entry: Entry): Promise<Scope> {
    if (entry.tearing !== undefined) return entry.tearing
    const tearing = (async () => {
      const transport = entry.transport
      entry.transport = undefined
      await transport?.close()
      const scope = await stopProcesses(entry)
      const credential = entry.credential
      entry.credential = undefined
      await credential?.release()
      return scope
    })()
    entry.tearing = tearing
    return tearing.finally(() => {
      if (entry.tearing === tearing) entry.tearing = undefined
    })
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

  /**
   * A process that landed after its bound: stopped, and kept by the entry of its key when the
   * stop confirmed less than the tree, so the status reports it and the next close stops it again.
   */
  async function stopLate(entry: Entry, process: ProcessHandle): Promise<void> {
    const confirmed = await process.stop()
    if (confirmed === 'tree-confirmed') return
    const home = entries.get(entry.keyText) ?? entry
    entries.set(entry.keyText, home)
    keep(home, process, confirmed)
  }

  async function markCatalog(key: CatalogKey, reason: UnavailableMark): Promise<CatalogMark> {
    const read = await ports.store.read(key)
    if ('failure' in read) return 'unavailable'
    if (read.ok === 'absent') return 'not-acquired'
    const written = await ports.store.write(key, markUnavailable(read.ok, reason), read.ok.revision)
    if ('failure' in written)
      return written.failure === 'unavailable' ? 'unavailable' : 'revision-conflict'
    return 'marked'
  }

  /** A preparation failed: refuse requests, close what was taken (S9 handle included), mark, report. */
  async function failed(entry: Entry, how: Failed): Promise<Outcome<never, EnsureFailure>> {
    entry.connection.lose(how.lost)
    await teardown(entry)
    const catalog = await markCatalog(entry.catalogKey, how.mark)
    return fail({ stage: 'connect', reason: how.reason, catalog })
  }

  async function acquireCredential(
    entry: Entry,
    access: Access<P>,
    prepared: PreparedSettings,
    bound: AbortSignal,
  ): Promise<Outcome<CredentialHandle | undefined, Failed>> {
    const { credential, transport } = prepared
    if (credential.auth === 'none') return succeed(undefined)
    const holding = entry.ref.holding
    const asked: Promise<Outcome<CredentialHandle, CredentialFailure>> =
      transport.kind === 'stdio'
        ? ports.credentials.acquire(access, holding, { kind: 'process-env' }, credential.binding)
        : ports.credentials.acquire(
            access,
            holding,
            { kind: 'http-authorization', target: transport.target },
            credential.binding,
          )
    const acquired = await untilAborted(asked, bound)
    if (acquired.kind === 'aborted') {
      // A handle that arrives after the bound belongs to no connection: released on arrival.
      afterwards(acquired.late, async late => {
        if ('ok' in late) await late.ok.release()
      })
      return fail(PREPARATION_FAILED)
    }
    if ('failure' in acquired.value)
      return fail({
        reason: { kind: 'credential-unavailable', cause: acquired.value.failure },
        lost: 'preparation-failed',
        mark: 'credential-unavailable',
      })
    return succeed(acquired.value.ok)
  }

  async function materialOf(
    entry: Entry,
    access: Access<P>,
    prepared: PreparedSettings,
    generation: Generation,
    bound: AbortSignal,
  ): Promise<Outcome<TransportMaterial, Failed>> {
    const { transport } = prepared
    const { instructionsByteLimit } = config
    const credential = entry.credential
    if (transport.kind === 'streamable-http') {
      const { target } = transport
      return succeed(
        credential?.purpose === 'http-authorization'
          ? { kind: 'streamable-http', target, credential, generation, instructionsByteLimit }
          : { kind: 'streamable-http', target, generation, instructionsByteLimit },
      )
    }
    const env: ProcessEnvironment = {
      values: transport.values,
      credentials:
        credential?.purpose === 'process-env'
          ? transport.credentialVariables.map(name => ({ name, handle: credential }))
          : [],
    }
    const started = await untilAborted(ports.landing.start(access, transport.launch, env), bound)
    if (started.kind === 'aborted') {
      // The process may still land, with the handle in its environment: the handle goes with it
      // and is released after its `stop()` returned (S9); without a process, on the answer.
      entry.credential = undefined
      entry.landings += 1
      afterwards(started.late, async late => {
        try {
          if ('ok' in late) await stopLate(entry, late.ok)
        } finally {
          entry.landings -= 1
          forget(entry)
          await credential?.release()
        }
      })
      return fail(PREPARATION_FAILED)
    }
    if ('failure' in started.value)
      return fail({
        reason: { kind: 'landing-unavailable' },
        lost: 'preparation-failed',
        mark: 'landing-unavailable',
      })
    entry.process = started.value.ok
    return succeed({ kind: 'stdio', process: started.value.ok, generation, instructionsByteLimit })
  }

  /**
   * Builds the connection (SPEC S4 step 4) under the connection bound of invariant 5, which
   * starts at the credential and covers the process start, the open and the negotiation. A port
   * that throws is torn down like a failure, then the error goes on to the caller.
   */
  async function build(
    entry: Entry,
    access: Access<P>,
    prepared: PreparedSettings,
  ): Promise<Outcome<Ensured, EnsureFailure>> {
    // What the key's earlier connection left is stopped again before the new attempt.
    await teardown(entry)
    const generation = entry.connection.attempt()
    const bound = AbortSignal.timeout(prepared.bound)
    try {
      const credential = await acquireCredential(entry, access, prepared, bound)
      if ('failure' in credential) return await failed(entry, credential.failure)
      entry.credential = credential.ok
      const material = await materialOf(entry, access, prepared, generation, bound)
      if ('failure' in material) return await failed(entry, material.failure)
      const opened = await untilAborted(ports.transports.open(material.ok, bound), bound)
      if (opened.kind === 'aborted') {
        afterwards(opened.late, async late => {
          if ('ok' in late) await late.ok.close()
        })
        return await failed(entry, PREPARATION_FAILED)
      }
      if ('failure' in opened.value) return await failed(entry, failedOf(opened.value.failure))
      const transport = opened.value.ok
      entry.transport = transport
      const discovered = await untilAborted(transport.discover(), bound)
      if (discovered.kind === 'aborted') return await failed(entry, PREPARATION_FAILED)
      if ('failure' in discovered.value)
        return await failed(entry, failedOf(discovered.value.failure))
      entry.connection.ready(discovered.value.ok)
      return succeed({
        transport,
        generation: entry.connection.generation,
        connection: entry.view,
        peer: discovered.value.ok,
        catalogKey: entry.catalogKey,
        adoptionRevision: entry.adoptionRevision,
        bound: entry.bound,
      })
    } catch (error: unknown) {
      if (entry.connection.state.kind === 'preparing') entry.connection.lose('preparation-failed')
      await teardown(entry)
      throw error
    }
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
      const pending = build(entry, access, prepared)
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
    const started = await inTurn(holdingTextOf(tenantText, admitted.ref.holding), () =>
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
    // Requests are refused at once; the teardown is the entry's one teardown.
    entry.connection.lose(reason)
    await teardown(entry)
    return markCatalog(entry.catalogKey, mark)
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
