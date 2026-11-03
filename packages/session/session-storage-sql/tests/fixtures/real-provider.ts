// A composition of the Session storage over the real sqlite-provider: real files in a temporary
// directory, a real write Worker per transaction domain and the real read Worker pool. It builds
// the storage only through the public entry of `@omne-harness/sqlite-provider`; there is no
// `node:sqlite` double in this file. It does not import vitest, so a child process can run it.
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type {
  ConsumptionId,
  DurableEvidence,
  RunId,
  SessionAccess,
  SessionCommand,
  SessionLogCommitObservation,
  SessionLogConsequence,
  SessionTransactionPort,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  createPolicySessionAccessCheck,
  creation,
  evidence,
  guard,
  initializationFixtureFacts,
  initializationFixtureGuard,
  operationId,
  ordinaryInput,
  sessionId,
  testingTenant,
} from '@omne-harness/session-contract/testing'
import { createFixedSessionCursorSigning } from '@omne-harness/session-cordis-contract/testing'
import {
  combinationManifest,
  manifestDigest,
  type CloseLeasePort,
  type JsonValue,
  type QueryResultV2,
  type SqlIdentity,
  type SqlMaterialCatalog,
  type SqlStorage,
  type StorageCloseResult,
  type StorageControl,
  type TenantDomain,
  type TenantDomainAccess,
} from '@omne-harness/sql-contract'
import { createSqliteStorage, type SqliteStorageConfig } from '@omne-harness/sqlite-provider'
import {
  createSessionStorage,
  createSessionStoragePair,
  sessionStorageMaterials,
} from '../../src/index.ts'
import {
  decodeExecutionRecordParts,
  EXECUTION_RECORD_HANDLERS,
  executionRecordFacts,
  type ExecutionRecordWrite,
  type PreadmissionIntent,
  type PreadmissionIntentWrite,
} from '../../src/participants.ts'
import { FIXTURE_READ_OUTPUT_LIMIT_BYTES } from './read-limit.ts'

export const TENANT_A = testingTenant(
  'org_c0nf0rmance000000000000000',
  'acc_c0nf0rmance000000000000000',
)
export const TENANT_B = testingTenant(
  'org_c0nf0rmance0ther0000000000',
  'acc_c0nf0rmance0ther0000000000',
)

export const textOf = (tenant: TenantId): string => {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('not a minted tenant')
  return encoded.value
}

export const COMBINATION = 'c1'

/** The provider configuration of this fixture. Tests override single fields. */
export function realConfig(storageRoot: string): SqliteStorageConfig {
  return {
    storageRoot,
    admissionQueueLimit: 64,
    globalAdmissionLimit: 256,
    lockWaitMs: 5000,
    maxCommandsPerCommit: 16,
    maxCommandBytes: 1048576,
    maxRequestBytes: 4194304,
    globalInFlightWriteBytes: 67108864,
    maxJsonDepth: 64,
    maxJsonMembers: 65536,
    maxResponseBytes: 65536,
    maxOperationResponseBytes: 1048576,
    globalWriteResponseBytes: 33554432,
    maxDiagnosticBytes: 4096,
    maxWorkers: 16,
    reservedWriterSlots: 4,
    maxReadWorkersPerDomain: 2,
    readQueuePerDomain: 32,
    readQueueGlobal: 256,
    readQueueTimeoutMs: 5000,
    maxReadInputBytes: 262144,
    maxReadResultBytes: 20971520,
    globalReadResultBytes: 268435456,
    readObservationMs: 5000,
    readerIdleMs: 30000,
    queryQueuePerDomain: 16,
    queryQueueGlobal: 64,
    controlQueuePerDomain: 8,
    controlQueueGlobal: 32,
    writesPerControlTurn: 4,
    groupMaxOperations: 8,
    groupCollectMs: 5,
    groupMaxInputBytes: 4194304,
    groupMaxResponseReservationBytes: 8388608,
    groupMaxExecutionSliceMs: 5,
    walAutocheckpointPages: 100000,
    journalSizeLimitBytes: 67108864,
    // The physical-transaction count reads the WAL, so a checkpoint must not restart it mid-test.
    checkpointIntervalMs: 3_600_000,
    checkpointWalBytes: 16777216,
    walReadPauseBytes: 67108864,
    walWriteStopBytes: 134217728,
    closeDeadlineMs: 10000,
  }
}

