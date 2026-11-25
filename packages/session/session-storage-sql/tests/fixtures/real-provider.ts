import { SESSION_LOG_PARTICIPANTS } from '../../src/participants.ts'
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
  inputId,
  operationId,
  ordinaryInput,
  sessionId,
  testingTenant,
  testingDerivedInputs,
  testingInputSources,
  withMemberSubject,
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
  type SessionStorageOptions,
} from '../../src/index.ts'
import {
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

export function realConfig(storageRoot: string): SqliteStorageConfig {
  return {
    storageRoot,
    admissionQueueLimit: 64,
    globalAdmissionLimit: 256,
    admissionWaitMs: 1000,
    lockWaitMs: 5000,
    maxCommandsPerCommit: 16,
    maxCommandBytes: 1048576,
    maxRequestBytes: 4194304,
    globalInFlightWriteBytes: 67108864,
    maxJsonDepth: 64,
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
    checkpointIntervalMs: 3_600_000,
    checkpointWalBytes: 16777216,
    walReadPauseBytes: 67108864,
    walWriteStopBytes: 134217728,
    closeDeadlineMs: 10000,
  }
}

function catalogOf(
  readOutputLimitBytes: number,
  participants: readonly string[],
  extra: SqlMaterialCatalog['participants'],
): { catalog: SqlMaterialCatalog; digest: string } {
  const materials = sessionStorageMaterials({ readOutputLimitBytes })
  const catalog: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: [...materials.participants, ...extra],
    migrations: materials.migrations,
    readHandlers: materials.readHandlers,
    declaredCombinations: {
      tenant: { combinationVersion: COMBINATION, participants },
      system: null,
    },
  }
  const manifest = combinationManifest({ catalog, participants })
  if (manifest.kind !== 'manifest') throw new Error(`combination is ${manifest.kind}`)
  return { catalog, digest: manifestDigest(manifest.manifest) }
}

export type QueryKind = QueryResultV2['kind']
export const queryKindOf = (result: QueryResultV2): QueryKind => result.kind

export const identityOf = (
  tenant: TenantId,
  domain: string,
  operation: string,
  attempt = 1,
  session = 'session-1',
): SqlIdentity => ({
  scope: { kind: 'tenant', tenant: textOf(tenant) },
  transactionDomain: domain,
  operation,
  protocolVersion: '2',
  operationKey: JSON.stringify([session, operation, attempt]),
  recall: 'never',
})

export type WalSample = Readonly<{ commits: number; generation: string }>

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
  root?: string
  config?: Partial<SqliteStorageConfig>
  tenants?: readonly TenantId[]
  intakeLimits?: import('@omne-harness/session-contract').SessionIntakeLimits
  readOutputLimitBytes?: number
  participants?: readonly string[]
  extraParticipants?: SqlMaterialCatalog['participants']
  policy?: Parameters<typeof createPolicySessionAccessCheck<string>>[0]
  protectedBasis?: SessionStorageOptions<string>['protectedBasis']
  budget?: SessionStorageOptions<string>['budget']
}>

export async function openRealApp(options: RealAppOptions = {}) {
  const owned = options.root === undefined
  const root = options.root ?? (await realpath(await mkdtemp(join(tmpdir(), 'session-real-'))))
  const storageRoot = join(root, 'storage')
  const participants = options.participants ?? SESSION_LOG_PARTICIPANTS
  const { catalog, digest } = catalogOf(
    options.readOutputLimitBytes ?? FIXTURE_READ_OUTPUT_LIMIT_BYTES,
    participants,
    options.extraParticipants ?? [],
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
  const storage: SqlStorage = {
    database: real.database,
    registerCombination: input => real.registerCombination(input),
    commit: request => {
      if (request.identity.operation !== 'session.lookup') ops += 1
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
      participants,
    })
    if (registered.kind !== 'registered')
      throw new Error(
        `registration of ${entry.domain.transactionDomain} is ${registered.kind}: ${JSON.stringify(registered)}`,
      )
  }

  const accessCheck = createPolicySessionAccessCheck<string>(
    options.policy ??
      (request => ({ kind: 'allowed', evidence: evidence(`access/${request.operation}`) })),
  )
  const register = async (combinationVersion: string, members: readonly string[]) => {
    const manifest = combinationManifest({ catalog, participants: members })
    if (manifest.kind !== 'manifest') throw new Error(`combination is ${JSON.stringify(manifest)}`)
    const reference = { combinationVersion, manifestDigest: manifestDigest(manifest.manifest) }
    for (const entry of entries) {
      const registered = await real.registerCombination({
        ...entry.domain,
        ...reference,
        participants: members,
      })
      if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
    }
    return reference
  }
  const storageOptions = {
    ...(options.intakeLimits === undefined ? {} : { intakeLimits: options.intakeLimits }),
    ...(options.protectedBasis === undefined ? {} : { protectedBasis: options.protectedBasis }),
    ...(options.budget === undefined ? {} : { budget: options.budget }),
    storage,
    domains,
    accessCheck: withMemberSubject(accessCheck),
    cursorSigning: createFixedSessionCursorSigning(),
    sources: testingInputSources(),
    derived: testingDerivedInputs(),
    combination: { combinationVersion: COMBINATION, manifestDigest: digest },
  }
  const port = createSessionStorage<string>(storageOptions)
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
    domains,
    control,
    events,
    accessCheck,
    register,
    access,
    create,
    accept,
    close,
    dispose,
    domainFile: (domain: string): string =>
      join(storageRoot, 'domains', `${Buffer.from(domain).toString('hex')}.sqlite`),
    opCount: () => ops,
    domainOf: (tenant: TenantId): string => {
      const entry = entries.find(item => item.tenant === textOf(tenant))
      if (entry === undefined) throw new Error('unknown tenant')
      return entry.domain.transactionDomain
    },
  }
}

