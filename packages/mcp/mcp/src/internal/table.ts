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

export function ensureOptionsOf(connectBound: Millis | undefined): EnsureOptions {
  return connectBound === undefined ? {} : { connectBound }
}

export type TableRuntime = Readonly<{
  startBound: StartBound
  afterExit?: (error: unknown) => void
}>

export type SharedRuntime = Readonly<{ scope: Spawn; startBound: StartBound }>

export type ClosedEndpoint = Readonly<{ ref: EndpointRef; process: StopRange }>

export interface ConnectionTable<P> {
  ensure(
    admitted: AdmittedEndpoint,
    access: Access<P>,
    options?: EnsureOptions,
  ): Promise<Outcome<Ensured, EnsureFailure>>
  settle(
    connection: ConnectionView,
    generation: Generation,
    outcome: 'page-failed' | 'listed',
  ): void
  lose(
    connection: ConnectionView,
    generation: Generation,
    reason: LostReason,
    mark: UnavailableMark,
  ): Losing | 'not-current'
  current(key: ConnectionKey): Ensured | undefined
  currentOf(tenant: TenantId, holding: EndpointHolding): readonly Ensured[]
  stateOf(tenant: TenantId, holding: EndpointHolding): ConnectionState
  close(tenant: TenantId, holding: EndpointHolding): Promise<ReleaseReport>
  closeAll(): Promise<readonly ClosedEndpoint[]>
  isShut(): boolean
  readonly runtime: SharedRuntime
}

type Started = Readonly<{ outcome: Promise<Outcome<Ensured, EnsureFailure>>; joined: boolean }>

function answered(outcome: Outcome<Ensured, EnsureFailure>): Started {
  return { outcome: Promise.resolve(outcome), joined: false }
}

function reuseOf(existing: Entry): Started | undefined {
  if (existing.pending !== undefined) return { outcome: existing.pending, joined: true }
  const usable = ensuredOf(existing)
  return usable === undefined ? undefined : answered(succeed(usable))
}

const REFUSED_AT_ANSWER: Outcome<never, EnsureFailure> = fail({
  stage: 'settings',
  reason: CONNECTION_UNAVAILABLE,
})

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
  const scope = createTaskScope(runtime.afterExit)
  const entries = new Map<string, Entry>()
  const byView = new WeakMap<ConnectionView, Entry>()
  const lastGeneration = new Map<string, Generation>()
  const turns = createTurns()
  let shut = false
  const builder = createBuilder(ports, config, { afterLanding: forget, scope, startBound })

  const entriesOf = (tenantText: string, holding: EndpointHolding): Entry[] =>
    [...entries.values()].filter(
      entry => entry.tenantText === tenantText && entry.ref.holding === holding,
    )

  function forget(entry: Entry): void {
    if (entries.get(entry.keyText) !== entry || !forgettable(entry)) return
    lastGeneration.set(
      entry.keyText,
      later(entry.connection.generation, lastGeneration.get(entry.keyText)),
    )
    entries.delete(entry.keyText)
  }

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

  function inheritLingering(entry: Entry, settled: readonly Entry[]): void {
    for (const other of settled) {
      adoptLingering(entry, other)
      forget(other)
    }
  }

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
        const waited = blocking.owned
          ? await within(blocking.work, bound, scope)
          : await waitAtMost(blocking.work, bound)
        if (waited.kind === 'expired') return refused(CONNECTION_UNAVAILABLE)
        continue
      }
      const existing = entries.get(keyText)
      const reused = existing === undefined ? undefined : reuseOf(existing)
      if (reused !== undefined) return reused
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
    const { values: ranges, defects } = sortOut(await Promise.allSettled(found.map(closeEntry)))
    if (defects.length > 0)
      throw new AggregateError(defects, 'the MCP connections of the holding did not close cleanly')
    return { kind: 'released', process: ranges.reduce<StopRange>(narrowest, 'no-process') }
  }

  async function closeAll(): Promise<readonly ClosedEndpoint[]> {
    shut = true
    const all = [...entries.values()]
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
