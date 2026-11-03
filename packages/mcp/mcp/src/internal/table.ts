// The connection table: one `Connection` per connection key (SPEC K2), the resources behind it
// (transport, process, credential handle, processes not yet confirmed stopped), and the
// operations on them: `ensure` (reuse or build, single flight per key), `settle` and `lose` (what
// a request on an established connection found), `close` (the close order of the group page,
// single flight per key) and `closeAll`. The table does the I/O; the aggregate does the state;
// nothing outside the table writes the aggregate.
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
  type Refusal,
  type ReleaseReport,
  type Residual,
  type StopScope,
  type UnavailableReason,
} from '@omne-harness/mcp-contract'
import type {
  HttpCredentialHandle,
  McpTransport,
  ProcessCredentialHandle,
  ProcessEnvironment,
  ProcessHandle,
  TransportFailure,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import { untilAborted } from './abort.ts'
import { Connection, type GenerationPolicy } from './connection.ts'
import { assertAdmitted, type AdmittedEndpoint } from './gate.ts'
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
  | Readonly<{ stage: 'settings'; reason: SettingsFailure | Extract<Refusal, { kind: 'unknown' }> }>
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
  pending: Promise<Outcome<Ensured, EnsureFailure>> | undefined
  closing: Promise<StopScope | 'no-process'> | undefined
}

const CONNECTION_UNAVAILABLE: ConnectionFailure = { kind: 'connection-unavailable' }
const UNKNOWN: Extract<Refusal, { kind: 'unknown' }> = { kind: 'unknown' }

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

function residualOf(entry: Entry): readonly Residual[] | undefined {
  if (entry.lingering.length === 0) return undefined
  return entry.lingering.map(({ confirmed }) => ({ kind: 'process', confirmed }))
}

function policyOf(prepared: PreparedSettings): GenerationPolicy {
  return prepared.transport.kind === 'stdio' ? 'on-attempt' : 'on-negotiation'
}

