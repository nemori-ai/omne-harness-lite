import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service, type Fiber } from '@deepseek-ai/cordis'
import { agentEvaluator } from '@omne-harness/agent'
import {
  createManualAgentClock,
  createScriptedAccessCheck,
  createScriptedActionAdmission,
  createScriptedDecisionCards,
  createScriptedExtensions,
  createScriptedMessageHandoff,
  createScriptedModelSelection,
  createScriptedReads,
  createScriptedToolRuntime,
  createTableAdoptions,
  createTableConditions,
  testAdoption,
} from '@omne-harness/agent/testing'
import {
  decodeAgentExecutionId,
  type AgentExecutionId,
  type AgentJournal,
  type DurableEvidence,
  type RuntimeConditions,
  type SelectedModel,
} from '@omne-harness/agent-contract'
import { createMemoryAgentAccountOutlet } from '@omne-harness/agent-contract/testing'
import {
  AgentContextProvider,
  MODEL_PREPARATION_RESOURCES,
} from '@omne-harness/agent-context/cordis'
import {
  ActionAdmissionService,
  AgentAccessCheckService,
  AgentAccountOutletService,
  AgentAdoptionsService,
  AgentClockService,
  CurrentConditionsService,
  DecisionCardsService,
  ExtensionImplementationsService,
  MessageHandoffService,
  ModelSelectionService,
  RegisteredReadsService,
  agentInstancesPlugin,
  agentJournalKey,
  agentModelReceptionTargetsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import {
  judgeMessage,
  parseMessageId,
  parseRecordEntryRef,
  type Message,
} from '@omne-harness/message'
import {
  decodeDispatchId,
  decodeModelInstanceId,
  type ModelCallId,
  type ModelOperationId,
  decodeResultVersion,
  type ModelProfile,
  type ModelRuntime,
} from '@omne-harness/model-contract'
import {
  createScriptedModelProvider,
  createScriptedModelRequestPreparation,
  createScriptedResultPusher,
  createScriptedTransport,
} from '@omne-harness/model-contract/testing'
import {
  ModelRequestPreparationService,
  ModelRuntimeService,
} from '@omne-harness/model-cordis-contract/cordis'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  createDefaultCompactionPolicy,
  createDefaultRepresentationPolicy,
} from '@omne-harness/request-context'
import {
  decodeHistorySequence,
  type AdoptedRequestSource,
  type HistoryEvidence,
  type HistoryRow,
  type SourceRead,
} from '@omne-harness/request-context-contract'
import {
  createAssemblyFixture,
  createMemoryAdoptedSource,
  createMemoryReadEligibility,
  createTestingPrincipalBinding,
} from '@omne-harness/request-context-contract/testing'
import { RequestContextProvider } from '@omne-harness/request-context-cordis/cordis'
import type { ContextHolderParts } from '@omne-harness/request-context-cordis-contract'
import { RequestContextTrustService } from '@omne-harness/request-context-cordis-contract/cordis'
import { createMemoryContextHolder } from '@omne-harness/request-context-cordis-contract/testing'
import type { EligibilityId, ScopeRef } from '@omne-harness/runtime-context-contract'
import { createTestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import { RuntimeContextProvider } from '@omne-harness/runtime-context-cordis/cordis'
import {
  RuntimeContextReaderEligibilityService,
  RuntimeContextTrustService,
  runtimeContextKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { createScriptedReaderEligibility } from '@omne-harness/runtime-context-cordis-contract/testing'
import {
  createSessionAgentDrivePlugin,
  createSessionJournalInterpretationPlugin,
  createSessionLogJournal,
  createSessionMessageHandoffPlugin,
  SessionLogAgentJournalProvider,
  type JournalPublicationReport,
} from '@omne-harness/session-adapters/cordis'
import type {
  GuardCommand,
  SessionTransactionPort,
  SessionAccess,
  SessionAccessRequest,
  SessionEvidenceBridge,
  SessionId,
} from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  createMemoryScopeRelease,
  createMemorySessionClock,
  createMemorySessionContextInput,
  createMemorySessionEvidenceBridge,
  createMemorySessionIdleInput,
  createMemorySessionNotifier,
  createPolicySessionAccessCheck,
  createScriptedSessionIdentityBridge,
  creation,
  evidence,
  initializationFixtureFacts,
  initializationFixtureGuard,
  memoryAccess,
  memoryOtherAccess,
  sessionId,
  type SessionAccessScript,
} from '@omne-harness/session-contract/testing'
import { createSessionCommitNotifier, SessionProvider } from '@omne-harness/session-cordis/cordis'
import {
  ScopeReleasePortService,
  SessionAccessCheckService,
  SessionClockService,
  SessionContextInputService,
  SessionDelegatedTransactionsService,
  SessionEvidenceBridgeService,
  SessionIdentityBridgeService,
  SessionIdleInputService,
  SessionInternalPrincipalsService,
  SessionNotifierService,
  SessionTransactionPortService,
  SessionWorkPrincipalsService,
} from '@omne-harness/session-cordis-contract/cordis'
import {
  createFixedSessionCursorSigning,
  createMemorySessionPrincipalBindings,
  createMemorySessionWorkPrincipals,
} from '@omne-harness/session-cordis-contract/testing'
import {
  createSessionStoragePair,
  registerSessionNotifier,
  sessionStorageMaterials,
} from '@omne-harness/session-storage-sql'
import {
  EXECUTION_RECORD_HANDLERS,
  EXECUTION_RECORD_PROTOCOL,
  SESSION_HISTORY_ROOT_HANDLER,
  SESSION_LOG_PARTICIPANTS,
  SESSION_READ_PROTOCOL,
  decodeExecutionRecordOpen,
  decodeSessionHistoryRoot,
} from '@omne-harness/session-storage-sql/participants'
import {
  combinationManifest,
  manifestDigest,
  type CommitResultV2,
  type DomainRef,
  type SqlMaterialCatalog,
  type SqlStorage,
  type TenantDomainLookup,
} from '@omne-harness/sql-contract'
import { StorageService, TenantDomainLookupService } from '@omne-harness/sql-contract/cordis'
import { ToolRuntimeService } from '@omne-harness/tool-cordis-contract/cordis'
import { createSqliteStorage, type SqliteStorageConfig } from '@omne-harness/sqlite-provider'
import {
  createLocalModelReceiver,
  createModelReceiverState,
  type AgentModelReceiver,
} from '../../src/index.ts'
import { agentHostPlugin, type AgentHostConfig } from '../../src/cordis.ts'

const COMBINATION = 'c1'
export const SESSION = 'cp3-session'
export const INPUT_TEXT = 'what did we decide?'
export const EARLIER = ['we met on Monday', 'we chose the blue plan'] as const
export const REPLY_TEXT = 'you chose the blue plan'

export const intakeAccess: SessionAccess<string> = memoryAccess('a:tester', SESSION)
export const strangerAccess: SessionAccess<string> = memoryOtherAccess('b:stranger', SESSION)
export const TENANT: TenantId = intakeAccess.tenant
const OTHER: TenantId = strangerAccess.tenant

export function textOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('unminted tenant')
  return encoded.value
}