function catalogOf(readOutputLimitBytes: number): { catalog: SqlMaterialCatalog; digest: string } {
  const materials = sessionStorageMaterials({ readOutputLimitBytes })
  const catalog: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: materials.participants,
    migrations: materials.migrations,
    readHandlers: materials.readHandlers,
    declaredCombinations: {
      tenant: { combinationVersion: COMBINATION, participants: ['execution-record', 'session'] },
      system: null,
    },
  }
  const manifest = combinationManifest({ catalog, participants: ['execution-record', 'session'] })
  if (manifest.kind !== 'manifest') throw new Error(`combination is ${manifest.kind}`)
  return { catalog, digest: manifestDigest(manifest.manifest) }
}

/** The kinds of a storage `query` answer. This branch is the one place that reads the answer. */
export type QueryKind = 'committed' | 'rolled_back' | 'not_committed' | 'unknown'
export function queryKindOf(result: QueryResultV2): QueryKind {
  switch (result.kind) {
    case 'committed':
      return 'committed'
    case 'rolled_back':
      return 'rolled_back'
    case 'not_committed':
      return 'not_committed'
    case 'unknown':
      return 'unknown'
  }
}

/** The storage identity that the commit path gives generation `attempt` of one operation. */
export const identityOf = (
  tenant: TenantId,
  domain: string,
  operation: string,
  attempt = 1,
): SqlIdentity => ({
  scope: { kind: 'tenant', tenant: textOf(tenant) },
  transactionDomain: domain,
  operation,
  protocolVersion: '2',
  operationKey: `${operation}#${String(attempt)}`,
})

export type WalSample = Readonly<{ commits: number; generation: string }>

/**
 * Commit frames in the live WAL file of a domain: each physical write transaction ends with one.
 * `generation` is the WAL salt pair; a changed salt means the WAL restarted and two samples are
 * not comparable. This reads the file as bytes; it asks nothing of the provider.
 */
export function walSample(file: string): WalSample {
  let bytes: Buffer
  try {
    bytes = readFileSync(`${file}-wal`)
  } catch {
    return { commits: 0, generation: 'none' }
  }
  if (bytes.length < 32) return { commits: 0, generation: 'none' }
  const pageSize = bytes.readUInt32BE(8)
  const salt1 = bytes.readUInt32BE(16)
  const salt2 = bytes.readUInt32BE(20)
  let commits = 0
  for (let at = 32; at + 24 + pageSize <= bytes.length; at += 24 + pageSize) {
    if (bytes.readUInt32BE(at + 8) !== salt1 || bytes.readUInt32BE(at + 12) !== salt2) break
    if (bytes.readUInt32BE(at + 4) !== 0) commits += 1
  }
  return { commits, generation: `${String(salt1)}:${String(salt2)}` }
}

export type RealAppOptions = Readonly<{
  /** An existing root to reopen. Without it a new temporary root is made and removed on dispose. */
  root?: string
  config?: Partial<SqliteStorageConfig>
  tenants?: readonly TenantId[]
  /** The read output limit given to the materials; 20 MiB without it. */
  readOutputLimitBytes?: number
}>

