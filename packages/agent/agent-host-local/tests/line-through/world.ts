// The world of CP3, the third in-line checkpoint (E.1): one real Cordis 4.0.4 root that carries the
// whole line from a Session input to the joint commit of a Model result.
//
// Real (the product plugins and factories under test):
// - the sqlite-provider on files in a temporary directory, with the Session log combination
//   (execution-record and session) registered for the tenant's transaction domain;
// - session-storage-sql `createSessionStoragePair` (the `sessionTransactions` and
//   `sessionDelegatedTransactions` ports) over it;
// - session-cordis `SessionProvider` (the session factory with S1 and the open-Run sequence of C2);
// - AD-14, `createSessionAgentDrivePlugin` of session-adapters (`sessionAgentDrive`);
// - the `agentJournal` plugin `SessionLogAgentJournalProvider` of session-adapters;
// - the `agent-host` plugin with the production factory `createAgentRuntime`, and the directory
//   plugin `agentInstancesPlugin`;
// - agent-context `AgentContextProvider` (`agentRequests`, `agentModelContext`) over the real
//   request-context-cordis and runtime-context-cordis providers;
// - the receiver `createLocalModelReceiver`, built here and not registered through the host plugin
//   (C22 G2), over the `received` and `materials` faces of the session-log Journal of the session.
//
// Doubles (each named where it is built):
// - J06: `agentMessageHandoff` is `createScriptedMessageHandoff` and `agentConditions` is
//   `createTableConditions` of `@omne-harness/agent/testing` (R1-D33);
// - Model: the scripted provider and result pusher of `@omne-harness/model-contract/testing`;
// - the receiver's `targets` (the query of the original consumption binding): no product provides
//   it yet, so the world answers it from the Journal's public `load`; the account outlet is memory;
// - the Agent's access check, adoptions, model selection, clock and the stage ports (tools,
//   extensions, cards, action admission, registered reads) are `@omne-harness/agent/testing`
//   doubles; `agentMaterials` forwards to the session-log Journal of the session;
// - the earlier context ("前文") is the history of the K-RQ holder double
//   (`createMemoryContextHolder` over `createAssemblyFixture`), not a read of the Session log: the
//   RQ sources of the Session log (AD-03, AD-04) are not delivered. The K-RC reader eligibility
//   handoff, the Model request preparation and the X-3 preparation resources are doubles too;
// - the Session side ports other than storage and the Agent drive (identity, evidence, context
//   input, idle input, clock, notifier, scope release, principals, access check, the assembly
//   lifecycle) are doubles of session-contract and session-cordis-contract.
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
  AgentAdoptionsService,
  AgentClockService,
  AgentMaterialsService,
  CurrentConditionsService,
  DecisionCardsService,
  ExtensionImplementationsService,
  MessageHandoffService,
  ModelSelectionService,
  RegisteredReadsService,
  agentInstancesPlugin,
  agentJournalKey,
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
import type { EligibilityId } from '@omne-harness/runtime-context-contract'
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
  createSessionLogJournal,
  SessionLogAgentJournalProvider,
} from '@omne-harness/session-adapters/cordis'
import type {
  GuardCommand,
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
import { SessionProvider } from '@omne-harness/session-cordis/cordis'
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
  sessionStorageMaterials,
} from '@omne-harness/session-storage-sql'
import {
  EXECUTION_RECORD_HANDLERS,
  EXECUTION_RECORD_PROTOCOL,
  SESSION_HISTORY_ROOT_HANDLER,
  SESSION_LOG_PARTICIPANTS,
  SESSION_PROTOCOL,
  decodeExecutionRecordState,
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
import { createSqliteStorage, type SqliteStorageConfig } from '@omne-harness/sqlite-provider'
import { createLocalModelReceiver, createModelReceiverState } from '../../src/index.ts'
import { agentHostPlugin, type AgentHostConfig } from '../../src/cordis.ts'

const COMBINATION = 'c1'
/** The session the checkpoint drives. */
export const SESSION = 'cp3-session'
/** The text of the input the Session accepts. */
export const INPUT_TEXT = 'what did we decide?'
/** The texts of the earlier context that the holder double serves. */
export const EARLIER = ['we met on Monday', 'we chose the blue plan'] as const
/** The text the scripted Model answers. */
export const REPLY_TEXT = 'you chose the blue plan'

// --- tenants and principals ---------------------------------------------------------------------

/** The caller of the intake face, of the tenant of the session. */
export const intakeAccess: SessionAccess<string> = memoryAccess('a:tester', SESSION)
/** A principal of another tenant. */
export const strangerAccess: SessionAccess<string> = memoryOtherAccess('b:stranger', SESSION)
export const TENANT: TenantId = intakeAccess.tenant
const OTHER: TenantId = strangerAccess.tenant

export function textOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('unminted tenant')
  return encoded.value
}