const prefixOf = (tenant: TenantId) => (tenantEquals(tenant, TENANT) ? 'a' : 'b')
export const COORDINATOR = 'a:coordinator'

function sessionPolicy(request: SessionAccessRequest<string>): SessionAccessScript {
  const principal = request.access.principal
  const allowed: SessionAccessScript = {
    kind: 'allowed',
    evidence: evidence(`access/${request.operation}`),
  }
  if (principal.startsWith('system:')) return allowed
  const own = principal.startsWith('a:') ? TENANT : principal.startsWith('b:') ? OTHER : null
  if (!('tenant' in request.access) || own === null) return { kind: 'denied' }
  return tenantEquals(request.access.tenant, own) ? allowed : { kind: 'denied' }
}

export function ok<T>(outcome: Outcome<T, unknown>): T {
  if ('failure' in outcome) throw new Error(`expected success, got ${JSON.stringify(outcome)}`)
  return outcome.ok
}

function storageConfig(storageRoot: string): SqliteStorageConfig {
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
    maxJsonDepth: 256,
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
    checkpointIntervalMs: 3_600_000,
    checkpointWalBytes: 16777216,
    walReadPauseBytes: 67108864,
    walWriteStopBytes: 134217728,
    closeDeadlineMs: 10000,
  }
}

function catalogOf(): { catalog: SqlMaterialCatalog; digest: string } {
  const materials = sessionStorageMaterials({ readOutputLimitBytes: 20971520 })
  const catalog: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: materials.participants,
    migrations: materials.migrations,
    readHandlers: materials.readHandlers,
    declaredCombinations: {
      tenant: { combinationVersion: COMBINATION, participants: [...SESSION_LOG_PARTICIPANTS] },
      system: null,
    },
  }
  const manifest = combinationManifest({ catalog, participants: [...SESSION_LOG_PARTICIPANTS] })
  if (manifest.kind !== 'manifest') throw new Error(`combination is ${manifest.kind}`)
  return { catalog, digest: manifestDigest(manifest.manifest) }
}

export type SeenCommit = Readonly<{
  participants: readonly string[]
  result: CommitResultV2
  log: Readonly<{ execution: string; sequence: string | null }> | null
}>

function logOf(command: Readonly<{ facts?: unknown }>): SeenCommit['log'] {
  const facts = command.facts as Readonly<Record<string, unknown>> | undefined
  if (facts?.['intent'] !== 'log') return null
  const observation = facts['observation'] as Readonly<Record<string, unknown>> | null | undefined
  const execution = observation?.['execution']
  const sequence = observation?.['sequence']
  if (typeof execution !== 'string') return null
  return { execution, sequence: typeof sequence === 'string' ? sequence : null }
}

type Constructible = new (ctx: Context) => object
type AbstractService = abstract new (ctx: Context) => Service