export async function openRealApp(options: RealAppOptions = {}) {
  const owned = options.root === undefined
  const root = options.root ?? (await realpath(await mkdtemp(join(tmpdir(), 'session-real-'))))
  const storageRoot = join(root, 'storage')
  const { catalog, digest } = catalogOf(
    options.readOutputLimitBytes ?? FIXTURE_READ_OUTPUT_LIMIT_BYTES,
  )
  const events: string[] = []
  const closeLeases: CloseLeasePort = {
    admit(name) {
      events.push(`admit:${name}`)
      return { name }
    },
    release(handle) {
      events.push(`release:${(handle as { name: string }).name}`)
    },
  }
  const created = await createSqliteStorage({
    config: { ...realConfig(storageRoot), ...options.config },
    materials: catalog,
    closeLeases,
  })
  if (created.kind !== 'created')
    throw new Error(`provider rejected: ${created.reason}: ${created.problems.join('; ')}`)
  const real: SqlStorage = created.storage
  const control: StorageControl = created.control

  let ops = 0
  /** The real storage with a count of `commit` calls (original operations that reach the provider). */
  const storage: SqlStorage = {
    registerCombination: input => real.registerCombination(input),
    commit: request => {
      ops += 1
      return real.commit(request)
    },
    query: identity => real.query(identity),
    read: (input, readOptions) => real.read(input, readOptions),
  }

  const known = options.tenants ?? [TENANT_A, TENANT_B]
  const entries: TenantDomain[] = known.map((tenant, index) => ({
    tenant: textOf(tenant),
    domain: {
      scope: { kind: 'tenant', tenant: textOf(tenant) },
      transactionDomain: `dom_${String(index)}`,
    },
  }))
  const domains: TenantDomainAccess = {
    resolve: input => {
      const entry = entries.find(item => item.tenant === input.tenant)
      return Promise.resolve(
        entry === undefined
          ? { kind: 'unavailable', diagnostic: 'no domain for the tenant' }
          : { kind: 'ready', entry },
      )
    },
    snapshot: () =>
      Promise.resolve({ kind: 'ready', value: { revision: '1', entries: [...entries] } }),
  }
  for (const entry of entries) {
    const registered = await real.registerCombination({
      scope: entry.domain.scope,
      transactionDomain: entry.domain.transactionDomain,
      combinationVersion: COMBINATION,
      manifestDigest: digest,
      participants: ['execution-record', 'session'],
    })
    if (registered.kind !== 'registered')
      throw new Error(
        `registration of ${entry.domain.transactionDomain} is ${registered.kind}: ${JSON.stringify(registered)}`,
      )
  }

  const accessCheck = createPolicySessionAccessCheck<string>(request => ({
    kind: 'allowed',
    evidence: evidence(`access/${request.operation}`),
  }))
  const storageOptions = {
    storage,
    domains,
    accessCheck,
    cursorSigning: createFixedSessionCursorSigning(),
    combination: { combinationVersion: COMBINATION, manifestDigest: digest },
  }
  const port = createSessionStorage<string>(storageOptions)
  // The pair over the same options and storage: its public port and its delegated entry.
  const pair = createSessionStoragePair<string>(storageOptions)
  const access = (tenant: TenantId, session = 'session-1'): SessionAccess<string> => ({
    principal: 'tester',
    tenant,
    session: sessionId(session),
  })
  const create = (tenant: TenantId, session = 'session-1') => {
    const command: SessionCommand = {
      kind: 'create',
      input: {
        tenant,
        session: sessionId(session),
        operation: operationId(`create-${session}`),
        creation: creation(),
      },
    }
    const guards = [
      initializationFixtureGuard(
        initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
      ),
    ]
    return port.commit({ access: access(tenant, session), command, guards })
  }
  const accept = (tenant: TenantId, session: string, name: string, text = name) =>
    port.commit({
      access: access(tenant, session),
      command: {
        kind: 'accept',
        input: {
          tenant,
          session: sessionId(session),
          operation: operationId(`accept-${name}`),
          value: ordinaryInput(text),
        },
      },
      guards: [guard('login', 'login-entry', 'present')],
    })

  let closed: StorageCloseResult | null = null
  const close = async (): Promise<StorageCloseResult> => {
    closed ??= await control.close({ initiator: 'disposal' })
    return closed
  }
  /** Closes the provider, then removes the root when this app made it. */
  const dispose = async (): Promise<void> => {
    await close().catch(() => undefined)
    if (owned) await rm(root, { recursive: true, force: true })
  }

  return {
    root,
    storageRoot,
    combination: { combinationVersion: COMBINATION, manifestDigest: digest },
    port,
    pair,
    storage,
    control,
    events,
    accessCheck,
    access,
    create,
    accept,
    close,
    dispose,
    /** The SQLite file of a transaction domain. */
    domainFile: (domain: string): string =>
      join(storageRoot, 'domains', `${Buffer.from(domain).toString('hex')}.sqlite`),
    /** `commit` calls that reached the real storage. */
    opCount: () => ops,
    domainOf: (tenant: TenantId): string => {
      const entry = entries.find(item => item.tenant === textOf(tenant))
      if (entry === undefined) throw new Error('unknown tenant')
      return entry.domain.transactionDomain
    },
  }
}