export function createConnectionTable<P, S>(
  ports: McpPorts<P, S>,
  config: McpConfig<P>,
): ConnectionTable<P> {
  const entries = new Map<string, Entry>()
  const byView = new WeakMap<ConnectionView, Entry>()
  // The generation a closed connection of each key reached: a new connection of the key continues
  // the count, so no generation is used twice in one run (invariant 2).
  const lastGeneration = new Map<string, Generation>()

  const entriesOf = (tenantText: string, holding: EndpointHolding): Entry[] =>
    [...entries.values()].filter(
      entry => entry.tenantText === tenantText && entry.ref.holding === holding,
    )

  /** Removes the entry, if it is still the one in the table, and keeps its generation. */
  function forget(entry: Entry): void {
    if (entries.get(entry.keyText) !== entry) return
    lastGeneration.set(entry.keyText, entry.connection.generation)
    entries.delete(entry.keyText)
  }

  /** Stops the process and every lingering one; keeps those not confirmed for the whole tree. */
  async function stopProcesses(entry: Entry): Promise<StopScope | 'no-process'> {
    const handles = [
      ...(entry.process === undefined ? [] : [entry.process]),
      ...entry.lingering.map(({ handle }) => handle),
    ]
    entry.process = undefined
    let scope: StopScope | 'no-process' = 'no-process'
    const lingering: Lingering[] = []
    for (const handle of handles) {
      const confirmed = await handle.stop()
      scope = scope === 'no-process' ? confirmed : narrower(scope, confirmed)
      if (confirmed !== 'tree-confirmed') lingering.push({ handle, confirmed })
    }
    entry.lingering = lingering
    return scope
  }

  /**
   * The close order of the group page on the resources of one entry: close the transport, stop
   * the processes, then release the credential handle (S9: a process handle after `stop()`
   * returned, an HTTP handle with the close).
   */
  async function teardown(entry: Entry): Promise<StopScope | 'no-process'> {
    const transport = entry.transport
    entry.transport = undefined
    await transport?.close()
    const scope = await stopProcesses(entry)
    const credential = entry.credential
    entry.credential = undefined
    await credential?.release()
    return scope
  }

  /** Closes one entry, once: a second close of the same entry joins the first. */
  function closeEntry(entry: Entry): Promise<StopScope | 'no-process'> {
    if (entry.closing !== undefined) return entry.closing
    const closing = (async () => {
      if (entry.pending !== undefined) await entry.pending.catch(() => undefined)
      const connection = entry.connection
      if (connection.state.kind !== 'closed') connection.close()
      const scope = await teardown(entry)
      if (entry.connection === connection && entry.lingering.length === 0) forget(entry)
      return scope
    })()
    entry.closing = closing
    return closing.finally(() => {
      if (entry.closing === closing) entry.closing = undefined
    })
  }

  /**
   * Invariant 6: a connection of another adoption revision for the same tenant and holding is
   * closed first. What its processes left is carried to the new entry.
   */
  async function closeOthers(
    tenantText: string,
    holding: EndpointHolding,
    revision: AdoptionRevision,
  ): Promise<readonly Lingering[]> {
    const lingering: Lingering[] = []
    for (const other of entriesOf(tenantText, holding)) {
      if (other.adoptionRevision === revision) continue
      await closeEntry(other)
      lingering.push(...other.lingering)
      forget(other)
    }
    return lingering
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

  /** A preparation failed: close what was taken (S9 handle included), mark, report. */
  async function failed(entry: Entry, how: Failed): Promise<Outcome<never, EnsureFailure>> {
    await teardown(entry)
    entry.connection.lose(how.lost, residualOf(entry))
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
    const release = (late: Outcome<CredentialHandle, unknown>) => {
      if ('ok' in late) void late.ok.release()
    }
    const acquired =
      transport.kind === 'stdio'
        ? await untilAborted(
            ports.credentials.acquire(access, holding, { kind: 'process-env' }, credential.binding),
            bound,
            release,
          )
        : await untilAborted(
            ports.credentials.acquire(
              access,
              holding,
              { kind: 'http-authorization', target: transport.target },
              credential.binding,
            ),
            bound,
            release,
          )
    if (acquired === 'aborted') return fail(PREPARATION_FAILED)
    if ('failure' in acquired)
      return fail({
        reason: { kind: 'credential-unavailable', cause: acquired.failure },
        lost: 'preparation-failed',
        mark: 'credential-unavailable',
      })
    return succeed(acquired.ok)
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
    const started = await untilAborted(
      ports.landing.start(access, transport.launch, env),
      bound,
      late => {
        if ('ok' in late) void late.ok.stop()
      },
    )
    if (started === 'aborted') return fail(PREPARATION_FAILED)
    if ('failure' in started)
      return fail({
        reason: { kind: 'landing-unavailable' },
        lost: 'preparation-failed',
        mark: 'landing-unavailable',
      })
    entry.process = started.ok
    return succeed({ kind: 'stdio', process: started.ok, generation, instructionsByteLimit })
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
    await teardown(entry)
    const generation = entry.connection.attempt()
    const bound = AbortSignal.timeout(prepared.bound)
    try {
      const credential = await acquireCredential(entry, access, prepared, bound)
      if ('failure' in credential) return await failed(entry, credential.failure)
      entry.credential = credential.ok
      const material = await materialOf(entry, access, prepared, generation, bound)
      if ('failure' in material) return await failed(entry, material.failure)
      const opened = await untilAborted(ports.transports.open(material.ok, bound), bound, late => {
        if ('ok' in late) void late.ok.close()
      })
      if (opened === 'aborted') return await failed(entry, PREPARATION_FAILED)
      if ('failure' in opened) return await failed(entry, failedOf(opened.failure))
      entry.transport = opened.ok
      const discovered = await untilAborted(opened.ok.discover(), bound, () => undefined)
      if (discovered === 'aborted') return await failed(entry, PREPARATION_FAILED)
      if ('failure' in discovered) return await failed(entry, failedOf(discovered.failure))
      entry.connection.ready(discovered.ok)
      return succeed({
        transport: opened.ok,
        generation: entry.connection.generation,
        connection: entry.view,
        peer: discovered.ok,
        catalogKey: entry.catalogKey,
        adoptionRevision: entry.adoptionRevision,
        bound: entry.bound,
      })
    } catch (error: unknown) {
      await teardown(entry)
      if (entry.connection.state.kind === 'preparing')
        entry.connection.lose('preparation-failed', residualOf(entry))
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
        pending: undefined,
        closing: undefined,
      }
    }
    if (existing.connection.state.kind === 'closed') {
      existing.connection = new Connection(key, policy, existing.connection.generation)
      existing.view = viewOf(existing.connection)
    }
    return existing
  }

  async function ensure(
    admitted: AdmittedEndpoint,
    access: Access<P>,
    options: EnsureOptions = {},
  ): Promise<Outcome<Ensured, EnsureFailure>> {
    assertAdmitted(admitted)
    const prepared = prepareSettings(admitted, options.connectBound)
    if ('failure' in prepared) return fail({ stage: 'settings', reason: prepared.failure })
    // The token is not trusted for the revision: the adoption is read again, and a token of
    // another revision cannot build a connection or close one (SPEC MC-11).
    const adoption = await ports.adoption.endpoint(access, admitted.ref)
    if (
      'failure' in adoption ||
      adoption.ok === 'not-adopted' ||
      adoption.ok.revision !== admitted.revision
    )
      return fail({ stage: 'settings', reason: UNKNOWN })
    const key = connectionKeyOf(access.tenant, admitted, prepared.ok.account)
    const keyText = connectionKeyTextOf(key)
    const tenantText = tenantTextOf(access.tenant)
    const inherited = await closeOthers(tenantText, admitted.ref.holding, admitted.revision)
    let existing = entries.get(keyText)
    while (existing?.closing !== undefined) {
      await existing.closing
      existing = entries.get(keyText)
    }
    if (existing?.pending !== undefined) return existing.pending
    if (existing !== undefined && isUsable(existing)) {
      const usable = ensuredOf(existing)
      if (usable !== undefined) return succeed(usable)
    }
    const entry = entryOf(existing, admitted, access, prepared.ok, key, keyText)
    entry.lingering = [...entry.lingering, ...inherited]
    entries.set(keyText, entry)
    byView.set(entry.view, entry)
    const pending = build(entry, access, prepared.ok)
    entry.pending = pending
    try {
      return await pending
    } finally {
      if (entry.pending === pending) entry.pending = undefined
    }
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
    await teardown(entry)
    entry.connection.lose(reason, residualOf(entry))
    return markCatalog(entry.catalogKey, mark)
  }

  function current(key: ConnectionKey): Ensured | undefined {
    const entry = entries.get(connectionKeyTextOf(key))
    return entry !== undefined && isUsable(entry) ? ensuredOf(entry) : undefined
  }

  function stateOf(tenant: TenantId, holding: EndpointHolding): ConnectionState {
    const [entry] = entriesOf(tenantTextOf(tenant), holding)
    if (entry === undefined) return { kind: 'none' }
    const state = entry.connection.state
    const residual = residualOf(entry)
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
    let scope: StopScope | 'no-process' = 'no-process'
    for (const entry of found) {
      const confirmed = await closeEntry(entry)
      if (confirmed === 'no-process') continue
      scope = scope === 'no-process' ? confirmed : narrower(scope, confirmed)
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
