// The connection table: one `Connection` per connection key (SPEC K2), the resources behind it
// (transport, process, credential handle), and the three operations on them: `ensure` (build or
// reuse), `lose` (a request on an established connection found it gone) and `close` (the order
// of the group page's "close()"). The table does the I/O; the aggregate does the state.
import type { Access, TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  catalogKeyOf,
  connectionKeyOf,
  markUnavailable,
  peerAccountOf,
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
import { Connection, type GenerationPolicy } from './connection.ts'
import { assertAdmitted, type AdmittedEndpoint } from './gate.ts'
import { prepareSettings, type PreparedSettings } from './settings.ts'
import { connectionKeyTextOf, tenantTextOf } from './text.ts'

export type EnsureOptions = Readonly<{ signal?: AbortSignal; connectBound?: Millis }>

/** A usable connection: its transport, the generation it has, and the aggregate to check later. */
export type Ensured = Readonly<{
  transport: McpTransport
  generation: Generation
  connection: Connection
  peer: PeerIdentity
  catalogKey: CatalogKey
}>

/** What became of the catalog when a connection failure was marked into it. */
export type CatalogMark =
  | 'marked'
  | 'revision-conflict'
  | 'unavailable'
  | 'not-acquired'
  | 'untouched'

export type EnsureFailure = Readonly<{
  reason: ConnectionFailure | Refusal | EffectUnknown
  catalog: CatalogMark
}>

export type UnavailableMark = Exclude<UnavailableReason, 'no-longer-offered'>

export type ClosedEndpoint = Readonly<{ ref: EndpointRef; process: StopScope | 'no-process' }>

export interface ConnectionTable<P> {
  /** A usable connection for the admitted endpoint: reused, or built in the order of SPEC S4–S9. */
  ensure(
    admitted: AdmittedEndpoint,
    access: Access<P>,
    options?: EnsureOptions,
  ): Promise<Outcome<Ensured, EnsureFailure>>
  /** A request on an established connection found it gone: close what is left, mark the catalog. */
  lose(connection: Connection, reason: LostReason, mark: UnavailableMark): Promise<CatalogMark>
  /** The usable connection of a key, without building one. */
  current(key: ConnectionKey): Ensured | undefined
  /** The reported state of the endpoint's connection (SPEC S7). */
  stateOf(tenant: TenantId, holding: EndpointHolding): ConnectionState
  /** The close order: refuse requests, close the transport, stop the process, release handles. */
  close(tenant: TenantId, holding: EndpointHolding): Promise<ReleaseReport>
  closeAll(): Promise<readonly ClosedEndpoint[]>
}

type CredentialHandle = ProcessCredentialHandle | HttpCredentialHandle

type Entry = {
  readonly ref: EndpointRef
  readonly tenantText: string
  readonly keyText: string
  readonly catalogKey: CatalogKey
  connection: Connection
  transport: McpTransport | undefined
  process: ProcessHandle | undefined
  credential: CredentialHandle | undefined
  /** Processes whose stop was not confirmed for the whole tree. Stopped again at every close. */
  lingering: readonly ProcessHandle[]
  pending: Promise<Outcome<Ensured, EnsureFailure>> | undefined
}

const CONNECTION_UNAVAILABLE: ConnectionFailure = { kind: 'connection-unavailable' }

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

/** The least confirmed of two stop ranges. */
function narrower(left: StopScope, right: StopScope): StopScope {
  const order: readonly StopScope[] = ['unconfirmed', 'root-only', 'tree-confirmed']
  return order.indexOf(left) <= order.indexOf(right) ? left : right
}

/**
 * The value, or `aborted` once the signal fires first. A value that arrives after the abort goes
 * to `late`, so that a transport opened too late is still closed.
 */
function untilAborted<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  late: (value: T) => void,
): Promise<T | 'aborted'> {
  const afterwards = () => void promise.then(late, () => undefined)
  if (signal.aborted) {
    afterwards()
    return Promise.resolve('aborted')
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      afterwards()
      resolve('aborted')
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
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
    connection: entry.connection,
    peer,
    catalogKey: entry.catalogKey,
  }
}