export type RealApp = Awaited<ReturnType<typeof openRealApp>>

/** One execution-record publication of execution `exe_1` in `session-1` of tenant A. */
export function jointWrite(over: Partial<ExecutionRecordWrite> = {}): ExecutionRecordWrite {
  return {
    tenant: TENANT_A,
    session: sessionId('session-1'),
    execution: 'exe_1',
    expected: null,
    revision: '1',
    published: '0',
    operation: 'aop_joint',
    digest: 'sha256:joint',
    answer: { receipt: 'joint' },
    state: { records: ['joint'] },
    boundaries: [
      {
        execution: 'exe_1',
        revision: '1',
        receipt: evidence('agent/exe_1/1'),
        emittedThrough: '0',
        ended: null,
      },
    ],
    facts: [],
    batches: [],
    admissions: [],
    ...over,
  }
}

/**
 * The Agent side of a fixture over any `SqlStorage`: it states original events and admissions to
 * the same-root index through the `execution-record` participant, as the execution record provider
 * would publish them. It asserts the original facts; it does not verify an adapter.
 */
export type AgentEvent = Readonly<{
  tenant: TenantId
  session: string
  execution: string
  sequence: string
  revision: string
  source: DurableEvidence
  head: DurableEvidence
  kinds: readonly string[]
  ended?: boolean
  batch?: JsonValue
}>

export type AgentAdmission = Readonly<{
  tenant: TenantId
  session: string
  execution: string
  input: string
  operation: string
  accepted: DurableEvidence
  grant: DurableEvidence
  attachment: string
  /** The SE15 attempt the acceptance was granted under; absent for a legacy row. */
  attempt?: string
}>