function serviceOf(Base: AbstractService, port: object, name: string): Constructible {
  const Concrete = class extends (Base as unknown as Constructible) {
    constructor(ctx: Context) {
      super(ctx)
      Object.assign(this, port)
    }
  }
  Object.defineProperty(Concrete, 'name', { value: name })
  return Concrete
}

const LIFECYCLE_KEY = 's0.assemblyLifecycle'

class Lifecycle extends Service {
  constructor(ctx: Context) {
    super(ctx, LIFECYCLE_KEY)
  }
  register(): void {}
}

function userMessage(index: number, text: string): Message {
  const id = parseMessageId(`msg_${String(index).padStart(22, 'h')}`)
  if (!id.ok) throw new Error('fixture message id')
  const judged = judgeMessage({
    role: 'user',
    id: id.value,
    blocks: [{ kind: 'text', id: `h${index}`, visibility: { toModel: true, toHuman: true }, text }],
  })
  if ('rejected' in judged) throw new Error(`fixture message refused: ${judged.rejected}`)
  return judged.ok
}

function historyRow(index: number, text: string): HistoryRow {
  const seq = decodeHistorySequence(String(index))
  if ('failure' in seq) throw new Error('fixture sequence')
  const message = userMessage(index, text)
  if (message.role !== 'user') throw new Error('fixture role')
  const entry = parseRecordEntryRef(`entry:${index}`)
  if (entry === null) throw new Error('fixture entry')
  return { seq: seq.ok, entry, bytes: String(text.length), prefixDigest: `chain:${index}`, message }
}

type Pusher = ReturnType<typeof createScriptedResultPusher<unknown>>
type Scripted = ReturnType<typeof createScriptedModelProvider<unknown>>

export type ModelAdmission = Readonly<{
  tenant: TenantId
  call: ModelCallId
  operation: ModelOperationId
  index: number
  scripted: Scripted
  pusher: Pusher
}>

export type PluginWorld = Readonly<{
  adopted: AdoptedRequestSource<unknown>
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
  coordinator: (input: {
    tenant: TenantId
    session: SessionId
  }) => ReturnType<WorkPrincipals['forSession']>
}>
type WorkPrincipals = ReturnType<typeof createMemorySessionWorkPrincipals<string>>

export function withAd02AndHandoff(): LineWorldOptions {
  return {
    handoff: 'external',
    plugins: ({ combination, coordinator }) => [
      [createSessionJournalInterpretationPlugin<string>({ coordinator }).plugin],
      [
        createSessionMessageHandoffPlugin<string>({
          coordinator,
          principalIdentity: principal => `principal:${principal}`,
          provider: testAdoption('cp3-handoff'),
        }),
        combination,
      ],
    ],
  }
}

export type PluginMount = readonly [plugin: unknown, config?: unknown]

export type LineWorldOptions = Readonly<{
  wrapStorage?: (storage: SqlStorage) => SqlStorage
  journalPlugin?: (combination: {
    combinationVersion: string
    manifestDigest: string
  }) => PluginMount
  handoff?: 'scripted' | 'external'
  holder?: 'double' | 'external'
  contextPlugin?: typeof AgentContextProvider
  sessionProvider?: typeof SessionProvider
  model?: (admission: ModelAdmission) => Promise<unknown>
  storageLimits?: Partial<SqliteStorageConfig>
  progression?: 'evaluate-completion' | 'continue'
  root?: string
  hostConfig?: Partial<AgentHostConfig>
  hostPlugin?: unknown
  receiverRecords?: number
  plugins?: readonly PluginMount[] | ((world: PluginWorld) => readonly PluginMount[])
  wrapTransactions?: (port: SessionTransactionPort<string>) => SessionTransactionPort<string>
  wrapProvider?: <T extends object>(provider: T) => T
  wrapModelReceiver?: (receiver: AgentModelReceiver<unknown>) => AgentModelReceiver<unknown>
  receptionTargets?: 'journal'
  journalReport?: (report: JournalPublicationReport) => void
}>

async function replyWithText(admission: ModelAdmission): Promise<unknown> {
  const { pusher, tenant, call } = admission
  const target = { tenant, call }
  const dispatch = decodeDispatchId('mdisp_cp3')
  const version = decodeResultVersion('mrver_cp3')
  if ('failure' in dispatch || 'failure' in version) throw new Error('model identities')
  pusher.controller.start({ ...target, dispatch: dispatch.ok, firstContent: 'observed' })
  pusher.controller.settle({
    ...target,
    version: version.ok,
    termination: { kind: 'completed', reason: 'stop' },
    parts: [
      {
        kind: 'sealed',
        trims: [],
        block: {
          kind: 'text',
          id: 'blk_cp3_reply' as never,
          visibility: { toHuman: true, toModel: true },
          text: REPLY_TEXT,
        },
      },
    ],
    source: evidence(`settled/${call}`),
    pageSize: 10,
    pageTargetBytes: 65536,
  })
  return pusher.settled(target)
}