const prefixOf = (tenant: TenantId) => (tenantEquals(tenant, TENANT) ? 'a' : 'b')
/** The principal the Session work principals issue to the coordinator of the session. */
export const COORDINATOR = 'a:coordinator'

/** A principal acts on its own tenant; `system:` principals act on any tenant (session-cordis CP1). */
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

// --- the storage --------------------------------------------------------------------------------

function storageConfig(storageRoot: string): SqliteStorageConfig {
  return {
    storageRoot,
    admissionQueueLimit: 64,
    globalAdmissionLimit: 256,
    lockWaitMs: 5000,
    maxCommandsPerCommit: 16,
    maxCommandBytes: 1048576,
    maxRequestBytes: 4194304,
    globalInFlightWriteBytes: 67108864,
    // The Session create of the session-log combination needs more than 64 (session-adapters K-14).
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
    maxReadResultBytes: 4194304,
    globalReadResultBytes: 33554432,
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
  const materials = sessionStorageMaterials()
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

/** One storage commit as the storage saw it: the participants of its commands and its answer. */
export type SeenCommit = Readonly<{ participants: readonly string[]; result: CommitResultV2 }>

// --- Cordis helpers ------------------------------------------------------------------------------

type Constructible = new (ctx: Context) => object
type AbstractService = abstract new (ctx: Context) => Service

/** A concrete subclass of a definition class whose members are those of `port`. */
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

/** The ordered-shutdown registry of the assembly entry: it keeps registrations and stops nothing. */
class Lifecycle extends Service {
  constructor(ctx: Context) {
    super(ctx, LIFECYCLE_KEY)
  }
  register(): void {}
}

// --- the earlier context ------------------------------------------------------------------------

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

// --- the world ----------------------------------------------------------------------------------

const AGENT_HOST_CONFIG: AgentHostConfig = {
  observerBufferBytes: 65536,
  reconciliationDelayMs: 1000,
  reconciliationBatchLimit: 8,
  denialBackoffMs: 0,
  toolConcurrency: 1,
  jointCommits: ['message', 'context-transition', 'custody', 'processed'],
  coordination: 'coordinated',
  loopGuardPolicy: { owner: 'agents', name: 'loop-guard', revision: '1', digest: 'sha256:guard' },
  instanceIdleMs: 60_000,
}

/** Builds the world: every plugin mounted and active, no session created yet. */
export async function openLineWorld() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'line-through-cp3-')))
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

  // The real storage, one transaction domain per tenant, the Session log combination registered.
  const { catalog, digest } = catalogOf()
  const created = await createSqliteStorage({
    config: storageConfig(join(root, 'storage')),
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
  const storage: SqlStorage = {
    registerCombination: input => real.registerCombination(input),
    commit: async (request, options) => {
      const result = await real.commit(request, options)
      commits.push({ participants: request.commands.map(item => item.participant), result })
      return result
    },
    query: identity => real.query(identity),
    read: (request, options) => real.read(request, options),
  }
  const lookup: TenantDomainLookup = {
    lookup: input => {
      const domain = domains[input.tenant]
      return Promise.resolve(
        domain === undefined ? { kind: 'unregistered' } : { kind: 'ready', domain },
      )
    },
  }

  // The Session storage pair over the real storage, with the Session access policy.
  const sessionChecks = createPolicySessionAccessCheck<string>(sessionPolicy)
  const pair = createSessionStoragePair<string>({
    storage,
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

  // Session side doubles.
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

  // The storage keys of the Journal plugin and the Session access check, shared by both sides.
  await mount(serviceOf(StorageService, storage, 'Storage'))
  await mount(serviceOf(TenantDomainLookupService, lookup, 'TenantDomainLookup'))
  await mount(serviceOf(SessionAccessCheckService, { check: sessionChecks.check }, 'AccessCheck'))
  for (const [Base, port, name] of [
    [SessionDelegatedTransactionsService, pair.delegated, 'DelegatedTransactions'],
    [
      SessionInternalPrincipalsService,
      { coordinator: 'system:coordinator', maintainer: 'system:maintainer' },
      'InternalPrincipals',
    ],
    [SessionWorkPrincipalsService, workPrincipals, 'WorkPrincipals'],
    [SessionTransactionPortService, pair.transactions, 'TransactionPort'],
    [
      SessionIdentityBridgeService,
      createScriptedSessionIdentityBridge<string>('allow'),
      'Identity',
    ],
    [SessionEvidenceBridgeService, evidenceBridge, 'EvidenceBridge'],
    [SessionContextInputService, createMemorySessionContextInput<string>(), 'ContextInput'],
    [SessionIdleInputService, idle, 'IdleInput'],
    [SessionClockService, createMemorySessionClock(), 'Clock'],
    [SessionNotifierService, createMemorySessionNotifier(), 'Notifier'],
    [ScopeReleasePortService, createMemoryScopeRelease(), 'ScopeRelease'],
  ] as const)
    await mount(serviceOf(Base as unknown as AbstractService, port, name))
  await mount(Lifecycle)

  // The Journal plugin.
  await mount(SessionLogAgentJournalProvider, combination)
  const journal = (): AgentJournal<unknown> => {
    const found = ctx.get(agentJournalKey)
    if (found === undefined) throw new Error('agentJournal is not provided')
    return found as AgentJournal<unknown>
  }
  // The session-log Journal of the session itself, for the receiver and the materials stage.
  const sessionLog = createSessionLogJournal<unknown>({
    storage,
    tenantDomainLookup: lookup,
    sessionAccessCheck: sessionChecks as never,
    combination,
  }).forSession({ tenant: TENANT, session: sessionId(SESSION) as SessionId })

  // Agent ports: doubles of `@omne-harness/agent/testing`.
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
  for (const [Base, port, name] of [
    [AgentAccessCheckService, access.port, 'AgentAccess'],
    [AgentAdoptionsService, adoptions.port, 'AgentAdoptions'],
    [AgentClockService, clock.port, 'AgentClock'],
    [MessageHandoffService, handoff.port, 'MessageHandoff'],
    [CurrentConditionsService, conditions.port, 'Conditions'],
    [ModelSelectionService, selection.port, 'ModelSelection'],
    [ExtensionImplementationsService, createScriptedExtensions<unknown>().port, 'Extensions'],
    [DecisionCardsService, createScriptedDecisionCards<unknown>().port, 'DecisionCards'],
    [ActionAdmissionService, createScriptedActionAdmission<unknown>().port, 'ActionAdmission'],
    [RegisteredReadsService, createScriptedReads<unknown>().port, 'Reads'],
    [AgentMaterialsService, sessionLog.materials, 'Materials'],
  ] as const)
    await mount(serviceOf(Base as unknown as AbstractService, port, name))
  const tools = createScriptedToolRuntime<unknown>()
  await mount({
    name: 'tool-runtime-double',
    apply(inner: Context) {
      inner.provide('toolRuntime', tools.port)
    },
  })

  // The context side: the earlier context of the holder double, the real providers above it.
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
  /** The history heads the Agent asked the holder to resolve: the Journal's history evidence. */
  const resolved: DurableEvidence[] = []
  const parts: ContextHolderParts<unknown> = {
    history: fixture.sources.history as never,
    adopted: fixture.sources.adopted as never,
    eligibility: fixture.sources.eligibility as never,
    // The double resolves every head of the tenant to the fixture history: the earlier context.
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
  await mount(holder.plugin)
  const ports = createTestAuthorityPorts<unknown>()
  ports.bind(fixture.target.scope, TENANT)
  class RuntimeTrust extends RuntimeContextTrustService<unknown> {
    readonly authority = ports.authority
    readonly bindings = ports.bindings
  }
  await mount(RuntimeTrust)
  await mount(RuntimeContextProvider)
  const rc = ctx.get(runtimeContextKey)
  if (rc === undefined) throw new Error('no runtime context')
  const begun = await rc.beginReplay('holder', {
    scope: fixture.target.scope,
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
    scope: fixture.target.scope,
    consumer: 'model',
    principal: COORDINATOR,
    tenant: TENANT,
    keys: [],
    bindings: [],
    registrationRevision: 0,
  })
  if (issued.kind !== 'issued') throw new Error(issued.kind)
  const held: EligibilityId = issued.eligibility.id
  const eligibility = createScriptedReaderEligibility<unknown>({
    scopes: [{ scope: fixture.target.scope, tenant: TENANT }],
    answers: [
      {
        request: {
          principal: COORDINATOR,
          tenant: TENANT,
          scope: fixture.target.scope,
          consumer: 'model',
        },
        result: { kind: 'current', eligibility: held },
      },
    ],
  })
  class Handoff extends RuntimeContextReaderEligibilityService<unknown> {
    current(request: Parameters<RuntimeContextReaderEligibilityService<unknown>['current']>[0]) {
      return eligibility.current(request)
    }
  }
  await mount(Handoff)

  // The Model request preparation double: it prepares what it is asked for; the assembled messages
  // of each call are kept, so the test sees what the Model request was built from.
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
  // The profile of the fixture with adoptions a Model request accepts: a digest of 64 hex digits.
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
                recipient: supplier.recipient,
                model: supplier.model,
                credential: { kind: 'factory' as const },
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
  await mount(AgentContextProvider, {
    owner: { owner: 'agent-context', name: 'cp3', revision: '1', digest: 'd' },
    resultCapacity: { bytes: '1048576', blocks: '1024', attachmentBytes: '0' },
  })

  // The conditions and the selection of the execution: consistent with the fixture profile.
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
    progression: { kind: 'evaluate-completion', basis: evidence('progression') },
    model: profile.adoption,
    context: evidence('conditions-context'),
    bindings: [],
  }
  conditions.read.always(() => succeed(current))
  selection.select.always(() => succeed(selected))

  // The Model: the scripted provider; each admitted call settles with one text and is pushed to
  // the receiver, which saves it with a joint commit on the session log.
  const instance = decodeModelInstanceId('minst_cp3')
  if ('failure' in instance) throw new Error('model instance')
  const scripted = createScriptedModelProvider<unknown>({ instance: instance.ok })
  const outlet = createMemoryAgentAccountOutlet<unknown>()
  const receiverState = createModelReceiverState<unknown>()
  const pushes: Promise<unknown>[] = []
  const admits: unknown[] = []
  /**
   * The execution of the session's Run, read from the Session snapshot by the maintainer; after the
   * Run ended, the one it had while it was active.
   */
  let lastExecution: AgentExecutionId | null = null
  async function runExecution(): Promise<AgentExecutionId | null> {
    const work = await pair.transactions.readWork({
      principal: 'system:maintainer',
      tenant: TENANT,
      session: sessionId(SESSION),
    })
    if ('failure' in work) return lastExecution
    const { run } = work.ok
    if (run.kind === 'active') lastExecution = executionOf(run.execution.execution)
    return lastExecution
  }
  const reception = createLocalModelReceiver<unknown>(
    {
      provider: sessionLog,
      access: access.port,
      // The query of the original consumption binding has no product provider yet: the double
      // reads the Journal's public `load` of the execution the Run started.
      targets: {
        async forExecution(input) {
          const loaded = await journal().load({ ...input.access, execution: input.execution })
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
            const loaded = await journal().load({ ...input.access, execution })
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
        records: 10000,
        bytes: 64 * 1024 * 1024,
        attachments: 10000,
        inFlight: 64,
      }),
    },
    receiverState,
  )
  if ('failure' in reception) throw new Error(`receiver: ${JSON.stringify(reception.failure)}`)
  const receiver = reception.ok
  const pusher = createScriptedResultPusher<unknown>({
    scripted,
    principal: COORDINATOR,
    resolveReceiver: () => receiver,
  })
  const base = pusher.provider.runtime
  const models: ModelRuntime<unknown> = {
    ...base,
    calls: {
      ...base.calls,
      async admit(input) {
        const admitted = await base.calls.admit(input)
        admits.push(admitted)
        if ('ok' in admitted) {
          const call = { tenant: input.tenant, call: input.call }
          const dispatch = decodeDispatchId('mdisp_cp3')
          const version = decodeResultVersion('mrver_cp3')
          if ('failure' in dispatch || 'failure' in version) throw new Error('model identities')
          pushes.push(
            (async () => {
              pusher.controller.start({ ...call, dispatch: dispatch.ok, firstContent: 'observed' })
              pusher.controller.settle({
                ...call,
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
                source: evidence(`settled/${input.call}`),
                pageSize: 10,
                pageTargetBytes: 65536,
              })
              return pusher.settled(call)
            })(),
          )
        }
        return admitted
      },
    },
  }
  await mount(serviceOf(ModelRuntimeService, models, 'ModelRuntime'))

  // The host: the agent-host plugin, the directory plugin and AD-14 over them.
  ctx.provide('agentHostPrincipal', 'agent-host-maintainer')
  await mount(agentHostPlugin, AGENT_HOST_CONFIG)
  await mount(agentInstancesPlugin)
  await mount(
    createSessionAgentDrivePlugin<string>({
      coordinator: input => workPrincipals.forSession({ actor: 'coordinator', ...input }),
    }),
  )

  // The session provider last: from now on an accepted input wakes S1.
  await mount(SessionProvider, { admission: 'none' })

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

  /** The Agent publication count and the Session common root, read on the real read Workers. */
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
    const agent = decodeExecutionRecordState(
      await read(EXECUTION_RECORD_HANDLERS.state, EXECUTION_RECORD_PROTOCOL),
    )
    const root = decodeSessionHistoryRoot(
      await read(SESSION_HISTORY_ROOT_HANDLER, SESSION_PROTOCOL),
    )
    if (agent === null || root === null) throw new Error('the common root is not readable')
    return { agent: agent.published, session: root.published }
  }

  return {
    errors,
    commits,
    transactions: pair.transactions,
    intake,
    bindings,
    /** The `agentJournal` the host injects: the plugin. */
    journal,
    /** A new session-log Journal over the same storage: its copy starts from the durable records. */
    fresh: () =>
      createSessionLogJournal<unknown>({
        storage,
        tenantDomainLookup: lookup,
        sessionAccessCheck: sessionChecks as never,
        combination,
      }).forSession({ tenant: TENANT, session: sessionId(SESSION) as SessionId }).journal,
    published,
    pushes,
    admits,
    runExecution,
    clock,
    resolved,
    assembled,
    async close(): Promise<void> {
      for (const fiber of mounted.splice(0).reverse()) {
        try {
          await fiber.dispose()
        } catch {
          // A fiber that already ended has nothing left to remove.
        }
      }
      await created.control.close({ initiator: 'disposal' }).catch(() => undefined)
      await rm(root, { recursive: true, force: true })
    },
  }
}

export type LineWorld = Awaited<ReturnType<typeof openLineWorld>>

/** The execution of the active or last Run of the session, as the Session snapshot names it. */
export function executionOf(text: string): AgentExecutionId {
  const decoded = decodeAgentExecutionId(text)
  if ('failure' in decoded) throw new Error('not an execution')
  return decoded.ok
}