export function agentPublisher(input: {
  storage: SqlStorage
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
  domainOf: (tenant: TenantId) => string
}) {
  const heads = new Map<string, Readonly<{ revision: string; emitted: bigint; ended: unknown }>>()
  const seen = new Set<string>()
  let writes = 0
  const domain = (tenant: TenantId) => ({
    scope: { kind: 'tenant' as const, tenant: textOf(tenant) },
    transactionDomain: input.domainOf(tenant),
  })
  const published = async (tenant: TenantId, session: string): Promise<string> => {
    const read = await input.storage.read({
      domain: domain(tenant),
      handler: EXECUTION_RECORD_HANDLERS.parts,
      protocol: '1',
      requestKey: `state-${String(writes)}`,
      input: { tenant: textOf(tenant), session },
    })
    if (read.kind !== 'read') throw new Error(`the Agent state is not readable: ${read.kind}`)
    return decodeExecutionRecordParts(read.output)?.published ?? '0'
  }
  const commit = async (write: ExecutionRecordWrite): Promise<void> => {
    writes += 1
    const result = await input.storage.commit({
      identity: identityOf(write.tenant, input.domainOf(write.tenant), write.operation),
      ...input.combination,
      commands: [executionRecordFacts(write)],
    })
    if (result.kind !== 'committed')
      throw new Error(`the Agent write did not commit: ${JSON.stringify(result)}`)
  }
  const base = (tenant: TenantId, session: string, execution: string, published: string) => ({
    tenant,
    session: sessionId(session),
    execution,
    published,
    operation: `aop_fixture_${String(writes)}`,
    digest: `sha256:fixture-${String(writes)}`,
    answer: { fixture: writes },
    state: { fixture: writes },
  })
  return {
    /** Publishes one original event: the new head, its fact row and, when given, its batch row. */
    async publish(event: AgentEvent): Promise<void> {
      const key = `${textOf(event.tenant)}/${event.session}/${event.execution}`
      if (seen.has(`${key}#${event.sequence}`)) return
      const prior = heads.get(key)
      const emitted =
        prior === undefined || BigInt(event.sequence) > prior.emitted
          ? BigInt(event.sequence)
          : prior.emitted
      const ended =
        event.ended === true
          ? { sequence: event.sequence, source: event.source }
          : (prior?.ended ?? null)
      await commit({
        ...base(
          event.tenant,
          event.session,
          event.execution,
          await published(event.tenant, event.session),
        ),
        expected: prior?.revision ?? null,
        revision: event.revision,
        boundaries: [
          {
            execution: event.execution,
            revision: event.revision,
            receipt: event.head,
            emittedThrough: String(emitted),
            ended: ended as never,
          },
        ],
        facts: [
          {
            execution: event.execution,
            sequence: event.sequence,
            source: event.source,
            kinds: event.kinds,
          },
        ],
        batches:
          event.batch === undefined
            ? []
            : [
                {
                  execution: event.execution,
                  sequence: event.sequence,
                  source: event.source,
                  batch: event.batch,
                },
              ],
        admissions: [],
      })
      heads.set(key, { revision: event.revision, emitted, ended })
      seen.add(`${key}#${event.sequence}`)
    },
    /** Publishes one original admission of an input into the reverse directory. */
    async admit(admission: AgentAdmission): Promise<void> {
      const key = `${textOf(admission.tenant)}/${admission.session}/${admission.execution}`
      const head = heads.get(key)?.revision ?? null
      await commit({
        ...base(
          admission.tenant,
          admission.session,
          admission.execution,
          await published(admission.tenant, admission.session),
        ),
        expected: head,
        revision: head ?? '0',
        boundaries: [],
        facts: [],
        batches: [],
        admissions: [
          {
            input: admission.input,
            execution: admission.execution,
            operation: admission.operation,
            accepted: admission.accepted,
            grant: admission.grant,
            attachment: admission.attachment,
            ...(admission.attempt === undefined ? {} : { attempt: admission.attempt }),
          },
        ],
      })
    },
  }
}

export type AgentPublisher = ReturnType<typeof agentPublisher>

/** What a Run scene needs of an app: the port and its helpers, over either provider. */
type SceneApp = Readonly<{
  port: SessionTransactionPort<string>
  access: (tenant: TenantId, session?: string) => SessionAccess<string>
}>

/** The current snapshot of session-1 of tenant A. */
export async function workOf(a: SceneApp): Promise<WorkSnapshot> {
  const read = await a.port.readWork(a.access(TENANT_A))
  if ('failure' in read) throw new Error(`readWork: ${JSON.stringify(read.failure)}`)
  return read.ok
}

/** Starts the next Run of session-1 of tenant A on its first pending input. */
export function startRun(a: SceneApp, name: string) {
  return a.port.commit({
    access: a.access(TENANT_A),
    command: {
      kind: 'startRun',
      input: {
        tenant: TENANT_A,
        session: sessionId('session-1'),
        operation: operationId(name),
        entry: 'interactive',
        candidate: creation().definition.candidate,
        instance: { owner: 'agent', id: 'instance-1' },
      },
    },
    guards: [guard('evidence-bridge', 'login-entry', { session: 'session-1', operation: name })],
  })
}