export function createConnectionTable<P, S>(
  ports: McpPorts<P, S>,
  config: McpConfig<P>,
): ConnectionTable<P> {
  const entries = new Map<string, Entry>()
  const byConnection = new WeakMap<Connection, Entry>()

  const entriesOf = (tenantText: string, holding: EndpointHolding): Entry[] =>
    [...entries.values()].filter(
      entry => entry.tenantText === tenantText && entry.ref.holding === holding,
    )

  async function closeTransport(entry: Entry): Promise<void> {
    const transport = entry.transport
    entry.transport = undefined
    await transport?.close()
  }

  /** Stops the process and every lingering one; keeps those not confirmed for the whole tree. */
  async function stopProcesses(entry: Entry): Promise<StopScope | 'no-process'> {
    const processes = [...(entry.process === undefined ? [] : [entry.process]), ...entry.lingering]
    entry.process = undefined
    let scope: StopScope | 'no-process' = 'no-process'
    const lingering: ProcessHandle[] = []
    const residual: Residual[] = []
    for (const process of processes) {
      const confirmed = await process.stop()
      scope = scope === 'no-process' ? confirmed : narrower(scope, confirmed)
      if (confirmed !== 'tree-confirmed') {
        lingering.push(process)
        residual.push({ kind: 'process', confirmed })
      }
    }
    entry.lingering = lingering
    residuals.set(entry, residual)
    return scope
  }

  // The stop range each lingering process last confirmed, for the status view.
  const residuals = new WeakMap<Entry, readonly Residual[]>()
  const residualView = (entry: Entry): readonly Residual[] | undefined => {
    const residual = residuals.get(entry)
    return residual === undefined || residual.length === 0 ? undefined : residual
  }

  /** S9: a process handle is released after `stop()` returned; an HTTP handle with the close. */
  async function releaseCredential(entry: Entry): Promise<void> {
    const credential = entry.credential
    entry.credential = undefined
    await credential?.release()
  }

  /** The close order of the group page, on one entry. */
  async function closeEntry(entry: Entry): Promise<StopScope | 'no-process'> {
    if (entry.pending !== undefined) await entry.pending.catch(() => undefined)
    if (entry.connection.state.kind !== 'closed') entry.connection.close()
    await closeTransport(entry)
    const scope = await stopProcesses(entry)
    await releaseCredential(entry)
    if (entry.lingering.length === 0) entries.delete(entry.keyText)
    return scope
  }

  /**
   * Invariant 6: a connection of another key for the same tenant and holding (an earlier
   * adoption revision, or a closed one still waiting on its process) is closed first. What its
   * processes left is carried to the new entry.
   */
  async function closeOthers(
    tenantText: string,
    holding: EndpointHolding,
    keep: string,
  ): Promise<readonly ProcessHandle[]> {
    const lingering: ProcessHandle[] = []
    for (const other of entriesOf(tenantText, holding)) {
      if (other.keyText === keep) continue
      await closeEntry(other)
      lingering.push(...other.lingering)
      entries.delete(other.keyText)
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
    await closeTransport(entry)
    await stopProcesses(entry)
    await releaseCredential(entry)
    entry.connection.lose(how.lost, residualView(entry))
    const catalog = await markCatalog(entry.catalogKey, how.mark)
    return fail({ reason: how.reason, catalog })
  }

  async function acquireCredential(
    entry: Entry,
    access: Access<P>,
    prepared: PreparedSettings,
  ): Promise<Outcome<CredentialHandle | undefined, Failed>> {
    const { binding, target, definition } = prepared
    if (definition.auth === 'none' || binding === undefined) return succeed(undefined)
    const holding = entry.ref.holding
    const acquired =
      target === undefined
        ? await ports.credentials.acquire(access, holding, { kind: 'process-env' }, binding)
        : await ports.credentials.acquire(
            access,
            holding,
            { kind: 'http-authorization', target },
            binding,
          )
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
  ): Promise<Outcome<TransportMaterial, Failed>> {
    const { definition, target } = prepared
    const { instructionsByteLimit } = config
    if (definition.transport.kind === 'streamable-http') {
      if (target === undefined) return fail(PREPARATION_FAILED)
      const credential = entry.credential
      return succeed(
        credential?.purpose === 'http-authorization'
          ? { kind: 'streamable-http', target, credential, generation, instructionsByteLimit }
          : { kind: 'streamable-http', target, generation, instructionsByteLimit },
      )
    }
    const credential = entry.credential
    const env: ProcessEnvironment = {
      values: prepared.values,
      credentials:
        credential?.purpose === 'process-env'
          ? prepared.credentialVariables.map(name => ({ name, handle: credential }))
          : [],
    }
    const started = await ports.landing.start(access, definition.transport.launch, env)
    if ('failure' in started)
      return fail({
        reason: { kind: 'landing-unavailable' },
        lost: 'preparation-failed',
        mark: 'landing-unavailable',
      })
    entry.process = started.ok
    return succeed({ kind: 'stdio', process: started.ok, generation, instructionsByteLimit })
  }

  /** Builds the connection: SPEC S4 step 4, under the connection bound of invariant 5. */
  async function build(
    entry: Entry,
    access: Access<P>,
    prepared: PreparedSettings,
    callerSignal: AbortSignal | undefined,
  ): Promise<Outcome<Ensured, EnsureFailure>> {
    await closeTransport(entry)
    await stopProcesses(entry)
    await releaseCredential(entry)
    const generation = entry.connection.attempt()
    const bound = AbortSignal.timeout(prepared.bound)
    const signal = callerSignal === undefined ? bound : AbortSignal.any([callerSignal, bound])
    let kept = false
    try {
      const credential = await acquireCredential(entry, access, prepared)
      if ('failure' in credential) return await failed(entry, credential.failure)
      entry.credential = credential.ok
      const material = await materialOf(entry, access, prepared, generation)
      if ('failure' in material) return await failed(entry, material.failure)
      const opened = await untilAborted(
        ports.transports.open(material.ok, signal),
        signal,
        late => {
          if ('ok' in late) void late.ok.close()
        },
      )
      if (opened === 'aborted') return await failed(entry, PREPARATION_FAILED)
      if ('failure' in opened) return await failed(entry, failedOf(opened.failure))
      entry.transport = opened.ok
      const discovered = await untilAborted(opened.ok.discover(), signal, () => undefined)
      if (discovered === 'aborted') return await failed(entry, PREPARATION_FAILED)
      if ('failure' in discovered) return await failed(entry, failedOf(discovered.failure))
      entry.connection.ready(discovered.ok)
      kept = true
      return succeed({
        transport: opened.ok,
        generation: entry.connection.generation,
        connection: entry.connection,
        peer: discovered.ok,
        catalogKey: entry.catalogKey,
      })
    } finally {
      if (!kept) await releaseCredential(entry)
    }
  }

  function policyOf(prepared: PreparedSettings): GenerationPolicy {
    return prepared.definition.transport.kind === 'stdio' ? 'on-attempt' : 'on-negotiation'
  }

  async function ensure(
    admitted: AdmittedEndpoint,
    access: Access<P>,
    options: EnsureOptions = {},
  ): Promise<Outcome<Ensured, EnsureFailure>> {
    assertAdmitted(admitted)
    const prepared = prepareSettings(admitted, options.connectBound)
    if ('failure' in prepared) return fail({ reason: prepared.failure, catalog: 'untouched' })
    const account = peerAccountOf(prepared.ok.definition.auth, prepared.ok.binding)
    if ('failure' in account)
      return fail({
        reason: { kind: 'credential-unavailable', cause: 'missing' },
        catalog: 'untouched',
      })
    const key = connectionKeyOf(access.tenant, admitted, account.ok)
    const keyText = connectionKeyTextOf(key)
    const tenantText = tenantTextOf(access.tenant)
    const inherited = await closeOthers(tenantText, admitted.ref.holding, keyText)
    const existing = entries.get(keyText)
    if (existing?.pending !== undefined) return existing.pending
    if (existing !== undefined && isUsable(existing)) {
      const usable = ensuredOf(existing)
      if (usable !== undefined) return succeed(usable)
    }
    const policy = policyOf(prepared.ok)
    const entry: Entry = existing ?? {
      ref: admitted.ref,
      tenantText,
      keyText,
      catalogKey: catalogKeyOf(access.tenant, admitted, account.ok),
      connection: new Connection(key, policy),
      transport: undefined,
      process: undefined,
      credential: undefined,
      lingering: [],
      pending: undefined,
    }
    if (entry.connection.state.kind === 'closed')
      entry.connection = new Connection(key, policy, entry.connection.generation)
    entry.lingering = [...entry.lingering, ...inherited]
    entries.set(keyText, entry)
    byConnection.set(entry.connection, entry)
    const pending = build(entry, access, prepared.ok, options.signal)
    entry.pending = pending
    try {
      return await pending
    } finally {
      entry.pending = undefined
    }
  }

  async function lose(
    connection: Connection,
    reason: LostReason,
    mark: UnavailableMark,
  ): Promise<CatalogMark> {
    const entry = byConnection.get(connection)
    if (entry === undefined || entry.connection !== connection) return 'untouched'
    await closeTransport(entry)
    await stopProcesses(entry)
    await releaseCredential(entry)
    const kind = connection.state.kind
    if (kind === 'preparing' || kind === 'ready' || kind === 'degraded')
      connection.lose(reason, residualView(entry))
    return markCatalog(entry.catalogKey, mark)
  }

  function current(key: ConnectionKey): Ensured | undefined {
    const entry = entries.get(connectionKeyTextOf(key))
    return entry !== undefined && isUsable(entry) ? ensuredOf(entry) : undefined
  }

  function stateOf(tenant: TenantId, holding: EndpointHolding): ConnectionState {
    const entry =
      entriesOf(tenantTextOf(tenant), holding).find(
        item => item.connection.state.kind !== 'closed',
      ) ?? entriesOf(tenantTextOf(tenant), holding)[0]
    if (entry === undefined) return { kind: 'none' }
    const state = entry.connection.state
    const residual = residualView(entry)
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

  return { ensure, lose, current, stateOf, close, closeAll }
}