export type RealApp = Awaited<ReturnType<typeof openRealApp>>

export function jointWrite(over: Partial<ExecutionRecordWrite> = {}): ExecutionRecordWrite {
  return {
    tenant: TENANT_A,
    session: sessionId('session-1'),
    execution: 'exe_1',
    settledBy: null,
    expected: null,
    revision: '1',
    published: '0',
    operation: 'aop_joint',
    digest: 'sha256:joint',
    facts: [{ kind: 'exec.opened', body: { receipt: 'joint' } }],
    blobs: [],
    items: [],
    boundaries: [
      {
        execution: 'exe_1',
        revision: '1',
        receipt: evidence('agent/exe_1/1'),
        emittedThrough: '0',
        acknowledged: '0',
        ended: null,
      },
    ],
    admissions: [],
    ...over,
  }
}

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
  consequences?: JsonValue
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
      handler: 'session.work-version',
      protocol: '1',
      requestKey: `version-${String(writes)}`,
      input: { tenant: textOf(tenant), session },
    })
    if (read.kind !== 'read') throw new Error(`the publication count is not readable: ${read.kind}`)
    const version = read.output as Readonly<{ published?: string }> | null
    return version?.published ?? '0'
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
    blobs: [],
    items: [],
    settledBy: null,
  })
  return {
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
            acknowledged: '0',
            ended: ended as never,
          },
        ],
        facts: [
          {
            kind: 'event',
            event: {
              sequence: event.sequence,
              source: event.source,
              kinds: event.kinds,
              ...(event.batch === undefined ? {} : { batch: event.batch }),
              ...(event.consequences === undefined ? {} : { consequences: event.consequences }),
            },
            body: { fixture: writes },
          },
        ],
        admissions: [],
      })
      heads.set(key, { revision: event.revision, emitted, ended })
      seen.add(`${key}#${event.sequence}`)
    },
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
        facts: [{ kind: 'input.accepted', body: { input: admission.input } }],
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

type SceneApp = Readonly<{
  port: SessionTransactionPort<string>
  access: (tenant: TenantId, session?: string) => SessionAccess<string>
}>

export async function workOf(a: SceneApp): Promise<WorkSnapshot> {
  const read = await a.port.readWork(a.access(TENANT_A))
  if ('failure' in read) throw new Error(`readWork: ${JSON.stringify(read.failure)}`)
  return read.ok
}

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

/** Puts accepted inputs into the model view the way a step of the active Run does. */
export async function deliver(a: SceneApp, name: string, inputs: readonly string[]) {
  const work = await workOf(a)
  if (work.run.kind !== 'active') throw new Error('no active Run')
  return a.port.commit({
    access: a.access(TENANT_A),
    command: {
      kind: 'recordMessage',
      input: {
        tenant: TENANT_A,
        session: sessionId('session-1'),
        operation: operationId(`deliver-${name}`),
        participation: {
          execution: work.run.execution.execution,
          operation: `agent-deliver-${name}`,
          joint: 'delivered',
          written: work.run.execution.revision ?? '0',
          handover: evidence(`deliver-${name}`),
        },
        value: {
          deliveries: inputs.map(input => ({
            input: inputId(input),
            message: ordinaryInput(input).message,
          })),
          source: evidence(`agent/step/${name}`),
          admission: evidence(`agent/step/${name}`),
        },
      },
    },
    guards: [],
  })
}

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

export function activeRun(work: WorkSnapshot) {
  if (work.run.kind !== 'active' || work.run.advance === null)
    throw new Error('no active Run with an attempt')
  return {
    run: work.run.run,
    execution: work.run.execution.execution,
    attempt: work.run.advance.attempt,
    revision: work.run.revision,
  }
}

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