/** Cancels the Run `run` of session-1 of tenant A by a forced cancel-run control. */
export function cancelRun(a: SceneApp, run: RunId, name: string) {
  return a.port.commit({
    access: a.access(TENANT_A),
    command: {
      kind: 'control',
      input: {
        tenant: TENANT_A,
        session: sessionId('session-1'),
        operation: operationId(name),
        intent: { kind: 'cancel-run', run, urgency: 'force' },
      },
    },
    guards: [],
  })
}

/** The active Run of the snapshot: its Run, execution and current attempt. */
export function activeRun(work: WorkSnapshot) {
  if (work.run.kind !== 'active' || work.run.advance === null)
    throw new Error('no active Run with an attempt')
  return {
    run: work.run.run,
    execution: work.run.execution.execution,
    attempt: work.run.advance.attempt,
  }
}

/** The registration of the model call `n`, bound to `attempt` (a Session consequence of event `n`). */
export function registrationOf(attempt: string, n: number | string): SessionLogConsequence {
  return {
    kind: 'call-registration',
    consumption: `log-consumption-${String(n)}` as ConsumptionId,
    registration: {
      kind: 'associated',
      binding: {
        producer: { kind: 'model', call: `log-model-${String(n)}` },
        action: `log-action-${String(n)}`,
        consumer: {
          owner: 'agent',
          work: 'log-work',
          position: `log-position-${String(n)}`,
          purpose: 'main',
        },
        request: evidence(`log/request/${String(n)}`),
        initiatingAttempt: attempt as never,
      },
      purpose: 'main',
    },
  }
}

/**
 * Event `n` of `execution` in session-1 of tenant A: its sequence and head revision are both `n`.
 * `tag` keeps the sources of two executions apart.
 */
export function eventOf(
  scene: Readonly<{ run: RunId; execution: string }>,
  n: number,
  consequences: readonly SessionLogConsequence[],
  operation: string,
  tag = scene.execution,
): SessionLogCommitObservation {
  return {
    tenant: TENANT_A,
    session: sessionId('session-1'),
    run: scene.run,
    execution: scene.execution,
    operation: operationId(operation),
    sequence: String(n),
    revision: String(n),
    source: evidence(`${tag}/event/${String(n)}`),
    executionEvidence: evidence(`${tag}/head/${String(n)}`),
    consequences,
  }
}

/** The Agent event that `observation` interprets, with the original kinds given (default: its own). */
export function agentEventOf(
  observation: SessionLogCommitObservation,
  kinds: readonly string[] = observation.consequences.map(item => item.kind),
): AgentEvent {
  if (observation.sequence === null) throw new Error('a numbered event')
  return {
    tenant: observation.tenant,
    session: observation.session,
    execution: observation.execution,
    sequence: observation.sequence,
    revision: observation.revision,
    source: observation.source,
    head: observation.executionEvidence,
    kinds,
  }
}

/**
 * The intent of handoff `handoff-1` under entry `entry-1` in session-1 of tenant A, before any Run.
 * `change` replaces members of the opaque intent. The kill case writes this one in a child.
 */
export function preadmissionIntent(
  change: Partial<PreadmissionIntent> = {},
): PreadmissionIntentWrite {
  return {
    phase: 'intent',
    tenant: TENANT_A,
    handoff: 'handoff-1',
    entry: 'entry-1',
    session: sessionId('session-1'),
    execution: null,
    intent: {
      request: { kind: 'invoke', input: 'hello' },
      origin: evidence('agent/origin/1') as unknown as JsonValue,
      principal: { kind: 'user', id: 'user-1' },
      qualification: evidence('agent/qualified/1') as unknown as JsonValue,
      adoption: { implementation: 'agent-1', version: '1' },
      materials: ['material-1'],
      ...change,
    },
  }
}