const AGENT_HOST_CONFIG: AgentHostConfig = {
  observerBufferBytes: 65536,
  reconciliationDelaysMs: [1000],
  reconciliationBatchLimit: 8,
  denialBackoffMs: 0,
  toolConcurrency: 1,
  jointCommits: ['message', 'context-transition', 'custody', 'processed'],
  coordination: 'coordinated',
  loopGuardPolicy: { owner: 'agents', name: 'loop-guard', revision: '1', digest: 'sha256:guard' },
  modelRetry: { maxAttempts: 1, maxElapsedMs: 0, delaysMs: [0], jitter: 0 },
  instanceIdleMs: 60_000,
}

export async function openLineWorld(options: LineWorldOptions = {}) {
  const root = options.root ?? (await realpath(await mkdtemp(join(tmpdir(), 'line-through-cp3-'))))
  const ctx = new Context()
  const mounted: Fiber[] = []
  const plug = ctx.plugin as unknown as (
    plugin: unknown,
    config?: unknown,
  ) => Fiber & PromiseLike<Fiber>
  const mount = async (plugin: unknown, config?: unknown): Promise<Fiber> => {
    const fiber = await plug(plugin, config)
    mounted.push(fiber)
    return fiber
  }
  const errors: string[] = []
  ctx.logger.exporter({
    export: message => {
      if (message.type === 'error') errors.push(message.args.map(String).join(' '))
    },
  })

  const { catalog, digest } = catalogOf()
  const created = await createSqliteStorage({
    config: { ...storageConfig(join(root, 'storage')), ...options.storageLimits },
    materials: catalog,
    closeLeases: { admit: name => ({ name }), release: () => undefined },
  })
  if (created.kind !== 'created') throw new Error(`provider rejected: ${created.reason}`)
  const real = created.storage
  const combination = { combinationVersion: COMBINATION, manifestDigest: digest }
  const domains: Readonly<Record<string, DomainRef>> = {
    [textOf(TENANT)]: {
      scope: { kind: 'tenant', tenant: textOf(TENANT) },
      transactionDomain: 'dom_0',
    },
    [textOf(OTHER)]: {
      scope: { kind: 'tenant', tenant: textOf(OTHER) },
      transactionDomain: 'dom_1',
    },
  }
  for (const domain of Object.values(domains)) {
    const registered = await real.registerCombination({
      ...domain,
      ...combination,
      participants: [...SESSION_LOG_PARTICIPANTS],
    })
    if (registered.kind !== 'registered') throw new Error(`registration ${registered.kind}`)
  }
  const commits: SeenCommit[] = []
  const seeing: SqlStorage = {
    database: real.database,
    registerCombination: input => real.registerCombination(input),
    commit: async (request, commitOptions) => {
      const result = await real.commit(request, commitOptions)
      commits.push({
        participants: request.commands.map(item => item.participant),
        result,
        log: request.commands.map(logOf).find(item => item !== null) ?? null,
      })
      return result
    },
    query: identity => real.query(identity),
    read: (request, readOptions) => real.read(request, readOptions),
  }
  const wrapped = options.wrapStorage?.(seeing)
  const storage: SqlStorage = wrapped ?? seeing
  const unregisterNotices = registerSessionNotifier(storage, createSessionCommitNotifier(ctx))
  const lookup: TenantDomainLookup = {
    lookup: input => {
      const domain = domains[input.tenant]
      return Promise.resolve(
        domain === undefined ? { kind: 'unregistered' } : { kind: 'ready', domain },
      )
    },
  }

  const sessionChecks = createPolicySessionAccessCheck<string>(sessionPolicy)
  const pairOver = (over: SqlStorage) =>
    createSessionStoragePair<string>({
      storage: over,
      domains: {
        resolve: input => {
          const domain = domains[input.tenant]
          return Promise.resolve(
            domain === undefined
              ? { kind: 'unavailable', diagnostic: 'no domain for the tenant' }
              : { kind: 'ready', entry: { tenant: input.tenant, domain } },
          )
        },
        snapshot: () =>
          Promise.resolve({
            kind: 'ready',
            value: {
              revision: '1',
              entries: Object.entries(domains).map(([tenant, domain]) => ({ tenant, domain })),
            },
          }),
      },
      accessCheck: sessionChecks,
      cursorSigning: createFixedSessionCursorSigning(),
      combination,
    })
  const pair = pairOver(storage)
  const probe = pairOver(seeing)

  const bindings = createMemorySessionPrincipalBindings()
  const workPrincipals = createMemorySessionWorkPrincipals<string>({
    bindings,
    issue: request => `${prefixOf(request.tenant)}:${request.actor}`,
  })
  const baseEvidence = createMemorySessionEvidenceBridge()
  const evidenceBridge: SessionEvidenceBridge = {
    prepare: async command => {
      if (command.kind === 'create') {
        const guards: readonly GuardCommand[] = [
          initializationFixtureGuard(
            initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
          ),
        ]
        return { ok: guards }
      }
      return baseEvidence.prepare(command)
    },
  }
  const idle = createMemorySessionIdleInput<string>({
    kind: 'unknown',
    at: {
      at: '2026-01-01T00:00:00.000Z',
      protocol: { owner: 'c', name: 'c', revision: '1', digest: 'd' },
      source: evidence('idle/at'),
    },
    scope: evidence('idle/scope'),
    source: evidence('idle/source'),
  })

  await mount(serviceOf(StorageService, storage, 'Storage'))
  await mount(serviceOf(TenantDomainLookupService, lookup, 'TenantDomainLookup'))
  await mount(serviceOf(SessionAccessCheckService, { check: sessionChecks.check }, 'AccessCheck'))
  const sessionClock = createMemorySessionClock()
  for (const [Base, port, name] of [
    [SessionDelegatedTransactionsService, pair.delegated, 'DelegatedTransactions'],
    [
      SessionInternalPrincipalsService,
      { coordinator: 'system:coordinator', maintainer: 'system:maintainer' },
      'InternalPrincipals',
    ],
    [SessionWorkPrincipalsService, workPrincipals, 'WorkPrincipals'],
    [
      SessionTransactionPortService,
      options.wrapTransactions?.(pair.transactions as never) ?? pair.transactions,
      'TransactionPort',
    ],
    [
      SessionIdentityBridgeService,
      createScriptedSessionIdentityBridge<string>('allow'),
      'Identity',
    ],
    [SessionEvidenceBridgeService, evidenceBridge, 'EvidenceBridge'],
    [SessionContextInputService, createMemorySessionContextInput<string>(), 'ContextInput'],
    [SessionIdleInputService, idle, 'IdleInput'],
    [SessionClockService, sessionClock, 'Clock'],
    [SessionNotifierService, createMemorySessionNotifier(), 'Notifier'],
    [ScopeReleasePortService, createMemoryScopeRelease(), 'ScopeRelease'],
  ] as const)
    await mount(serviceOf(Base as unknown as AbstractService, port, name))
  await mount(Lifecycle)

  const [journalPlugin, journalConfig] = options.journalPlugin?.(combination) ?? [
    SessionLogAgentJournalProvider,
    combination,
  ]
  await mount(journalPlugin, journalConfig)
  const journal = (): AgentJournal<unknown> => {
    const found = ctx.get(agentJournalKey)
    if (found === undefined) throw new Error('agentJournal is not provided')
    return found as AgentJournal<unknown>
  }
  const sessionLog = createSessionLogJournal<unknown>({
    storage,
    tenantDomainLookup: lookup,
    sessionAccessCheck: sessionChecks as never,
    combination,
    ...(options.journalReport === undefined ? {} : { report: options.journalReport }),
  }).forSession({ tenant: TENANT, session: sessionId(SESSION) as SessionId })

  const probeLog = createSessionLogJournal<unknown>({
    storage: seeing,
    tenantDomainLookup: lookup,
    sessionAccessCheck: sessionChecks as never,
    combination,
  }).forSession({ tenant: TENANT, session: sessionId(SESSION) as SessionId }).journal

  const access = createScriptedAccessCheck<unknown>()
  const adoptions = createTableAdoptions<unknown>()
  const run = creation().definition.candidate
  adoptions.define(run, {
    definition: { category: 'AgentDefinition', name: 'assistant' } as never,
    evaluator: agentEvaluator,
    extensions: [],
  })
  const clock = createManualAgentClock('2026-01-01T00:00:00Z')
  const handoff = createScriptedMessageHandoff<unknown>()
  const conditions = createTableConditions<unknown>()
  const selection = createScriptedModelSelection<unknown>()
  const scriptedHandoff: readonly (readonly [unknown, object, string])[] =
    options.handoff === 'external' ? [] : [[MessageHandoffService, handoff.port, 'MessageHandoff']]
  for (const [Base, port, name] of [
    [AgentAccessCheckService, access.port, 'AgentAccess'],
    [AgentAdoptionsService, adoptions.port, 'AgentAdoptions'],
    [AgentClockService, clock.port, 'AgentClock'],
    ...scriptedHandoff,
    [CurrentConditionsService, conditions.port, 'Conditions'],
    [ModelSelectionService, selection.port, 'ModelSelection'],
    [ExtensionImplementationsService, createScriptedExtensions<unknown>().port, 'Extensions'],
    [DecisionCardsService, createScriptedDecisionCards<unknown>().port, 'DecisionCards'],
    [ActionAdmissionService, createScriptedActionAdmission<unknown>().port, 'ActionAdmission'],
    [RegisteredReadsService, createScriptedReads<unknown>().port, 'Reads'],
  ] as const)
    await mount(serviceOf(Base as unknown as AbstractService, port as object, name))
  const tools = createScriptedToolRuntime<unknown>()
  await mount(
    serviceOf(ToolRuntimeService as unknown as AbstractService, tools.port, 'ToolRuntime'),
  )

  const fixture = createAssemblyFixture({
    tenant: TENANT,
    rows: EARLIER.map((text, index) => historyRow(index, text)),
    policies: {
      compaction: createDefaultCompactionPolicy({
        config: { retainBudget: { kind: 'tokens', retainTokens: '600' } },
      }),
      representation: createDefaultRepresentationPolicy(),
    },
  })
  const historyEvidence: HistoryEvidence = fixture.history.evidence()
  const resolved: DurableEvidence[] = []
  const parts: ContextHolderParts<unknown> = {
    history: fixture.sources.history as never,
    adopted: fixture.sources.adopted as never,
    eligibility: fixture.sources.eligibility as never,
    resolveHistory: async ({
      access: who,
      evidence: head,
    }): Promise<SourceRead<HistoryEvidence>> => {
      resolved.push(head)
      return tenantEquals(who.tenant, TENANT)
        ? { kind: 'value', value: historyEvidence }
        : { kind: 'denied' }
    },
  }
  const holder = createMemoryContextHolder<unknown>({ parts, admits: () => true })
  class RequestTrust extends RequestContextTrustService<unknown> {
    readonly principalBinding = createTestingPrincipalBinding<unknown>()
    readonly registrationAuthority = { check: async () => ({ kind: 'allowed' as const }) }
  }
  await mount(RequestTrust)
  await mount(RequestContextProvider, {
    policies: fixture.policies,
    accounting: {
      sourceAuthority: { check: async () => ({ kind: 'allowed' as const }) },
      readEligibility: createMemoryReadEligibility<unknown>(),
      adoptedSource: createMemoryAdoptedSource<unknown>(),
      recoveryAuthority: {
        check: async () => ({ kind: 'allowed' as const }),
        checkFact: async () => ({ kind: 'allowed' as const }),
      },
      limits: { maxTargets: 4, maxFactsPerTarget: 4, maxRevisionsPerDispatch: 4 },
    },
  })
  if (options.holder !== 'external') await mount(holder.plugin)
  const ports = createTestAuthorityPorts<unknown>()
  class RuntimeTrust extends RuntimeContextTrustService<unknown> {
    readonly authority = ports.authority
    readonly bindings = ports.bindings
  }
  await mount(RuntimeTrust)
  await mount(RuntimeContextProvider)
  const rc = ctx.get(runtimeContextKey)
  if (rc === undefined) throw new Error('no runtime context')
  type EligibilityScript = Parameters<typeof createScriptedReaderEligibility<unknown>>[0]
  const script = {
    scopes: [] as EligibilityScript['scopes'][number][],
    answers: [] as EligibilityScript['answers'][number][],
  }
  const holdScope = async (scope: ScopeRef): Promise<void> => {
    ports.bind(scope, TENANT)
    const begun = await rc.beginReplay('holder', {
      scope,
      tenant: TENANT,
      through: null,
      supersedes: null,
    })
    if (begun.kind !== 'replaying') throw new Error(begun.kind)
    await rc.finishReplay('holder', {
      replay: begun.replay,
      material: { registrations: [], checkpoints: [], end: null },
    })
    const issued = await rc.issueEligibility('holder', {
      supersedes: null,
      scope,
      consumer: 'model',
      principal: COORDINATOR,
      tenant: TENANT,
      keys: [],
      bindings: [],
      registrationRevision: 0,
    })
    if (issued.kind !== 'issued') throw new Error(issued.kind)
    script.scopes.push({ scope, tenant: TENANT })
    script.answers.push({
      request: { principal: COORDINATOR, tenant: TENANT, scope, consumer: 'model' },
      result: { kind: 'current', eligibility: issued.eligibility.id as EligibilityId },
    })
  }
  await holdScope(fixture.target.scope)
  const eligibility = createScriptedReaderEligibility<unknown>(script)
  class Handoff extends RuntimeContextReaderEligibilityService<unknown> {
    current(request: Parameters<RuntimeContextReaderEligibilityService<unknown>['current']>[0]) {
      return eligibility.current(request)
    }
  }
  await mount(Handoff)

  const transport = createScriptedTransport({
    receipt: {
      supplier: testAdoption('cp3-transport'),
      representation: testAdoption('cp3-representation'),
      payloadDigest: 'none',
    },
    facts: [],
    ending: { kind: 'terminated', termination: { kind: 'completed', reason: 'stop' } },
    rejection: null,
  })
  const preparationDouble = createScriptedModelRequestPreparation<unknown>({
    transport: transport.transport,
  })
  preparationDouble.setAccess({ principal: COORDINATOR, tenant: TENANT }, 'allow')
  const fixtureProfile: ModelProfile = fixture.sources.values().model.profile
  const [fixtureSupplier] = fixtureProfile.definition.suppliers
  const supplier = { ...fixtureSupplier, adoption: testAdoption('cp3-supplier') }
  const profile: ModelProfile = {
    ...fixtureProfile,
    adoption: testAdoption('cp3-profile'),
    definition: {
      ...fixtureProfile.definition,
      suppliers: [supplier],
      representation: testAdoption('cp3-representation'),
      meter: testAdoption('cp3-meter'),
      retryPolicy: testAdoption('cp3-retry'),
    },
  }
  const assembled: Message[][] = []
  class Preparation extends ModelRequestPreparationService<unknown> {
    readonly prepare = (
      input: Parameters<ModelRequestPreparationService<unknown>['prepare']>[0],
    ) => {
      assembled.push([...input.assembled.messages])
      preparationDouble.setPlan(
        {
          tenant: input.tenant,
          principal: input.principal,
          profile: input.profile,
          required: input.required,
          parameters: input.assembled.parameters,
        },
        {
          ok: {
            suppliers: [
              {
                adoption: supplier.adoption,
                provider: supplier.provider,
                model: supplier.model,
                credential: { layer: 'official' as const },
              },
            ],
            parameterAdoptions: [],
          },
        },
      )
      return preparationDouble.preparation.prepare(input)
    }
  }
  await mount(Preparation)
  await mount({
    name: 'x3-stand-in',
    apply(inner: Context) {
      inner.provide(MODEL_PREPARATION_RESOURCES, fixture.preparation)
    },
  })
  await mount(options.contextPlugin ?? AgentContextProvider, {
    owner: { owner: 'agent-context', name: 'cp3', revision: '1', digest: 'd' },
  })

  const selected: SelectedModel = {
    recipient: { route: 'route', profile: profile.adoption },
    resolution: {
      kind: 'resolved',
      profile,
      source: evidence('profile'),
      selectable: true,
      reasons: [],
      credential: 'available',
      shadowed: [],
    },
    parameters: [],
    tools: evidence('tools'),
    evidence: evidence('selection'),
  }
  const current: RuntimeConditions = {
    source: evidence('conditions'),
    configuration: run,
    progression: {
      kind: options.progression ?? 'evaluate-completion',
      basis: evidence('progression'),
    },
    model: profile.adoption,
    context: evidence('conditions-context'),
    bindings: [],
  }
  conditions.read.always(() => succeed(current))
  selection.select.always(() => succeed(selected))

  const instance = decodeModelInstanceId('minst_cp3')
  if ('failure' in instance) throw new Error('model instance')
  const scripted = createScriptedModelProvider<unknown>({ instance: instance.ok })
  const outlet = createMemoryAgentAccountOutlet<unknown>()
  const receiverState = createModelReceiverState<unknown>()
  const pushes: Promise<unknown>[] = []
  const admits: unknown[] = []
  let lastExecution: AgentExecutionId | null = null
  async function runExecution(): Promise<AgentExecutionId | null> {
    const work = await probe.transactions.readWork({
      principal: 'system:maintainer',
      tenant: TENANT,
      session: sessionId(SESSION),
    })
    if ('failure' in work) return lastExecution
    const { run } = work.ok
    if (run.kind === 'active') lastExecution = executionOf(run.execution.execution)
    if (run.kind === 'terminal') {
      const ended = work.ok.executions?.find(item => item.run === run.terminal.run)
      if (ended !== undefined) lastExecution = executionOf(ended.execution.execution)
    }
    return lastExecution
  }
  const reception = createLocalModelReceiver<unknown>(
    {
      provider: options.wrapProvider?.(sessionLog) ?? sessionLog,
      access: access.port,
      targets:
        options.receptionTargets === 'journal'
          ? {
              forExecution(input) {
                const targets = ctx.get(agentModelReceptionTargetsKey)
                if (targets === undefined)
                  throw new Error('agentModelReceptionTargets is not provided')
                return targets.forExecution(input)
              },
              resolve(input) {
                const targets = ctx.get(agentModelReceptionTargetsKey)
                if (targets === undefined)
                  throw new Error('agentModelReceptionTargets is not provided')
                return targets.resolve(input)
              },
            }
          : {
              async forExecution(input) {
                const loaded = await probeLog.load({ ...input.access, execution: input.execution })
                if ('failure' in loaded) return loaded
                const instance = loaded.ok.executionAttachment?.instance
                return succeed(
                  loaded.ok.effects.flatMap(effect =>
                    effect.pending.kind === 'model' && instance !== undefined
                      ? [{ execution: input.execution, instance, pending: effect.pending }]
                      : [],
                  ),
                )
              },
              async resolve(input) {
                const execution = await runExecution()
                if (execution !== null) {
                  const loaded = await probeLog.load({ ...input.access, execution })
                  if ('failure' in loaded) return loaded
                  const pending = loaded.ok.effects
                    .map(effect => effect.pending)
                    .find(item => item.kind === 'model' && item.reference === input.reference)
                  const instance = loaded.ok.executionAttachment?.instance
                  if (pending !== undefined && pending.kind === 'model' && instance !== undefined)
                    return succeed({ execution, instance, pending })
                }
                return fail({ kind: 'denied', action: 'resolve' })
              },
            },
      outlet,
      models: scripted.provider.runtime.calls,
      capacity: () => ({
        records: options.receiverRecords ?? 10000,
        bytes: 64 * 1024 * 1024,
        attachments: 10000,
        inFlight: 64,
      }),
    },
    receiverState,
  )
  if ('failure' in reception) throw new Error(`receiver: ${JSON.stringify(reception.failure)}`)
  const receiver = options.wrapModelReceiver?.(reception.ok) ?? reception.ok
  const pusher = createScriptedResultPusher<unknown>({
    scripted,
    principal: COORDINATOR,
    resolveReceiver: () => receiver,
  })
  const base = pusher.provider.runtime
  const behaviour = options.model ?? replyWithText
  const models: ModelRuntime<unknown> = {
    ...base,
    calls: {
      ...base.calls,
      async admit(input) {
        const admitted = await base.calls.admit(input)
        admits.push(admitted)
        if ('ok' in admitted) {
          const index = admits.length - 1
          pushes.push(
            behaviour({
              tenant: input.tenant,
              call: input.call,
              operation: input.operation,
              index,
              scripted,
              pusher,
            }),
          )
        }
        return admitted
      },
    },
  }
  await mount(serviceOf(ModelRuntimeService, models, 'ModelRuntime'))
  await mount(
    serviceOf(AgentAccountOutletService as unknown as AbstractService, outlet, 'AccountOutlet'),
  )

  ctx.provide('agentHostPrincipal', 'agent-host-maintainer')
  await mount(options.hostPlugin ?? agentHostPlugin, {
    ...AGENT_HOST_CONFIG,
    ...options.hostConfig,
  })
  await mount(agentInstancesPlugin)
  await mount(
    createSessionAgentDrivePlugin<string>({
      coordinator: input => workPrincipals.forSession({ actor: 'coordinator', ...input }),
    }),
  )
  const extra =
    typeof options.plugins === 'function'
      ? options.plugins({
          adopted: fixture.sources.adopted as never,
          combination,
          coordinator: input => workPrincipals.forSession({ actor: 'coordinator', ...input }),
        })
      : (options.plugins ?? [])
  for (const [plugin, config] of extra) await mount(plugin, config)

  await mount(options.sessionProvider ?? SessionProvider, { admission: 'none' })

  const intake = await (async () => {
    let seen: Context | undefined
    await mount({
      name: 'caller-intake',
      inject: { session: { caller: 'intake' } },
      apply: (inner: Context) => {
        seen = inner
      },
    })
    if (seen === undefined) throw new Error('the intake caller did not run')
    return seen.session
  })()

  async function published(): Promise<{ agent: string; session: string }> {
    const domain = domains[textOf(TENANT)]!
    const read = async (handler: string, protocol: string) => {
      const result = await real.read({
        domain,
        handler,
        protocol,
        requestKey: `cp3-${handler}`,
        input: { tenant: textOf(TENANT), session: SESSION },
      })
      if (result.kind !== 'read') throw new Error(`${handler}: ${result.kind}`)
      return result.output
    }
    const agent = decodeExecutionRecordOpen(
      await read(EXECUTION_RECORD_HANDLERS.openExecutions, EXECUTION_RECORD_PROTOCOL),
    )
    const root = decodeSessionHistoryRoot(
      await read(SESSION_HISTORY_ROOT_HANDLER, SESSION_READ_PROTOCOL),
    )
    if (agent === null || agent.kind !== 'open' || root === null)
      throw new Error('the common root is not readable')
    return { agent: agent.published, session: root.published }
  }

  return {
    errors,
    commits,
    holdScope,
    ctx,
    mount,
    storage,
    sessionLog,
    access,
    tools,
    outlet,
    scripted,
    pusher,
    receiverState,
    workPrincipals,
    transactions: pair.transactions,
    probe: probe.transactions,
    probeLog,
    intake,
    bindings,
    journal,
    fresh: () =>
      createSessionLogJournal<unknown>({
        storage,
        tenantDomainLookup: lookup,
        sessionAccessCheck: sessionChecks as never,
        combination,
      }).forSession({ tenant: TENANT, session: sessionId(SESSION) as SessionId }).journal,
    freshEntries: () =>
      createSessionLogJournal<unknown>({
        storage,
        tenantDomainLookup: lookup,
        sessionAccessCheck: sessionChecks as never,
        combination,
      }).forSession({ tenant: TENANT, session: sessionId(SESSION) as SessionId }).entries,
    published,
    pushes,
    admits,
    runExecution,
    clock,
    sessionClock,
    resolved,
    assembled,
    async close(): Promise<void> {
      for (const fiber of mounted.splice(0).reverse()) {
        try {
          await fiber.dispose()
        } catch {}
      }
      unregisterNotices()
      await created.control.close({ initiator: 'disposal' }).catch(() => undefined)
      if (options.root === undefined) await rm(root, { recursive: true, force: true })
    },
  }
}

export type LineWorld = Awaited<ReturnType<typeof openLineWorld>>

export function executionOf(text: string): AgentExecutionId {
  const decoded = decodeAgentExecutionId(text)
  if ('failure' in decoded) throw new Error('not an execution')
  return decoded.ok
}
