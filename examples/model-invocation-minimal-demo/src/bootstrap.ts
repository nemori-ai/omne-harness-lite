import { copyJsonValue, isJsonNumber, type JsonValue } from '@omne-harness-lite/content-blocks'
import {
  judgeModelProfileDocument,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import {
  createSessionModelSelection,
  createCallContainerStore,
  createModelRuntime,
  interpretCallHistory,
  readSettlementPrefix,
  type ModelRuntimeService,
  type ModelCallHost,
  type ModelObserverRequest,
  type DispatchResult,
  type OpenCallResult,
  type RuntimeConstruction,
  type SessionRuntimeBinding,
  type ModelObserverEndpoint,
  type RuntimeCloseResult,
  type SessionObserverAccess,
  type SettlementResult,
  type SettlementOwner,
  type SessionModelSelection,
  type SessionModelSelectionInput,
  type SettlementLogBinding,
  type SessionSelectModelResult,
  type LegalTargetsResult,
  type SessionEffectiveModelResult,
  type ServiceEffectiveModelResult,
  type ServiceLegalTargetsResult,
  type ServiceSelectModelResult,
  type DisplayListResult,
  type ServiceDisplayListResult,
  type ReconcileResult,
  type CallContainer,
  type AnchoredInvocationHandle,
  type ModelLogSettlementTarget,
  type ObserverDiagnostic,
  type SettlementDiagnostic,
} from '@omne-harness-lite/model-request-runtime'
import {
  captureModelLogValue,
  decodeModelLogKey,
  prepareModelLogEntry,
  modelLogJsonEqual,
} from '@omne-harness-lite/model-request-runtime'
import {
  judgeMessage,
  judgePairing,
  type SessionRef,
  type UserMessage,
  type ToolMessage,
  type LoggedMessage,
} from '@omne-harness-lite/messages'
import type { ModelToolName } from '@omne-harness-lite/tool-definition'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import { createRequestOwner } from './model-request-owner.ts'
import { createDemoObserverAccess, createDemoObserverEndpoint } from './model-observer-endpoint.ts'
import { persistDemoModelReply } from './persist-model-reply.ts'
import { readDemoNoRunFailure } from './no-run-failure-history.ts'
import type { DemoCallHost } from './model-call-host.ts'
import { messagePrefix, historyProjection, nativeCompatibility } from './model-request-text.ts'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import {
  createEvaluationInputStorePlugin,
  evaluationInputMigrations,
  CURRENT_EVALUATION_INPUTS_SERVICE,
  type CurrentEvaluationInputs,
  type InputSourceDependencies,
} from '@omne-harness-lite/evaluation-input-store'
import {
  publishLocalInputs,
  captureSessionRecipe,
  type LocalPublication,
  type SessionRecipeInput,
} from '@omne-harness-lite/evaluation-input-store/publication'
import {
  createModelTransportService,
  type ModelTransportService,
  type PlannedRequest,
  type RawResponse,
  type TransportOptions,
} from '@omne-harness-lite/pi-ai-transport'
import {
  createModelPlugin,
  MODEL_TRANSPORT_SERVICE,
  piAiTransportPlugin,
} from '@omne-harness-lite/pi-ai-transport/plugin'
import { prepareModelRequestDeployment } from './model-request-deployment.ts'
import type {
  DemoDiagnosticScope,
  DemoTransportRetention,
  TransportReservation,
} from './diagnostic-assembly.ts'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { Context, type Fiber, type Plugin } from '@deepseek-ai/cordis'
import {
  accountIdentityPlugin,
  LOGINS_SERVICE,
  type LoginsService,
} from '@omne-harness-lite/account-identity'
import {
  registrationPlugin,
  REGISTRATION_SERVICE,
  type RegistrationService,
  type TerminalOutcome,
} from '@omne-harness-lite/account-registration'
import { clockPlugin, clockPreflight } from '@omne-harness-lite/clock'
import {
  createModelReplicaCustodian,
  type ModelReplicaCustodian,
} from '@omne-harness-lite/credential-custodian-local/model-replica'
import { credentialsPlugin } from '@omne-harness-lite/credential-verification'
import sessionSchema from '@omne-harness-lite/messages/schema/v2' with { type: 'json' }
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import {
  isOk,
  parseOpaqueIdentifier,
  parseTenantId,
  type TenantId,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis'
import {
  type ModelCatalog,
  type ProfileRow,
  type CredentialLookup,
} from '@omne-harness-lite/model-profile-directory'
import {
  modelProfileDirectoryPlugin,
  localCredentialLookupPlugin,
  MODEL_CATALOG_SERVICE,
  CREDENTIAL_LOOKUP_SERVICE,
} from '@omne-harness-lite/model-profile-directory/plugin'
import { createCredentialBindingReader } from '@omne-harness-lite/model-profile-directory/tx-reads'
import {
  sessionTenancyTablePlugin,
  SESSION_TENANCY_SERVICE,
  type SessionTenancyService,
} from '@omne-harness-lite/session-tenancy-table'
import {
  openJsonlSessionLog,
  type JsonlSessionLog,
  type ReadResult,
} from '@omne-harness-lite/session-log-jsonl'
import { sessionLogContribution, prepareSessionLogDeployment } from './session-log-owner.ts'
import { seedHoldingTenant } from '@omne-harness-lite/session-tenancy-table/seed'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import {
  organizationGovernancePlugin,
  MEMBERSHIPS_SERVICE,
  type MembershipsService,
} from '@omne-harness-lite/organization-governance'
import {
  composeMigrations,
  StorageDefect,
  StorageUnavailable,
  UniqueViolation,
  ReferenceViolation,
} from '@omne-harness-lite/storage'
import {
  createUpgradeGuard,
  openStorage,
  StorageStartupFailure,
  type SqlStorage,
  type UpgradeConfirmation,
} from '@omne-harness-lite/storage-sql'
import {
  acceptanceMigrations,
  requestPreparationMigrations,
  migrationPrefixCheck,
} from './migrations.ts'
import { prepare } from './prepare.ts'
import {
  BASE_FIBERS,
  STAGE_FIBERS,
  REQUEST_PREPARATION_FIBERS,
  SESSION_LOG_FIBERS,
  MODEL_REQUEST_FIBERS,
  type AcceptanceStage,
  type ModelRequestDeployment,
  type PreparedSession,
  type AcceptanceConfig,
  type AcceptanceDiagnostics,
  type AcceptanceEvent,
  type AcceptanceHooks,
  type AuthenticatedActor,
  type CloseResult,
  type CredentialSource,
  type ScenarioResult,
  type StageFiber,
  type StartupPhase,
} from './types.ts'

const sessionValidator = createSchemaRuntime([sessionSchema]).compile({
  $ref: `${sessionSchema.$id}#/$defs/SessionRef`,
})

type LoginFace = Pick<LoginsService, 'issue' | 'exchange' | 'verify'>
type MembershipFace = Pick<MembershipsService, 'currentTenant' | 'standing'>
type CatalogFace = Pick<
  ModelCatalog,
  'bindCredential' | 'credentialPresent' | 'listProfiles' | 'readProfile'
>
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
function loginFace(value: unknown): value is LoginFace {
  return (
    object(value) &&
    typeof value.issue === 'function' &&
    typeof value.exchange === 'function' &&
    typeof value.verify === 'function'
  )
}
function membershipFace(value: unknown): value is MembershipFace {
  return (
    object(value) &&
    typeof value.currentTenant === 'function' &&
    typeof value.standing === 'function'
  )
}
function catalogFace(value: unknown): value is CatalogFace {
  return (
    object(value) &&
    typeof value.bindCredential === 'function' &&
    typeof value.credentialPresent === 'function' &&
    typeof value.listProfiles === 'function' &&
    typeof value.readProfile === 'function'
  )
}
function registrationFace(value: unknown): value is Pick<RegistrationService, 'register'> {
  return object(value) && typeof value.register === 'function'
}
function lookupFace(value: unknown): value is CredentialLookup {
  return object(value) && typeof value.value === 'function'
}
function sessionTenancyFace(value: unknown): value is SessionTenancyService {
  return object(value) && typeof value.holdingTenant === 'function'
}
function currentInputFace(value: unknown): value is CurrentEvaluationInputs {
  return object(value) && typeof value.read === 'function'
}
function modelTransportFace(value: unknown): value is ModelTransportService {
  return (
    object(value) &&
    typeof value.registerAdaptation === 'function' &&
    typeof value.acquire === 'function' &&
    typeof value.retire === 'function' &&
    typeof value.close === 'function' &&
    typeof value.inspect === 'function' &&
    value.closed instanceof Promise
  )
}
function sourceMembershipFace(value: unknown): value is InputSourceDependencies['memberships'] {
  return object(value) && typeof value.participate === 'function'
}
function clockFace(value: unknown): value is Clock {
  return object(value) && typeof value.now === 'function'
}

export class AcceptanceStartupFailure extends Error {
  override readonly name = 'AcceptanceStartupFailure'
  constructor(
    readonly phase: StartupPhase,
    readonly category:
      | 'configuration'
      | 'storage'
      | 'pending'
      | 'failed'
      | 'clockUnavailable'
      | 'confirmation'
      | 'closing',
    readonly cleanup: CloseResult,
  ) {
    super(`model-request-acceptance startup failed: ${phase}/${category}`)
  }
}
export class AcceptanceOperationDefect extends Error {
  override readonly name = 'AcceptanceOperationDefect'
  constructor(readonly step: string) {
    super(`model-request-acceptance operation defect: ${step}`)
  }
}
function operationError(error: unknown, step: string): Error {
  if (error instanceof StorageDefect) return new StorageDefect(`acceptance ${step} storage defect`)
  if (error instanceof StorageUnavailable)
    return new StorageUnavailable(`acceptance ${step} unavailable`)
  if (error instanceof UniqueViolation) return new UniqueViolation('unregistered')
  if (error instanceof ReferenceViolation) return new ReferenceViolation(error.kind)
  return new AcceptanceOperationDefect(step)
}

export interface AcceptanceApplication {
  readonly ready: Promise<{ readonly confirmation: UpgradeConfirmation }>
  /** The verified tenant's diagnostic owner must already be open before P-2 starts. */
  activateModelRequest(
    actor: AuthenticatedActor,
    diagnostics: DemoDiagnosticScope,
    transportRetention: DemoTransportRetention,
  ): Promise<ScenarioResult<{ readonly activated: true }>>
  /** Read the already-owned lease Clock; no second wall-clock authority. */
  currentTime(): string | 'unavailable'
  register(
    identifier: unknown,
    password: unknown,
  ): Promise<TerminalOutcome | { readonly failure: 'stageClosed' }>
  authenticate(identifier: unknown, password: unknown): Promise<ScenarioResult<AuthenticatedActor>>
  publishCredential(
    actor: AuthenticatedActor,
    source: CredentialSource,
  ): Promise<ScenarioResult<{ readonly stored: boolean }>>
  verifyCredential(
    actor: AuthenticatedActor,
    expectedBody: Uint8Array,
  ): Promise<ScenarioResult<{ readonly matches: boolean }>>
  readOfficialProfiles(actor: AuthenticatedActor): Promise<ScenarioResult<readonly ProfileRow[]>>
  prepareSession(
    actor: AuthenticatedActor,
    session: unknown,
  ): Promise<ScenarioResult<PreparedSession>>
  readSessionLog(actor: AuthenticatedActor, session: unknown): Promise<ScenarioResult<ReadResult>>
  prepareModelInputs(
    actor: AuthenticatedActor,
    session: unknown,
  ): Promise<ScenarioResult<{ readonly prepared: true }>>
  legalTargets(
    actor: AuthenticatedActor,
    session: unknown,
  ): Promise<ScenarioResult<LegalTargetsResult | ServiceLegalTargetsResult>>
  selectModel(
    actor: AuthenticatedActor,
    session: unknown,
    routeName: unknown,
  ): Promise<ScenarioResult<SessionSelectModelResult | ServiceSelectModelResult>>
  effectiveModel(
    actor: AuthenticatedActor,
    session: unknown,
  ): Promise<ScenarioResult<SessionEffectiveModelResult | ServiceEffectiveModelResult>>
  displayList(
    actor: AuthenticatedActor,
    session: unknown,
  ): Promise<ScenarioResult<DisplayListResult | ServiceDisplayListResult>>
  attachModelCallHost(
    actor: AuthenticatedActor,
    session: unknown,
    owner: DemoCallHost,
  ): Promise<ScenarioResult<{ readonly attached: true }>>
  reconcileModelRuntime(
    actor: AuthenticatedActor,
    session: unknown,
  ): Promise<ScenarioResult<ReconcileResult>>
  openModelObserver(
    actor: AuthenticatedActor,
    session: unknown,
    callId: unknown | undefined,
    consume: (serialized: string, signal: AbortSignal) => Promise<void>,
  ): Promise<
    ScenarioResult<
      | {
          readonly endpoint: ModelObserverEndpoint
          readonly access: SessionObserverAccess
          readonly revoke: () => Promise<RuntimeCloseResult>
        }
      | { readonly rejected: 'invalidInput' }
    >
  >
  persistModelReply(
    actor: AuthenticatedActor,
    session: unknown,
    pending: PendingModelResponse,
  ): Promise<ScenarioResult<SettlementResult>>
  bindModelRuntime(
    actor: AuthenticatedActor,
    session: unknown,
  ): Promise<ScenarioResult<{ readonly service: ModelRuntimeService }>>
  startServiceCall(
    actor: AuthenticatedActor,
    session: unknown,
    request: {
      readonly callId?: unknown
      readonly user: UserMessage
      readonly tools?: readonly ModelToolName[]
      readonly parameters: ModelRequestParameters
      readonly host: ModelCallHost
      readonly observer?: ModelObserverRequest
    },
  ): Promise<
    ScenarioResult<{ readonly callId: string; readonly result: DispatchResult } | OpenCallResult>
  >
  appendServiceToolResult(
    actor: AuthenticatedActor,
    session: unknown,
    request: { readonly message: ToolMessage; readonly host: ModelCallHost },
  ): Promise<
    ScenarioResult<
      | { readonly appended: true }
      | { readonly invalidInput: { readonly reason: 'malformed' } }
      | { readonly unavailable: true }
    >
  >
  close(): Promise<CloseResult>
  status(): {
    readonly serving: boolean
    readonly closing: boolean
    readonly diagnosticFailures: number
    readonly inFlight: number
    readonly fibers: Readonly<Partial<Record<StageFiber, number>>>
  }
}

/** D092 auth bootstrap, optionally followed by the restricted session preparation stage. */
export function createAcceptanceApplication(
  config: AcceptanceConfig,
  options: {
    readonly diagnostics: AcceptanceDiagnostics
    readonly hooks?: AcceptanceHooks
    readonly stage?: AcceptanceStage
    /** Trusted local controlled HTTPS only; never read from a tenant request. */
    readonly developmentTransport?: Pick<TransportOptions, 'baseUrl' | 'tls'>
    /** Trusted host evidence. Only a supervisor that saw the old worker exit may set covered. */
    readonly coldRecovery?: { readonly covered: boolean }
  },
): AcceptanceApplication {
  const stage = options.stage ?? 'authentication'
  const preparationStage = stage !== 'authentication'
  const logStage = stage === 'sessionLog' || stage === 'modelRequest'
  const requiredFibers =
    stage === 'modelRequest'
      ? MODEL_REQUEST_FIBERS
      : stage === 'sessionLog'
        ? SESSION_LOG_FIBERS
        : preparationStage
          ? REQUEST_PREPARATION_FIBERS
          : STAGE_FIBERS
  const context = new Context()
  const guard = createUpgradeGuard()
  const fibers = new Map<StageFiber, Fiber>()
  const admitted = new Set<Promise<unknown>>()
  const hooks = options.hooks
  let storage: SqlStorage | undefined
  let replica: ModelReplicaCustodian | undefined
  let sessionLogOwner: JsonlSessionLog | undefined
  let transportService: ModelTransportService | undefined
  const modelContributions: Fiber[] = []
  let modelRuntime:
    | { readonly service: ModelRuntimeService; readonly close: () => Promise<RuntimeCloseResult> }
    | undefined
  let currentInputs: CurrentEvaluationInputs | undefined
  let inputSource: InputSourceDependencies | undefined
  let requestDeployment: ModelRequestDeployment | undefined
  let logins: LoginFace | undefined,
    memberships: MembershipFace | undefined,
    catalog: CatalogFace | undefined,
    lookup: CredentialLookup | undefined,
    registration: Pick<RegistrationService, 'register'> | undefined,
    sessionTenancy: SessionTenancyService | undefined
  const sessionBorrows = new Map<
    SessionRef,
    {
      binding: SettlementLogBinding
      owner: ReturnType<typeof createRequestOwner>
      selector?: SessionModelSelection
      selectionInput?: SessionModelSelectionInput
    }
  >()
  const runtimeActors = new Map<SessionRef, AuthenticatedActor>()
  const runtimeBindings = new Map<SessionRef, SessionRuntimeBinding>()
  const calls = createCallContainerStore<PlannedRequest, RawResponse>()
  const trackedCalls = new Map<
    SessionRef,
    Map<string, CallContainer<PlannedRequest, RawResponse>>
  >()
  const callHosts = new Map<SessionRef, Set<DemoCallHost>>()
  const sessionTasks = new Map<SessionRef, Set<Promise<unknown>>>()
  const recoveryTasks = new Set<Promise<unknown>>()
  const recoveryAdmission = new Set<SessionRef>()
  const recoveryBusy = new Set<SessionRef>()
  const recoveryReady = new Map<
    SessionRef,
    {
      readonly binding: Pick<SessionRuntimeBinding, 'log'>
      readonly owner: ReturnType<typeof createRequestOwner>
      readonly originals: ReadonlyMap<
        string,
        {
          readonly target: ModelLogSettlementTarget
          readonly handle: AnchoredInvocationHandle
        }
      >
      readonly coldTargets: ReadonlyMap<string, ModelLogSettlementTarget>
      readonly coldAbsent: boolean
      scopeIssued: boolean
    }
  >()
  const observerAccess = createDemoObserverAccess()
  const observerGrants = new Set<{ readonly revoke: () => Promise<RuntimeCloseResult> }>()
  let gateOpen = false,
    identityGateOpen = false,
    closing = false,
    diagnosticFailures = 0
  let activationTask: Promise<ScenarioResult<{ readonly activated: true }>> | undefined
  let activationInputs:
    | {
        readonly actor: AuthenticatedActor
        readonly diagnostics: DemoDiagnosticScope
        readonly transportRetention: DemoTransportRetention
      }
    | undefined
  let activeClock: Clock | undefined
  let cleanupPromise: Promise<CloseResult> | undefined,
    closingPromise: Promise<CloseResult> | undefined
  let phase: StartupPhase = 'prepare'
  let category: AcceptanceStartupFailure['category'] = 'configuration'

  function record(event: Omit<AcceptanceEvent, 'runId'>): void {
    try {
      const returned: unknown = options.diagnostics.record(
        Object.freeze({ runId: config.runId, ...event }),
      )
      if (object(returned) && typeof returned.then === 'function') {
        diagnosticFailures += 1
        // This is a synchronous port. Observe invalid asynchronous sinks without
        // letting their rejected promises escape into a business operation.
        Promise.resolve(returned).catch(() => undefined)
      }
    } catch {
      diagnosticFailures += 1
    }
  }
  function recordSettlement(event: SettlementDiagnostic): void {
    record({
      event: 'operation',
      phase: 'settlement',
      outcome: event.kind,
      settlement: {
        kind: event.kind,
        tenant: { organization: event.tenant.organization, account: event.tenant.account },
        session: event.session,
        call: event.call,
        dispatch: event.dispatch,
        response: event.response,
        owner: event.owner,
        policy: event.policy,
        submissions: event.submissions,
        tailConflicts: event.tailConflicts,
      },
    })
  }
  function observerProjection(value: unknown): ObserverDiagnostic | undefined {
    if (!object(value)) return undefined
    const tenant = parseTenantId(value.tenant)
    const session = parseOpaqueIdentifier(value.session, 'SessionRef')
    const callId = parseOpaqueIdentifier(value.callId, 'ModelCallId')
    if (
      !isOk(tenant) ||
      !isOk(session) ||
      !isOk(callId) ||
      !isJsonNumber(value.dispatch) ||
      !isJsonNumber(value.bufferedEvents) ||
      !isJsonNumber(value.bufferedBytes) ||
      (value.position !== undefined && !isJsonNumber(value.position)) ||
      (value.stage !== 'offer' && value.stage !== 'delivery' && value.stage !== 'close') ||
      (value.reason !== 'malformed' &&
        value.reason !== 'observer_scope_mismatch' &&
        value.reason !== 'unavailable' &&
        value.reason !== 'buffer_full' &&
        value.reason !== 'consumer_failed')
    )
      return undefined
    return {
      tenant: tenant.ok,
      session: session.ok,
      callId: callId.ok,
      dispatch: value.dispatch,
      stage: value.stage,
      reason: value.reason,
      bufferedEvents: value.bufferedEvents,
      bufferedBytes: value.bufferedBytes,
      ...(value.position === undefined ? {} : { position: value.position }),
    }
  }
  function recordInvocationDiagnostic(event: {
    readonly kind: string
    readonly detail?: JsonValue
  }): void {
    const observer =
      event.kind === 'model_observer.delivery' ? observerProjection(event.detail) : undefined
    record({
      event: 'operation',
      phase: 'invocation',
      outcome: event.kind,
      ...(observer === undefined ? {} : { observer }),
    })
  }
  // Provider diagnostics retain correlation and category, never dynamic arguments or causes.
  context.logger.exporter({
    levels: { default: 2 },
    export(message) {
      record({ event: 'provider', phase: 'provider', outcome: message.type })
    },
  })
  function assertNotClosing(): void {
    if (closing) {
      category = 'closing'
      throw new Error('acceptance closing')
    }
  }
  function allActive(names: readonly StageFiber[]): boolean {
    return names.every(name => fibers.get(name)?.state === FIBER_STATE.ACTIVE)
  }
  function admit(): boolean {
    return (
      gateOpen &&
      !closing &&
      allActive(requiredFibers) &&
      replica !== undefined &&
      (stage !== 'modelRequest' ||
        (transportService !== undefined &&
          currentInputs !== undefined &&
          inputSource !== undefined))
    )
  }
  function admitIdentity(): boolean {
    return (
      !closing &&
      (stage === 'modelRequest' ? identityGateOpen && allActive(SESSION_LOG_FIBERS) : admit())
    )
  }
  function track<T>(work: () => Promise<T>): Promise<T> {
    const job = Promise.resolve().then(work)
    admitted.add(job)
    job.then(
      () => admitted.delete(job),
      () => admitted.delete(job),
    )
    return job
  }
  function trackSession<T>(session: SessionRef, work: () => Promise<T>): Promise<T> {
    const tasks = sessionTasks.get(session) ?? new Set<Promise<unknown>>()
    sessionTasks.set(session, tasks)
    const job = track(work)
    tasks.add(job)
    const finish = () => {
      tasks.delete(job)
      if (tasks.size === 0) sessionTasks.delete(session)
    }
    job.then(finish, finish)
    return job
  }
  function trackSessionInput<T>(session: unknown, work: () => Promise<T>): Promise<T> {
    const parsed = parseOpaqueIdentifier(session, 'SessionRef')
    return stage === 'modelRequest' && isOk(parsed) ? trackSession(parsed.ok, work) : track(work)
  }
  function trackRecovery<T>(work: () => Promise<T>): Promise<T> {
    const job = track(work)
    recoveryTasks.add(job)
    const finish = () => recoveryTasks.delete(job)
    job.then(finish, finish)
    return job
  }
  function retainCall(session: SessionRef, callId: string): void {
    const container = calls.find({ session, callId })
    if (container === undefined) return
    const sessionCalls = trackedCalls.get(session) ?? new Map()
    sessionCalls.set(callId, container)
    trackedCalls.set(session, sessionCalls)
  }
  async function load<C>(
    name: StageFiber,
    plugin: Plugin.Object<C>,
    pluginConfig: C,
  ): Promise<void> {
    phase = name
    assertNotClosing()
    const fiber = context.plugin(plugin, pluginConfig)
    fibers.set(name, fiber)
    fiber.then(
      () => undefined,
      () => undefined,
    )
    await hooks?.fiberCreated?.(name, fiber)
    if (fiber.state === FIBER_STATE.PENDING) {
      category = 'pending'
      throw new Error('required fiber pending')
    }
    category = 'failed'
    await fiber
    if (fiber.state !== FIBER_STATE.ACTIVE) throw new Error('required fiber not active')
    record({ event: 'fiber', phase: name, outcome: 'active', fiber: name, state: fiber.state })
    assertNotClosing()
  }
  async function closeResources(): Promise<CloseResult> {
    if (cleanupPromise !== undefined) return cleanupPromise
    closing = true
    gateOpen = false
    record({ event: 'gate', phase: 'scenario', outcome: 'closed' })
    const attempt = (async () => {
      // Stop actual consumers before waiting admitted work: setup work cannot start a new call once closing.
      await Promise.allSettled([...observerGrants].map(grant => grant.revoke()))
      // Recovery may still need this runtime's service, binding and JSONL owner.
      await Promise.allSettled([...recoveryTasks])
      const stoppedRuntime = await modelRuntime?.close()
      const stoppedSelections = await Promise.allSettled(
        [...sessionBorrows.values()].flatMap(borrow =>
          borrow.selector === undefined ? [] : [borrow.selector.close()],
        ),
      )
      await Promise.allSettled([...admitted])
      const lateObservers = await Promise.allSettled(
        [...observerGrants].map(grant => grant.revoke()),
      )
      const consumerUnavailable = [...stoppedSelections, ...lateObservers].some(
        result => result.status === 'rejected' || 'unavailable' in result.value,
      )
      if (
        consumerUnavailable ||
        (stoppedRuntime !== undefined && 'unavailable' in stoppedRuntime) ||
        (transportService !== undefined &&
          (transportService.inspect().references !== 0 ||
            transportService.inspect().executions !== 0)) ||
        [...sessionBorrows.values()].some(borrow => borrow.owner.retained())
      ) {
        return {
          complete: false,
          unfinished: [
            'modelRequestConsumers',
            'modelTransport',
            'evaluationInputs',
            'sessionLogOwner',
            'storageOwner',
          ],
          pending: await guard.pending(),
        }
      }
      for (const borrow of sessionBorrows.values()) borrow.owner.release()
      runtimeActors.clear()
      runtimeBindings.clear()
      const unfinished: string[] = []
      const order: readonly (StageFiber | 'replica' | 'sessionLogOwner' | 'modelContributions')[] =
        [
          ...(stage === 'modelRequest'
            ? (['modelContributions', 'modelTransport', 'evaluationInputs'] as const)
            : []),
          ...(logStage ? (['sessionLogOwner', 'sessionLog'] as const) : []),
          ...(preparationStage ? (['sessionTenancy'] as const) : []),
          'lookup',
          'directory',
          'replica',
          'registration',
          'governance',
          'accountIdentity',
          'credentials',
          'clock',
          'storage',
        ]
      for (const [index, name] of order.entries()) {
        try {
          if (name === 'modelContributions') {
            const retired = await Promise.allSettled(
              [...modelContributions].reverse().map(fiber => fiber.dispose()),
            )
            if (retired.some(result => result.status === 'rejected'))
              throw new Error('model contribution cleanup failed')
          } else if (name === 'sessionLogOwner') await sessionLogOwner?.close()
          else if (name === 'replica') await replica?.close()
          else await fibers.get(name)?.dispose()
          record({ event: 'close', phase: name, outcome: 'closed' })
        } catch {
          unfinished.push(...order.slice(index))
          record({ event: 'close', phase: name, outcome: 'failed' })
          break
        }
      }
      if (unfinished.length === 0) {
        try {
          await storage?.close()
          record({ event: 'close', phase: 'storageOwner', outcome: 'closed' })
        } catch {
          unfinished.push('storageOwner')
          record({ event: 'close', phase: 'storageOwner', outcome: 'failed' })
        }
      }
      if (unfinished.length === 0) {
        try {
          await context.fiber.dispose()
        } catch {
          unfinished.push('context')
        }
      }
      const pending = await guard.pending()
      const result = {
        complete: unfinished.length === 0,
        unfinished: Object.freeze(unfinished),
        pending,
      }
      record({
        event: 'close',
        phase: 'application',
        outcome: result.complete ? 'closed' : 'incomplete',
      })
      return result
    })()
    cleanupPromise = attempt
    const clearIncomplete = (result: CloseResult) => {
      if (!result.complete && cleanupPromise === attempt) cleanupPromise = undefined
    }
    attempt.then(clearIncomplete, () => {
      if (cleanupPromise === attempt) cleanupPromise = undefined
    })
    return attempt
  }
  async function start(): Promise<{ readonly confirmation: UpgradeConfirmation }> {
    try {
      if (
        stage !== 'authentication' &&
        stage !== 'requestPreparation' &&
        stage !== 'sessionLog' &&
        stage !== 'modelRequest'
      )
        throw new Error('acceptance stage invalid')
      const logDeployment = logStage
        ? await prepareSessionLogDeployment(config.sessionLog)
        : undefined
      requestDeployment =
        stage === 'modelRequest'
          ? prepareModelRequestDeployment(config.modelRequest, options.developmentTransport)
          : undefined
      const prepared = await prepare(config)
      assertNotClosing()
      record({ event: 'stage', phase: 'prepare', outcome: 'ready' })
      phase = 'storage'
      category = 'storage'
      const fragments = [
        ...(preparationStage ? requestPreparationMigrations : acceptanceMigrations),
        ...(stage === 'modelRequest' ? evaluationInputMigrations : []),
        ...(hooks?.extraMigrations ?? []),
      ]
      storage = await openStorage(
        {
          dialect: 'sqlite',
          file: config.databaseFile,
          migrations: composeMigrations(fragments),
          upgrade: { guard, checks: [migrationPrefixCheck(fragments), clockPreflight()] },
        },
        {
          logger: {
            info: () => record({ event: 'provider', phase: 'storage', outcome: 'info' }),
            warn: () => record({ event: 'provider', phase: 'storage', outcome: 'warn' }),
            error: () => record({ event: 'provider', phase: 'storage', outcome: 'error' }),
          },
        },
      )
      const database = await open(config.databaseFile, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        const owner = await database.stat({ bigint: true })
        const uid = process.getuid?.()
        if (!owner.isFile() || uid === undefined || owner.uid !== BigInt(uid))
          throw new Error('acceptance database owner invalid')
        // The read-only precheck already refused unsafe preexisting files.
        // Only a genuinely new/replaced owned file is eligible for restriction.
        const replaced =
          prepared.databaseIdentity === undefined ||
          prepared.databaseIdentity.dev !== owner.dev ||
          prepared.databaseIdentity.ino !== owner.ino ||
          prepared.databaseIdentity.birthtimeNs !== owner.birthtimeNs
        if (replaced) await database.chmod(0o600)
        const info = await database.stat()
        if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600)
          throw new Error('acceptance database owner invalid')
        record({
          event: 'stage',
          phase: 'databaseOwner',
          outcome: replaced
            ? prepared.databaseIdentity === undefined
              ? 'created'
              : 'restored'
            : 'verified',
        })
      } finally {
        await database.close()
      }
      record({ event: 'stage', phase: 'migrations', outcome: 'complete' })
      await hooks?.storageOpened?.(storage, guard)
      assertNotClosing()
      const borrowedStorage = storage
      await load(
        'storage',
        {
          name: 'acceptance-storage',
          apply(ctx: Context) {
            if (ctx.get('storage') !== undefined) throw new Error('duplicate acceptance storage')
            ctx.provide('storage', borrowedStorage)
          },
        },
        undefined,
      )
      await load('clock', clockPlugin, {})
      await load('credentials', credentialsPlugin, prepared.credentials)
      await load('accountIdentity', accountIdentityPlugin, prepared.identity)
      await load('governance', organizationGovernancePlugin, prepared.governance)
      await load('registration', registrationPlugin, prepared.registration)
      phase = 'clockReady'
      category = 'clockUnavailable'
      const clock: unknown = context.get('clock')
      if (!clockFace(clock)) throw new Error('acceptance clock absent')
      activeClock = clock
      const deadline = config.wait.monotonicNow() + config.wait.clockTimeoutMs
      let waiting = false
      while (clock.now() === 'unavailable') {
        if (!waiting) {
          waiting = true
          record({ event: 'stage', phase: 'clockReady', outcome: 'waiting' })
        }
        assertNotClosing()
        const remaining = deadline - config.wait.monotonicNow()
        if (remaining <= 0) throw new Error('acceptance clock deadline')
        await config.wait.sleep(Math.min(config.wait.pollMs, remaining))
      }
      record({ event: 'stage', phase: 'clockReady', outcome: 'ready' })
      if (!allActive(BASE_FIBERS)) {
        category = 'failed'
        throw new Error('acceptance base changed')
      }
      phase = 'confirm'
      category = 'confirmation'
      await hooks?.beforeConfirm?.(guard)
      assertNotClosing()
      if (!allActive(BASE_FIBERS) || clock.now() === 'unavailable')
        throw new Error('acceptance base no longer ready')
      record({ event: 'confirm', phase: 'upgrade', outcome: 'started' })
      const confirmation = await guard.confirm()
      if (confirmation.snapshotTaken && !confirmation.snapshotRemoved)
        throw new Error('acceptance snapshot not removed')
      record({ event: 'confirm', phase: 'upgrade', outcome: 'succeeded', confirmation })
      category = 'failed'
      assertNotClosing()
      await hooks?.afterConfirm?.()
      assertNotClosing()
      await load('directory', modelProfileDirectoryPlugin, {
        ...prepared.directory,
        diagnostics: {
          record(event) {
            record({
              event: 'directory',
              phase: event.operation,
              outcome: event.outcome ?? event.phase,
            })
          },
        },
      })
      phase = 'replica'
      category = 'failed'
      await hooks?.beforeReplica?.()
      assertNotClosing()
      const readCredentialBindingIn = createCredentialBindingReader(storage)
      replica = await createModelReplicaCustodian({
        storage,
        clock,
        keyFile: config.keys.modelReplica,
        readCredentialBindingIn,
        diagnostics: {
          record(event) {
            record({
              event: 'replica',
              phase: event.phase,
              outcome: event.outcome,
              ...(event.tenant === undefined ? {} : { tenant: event.tenant }),
              ...(event.sourceMatch === undefined ? {} : { sourceMatch: event.sourceMatch }),
            })
          },
          sinkFailure() {
            diagnosticFailures += 1
          },
        },
      })
      assertNotClosing()
      phase = 'lookup'
      await hooks?.beforeLookup?.()
      await load('lookup', localCredentialLookupPlugin, {
        mode: 'localCredentialOnly',
        readBoundReplicaIn: replica.readBoundReplicaIn,
        diagnostics: {
          record(event) {
            record({
              event: 'directory',
              phase: event.operation,
              outcome: event.outcome ?? event.phase,
            })
          },
        },
      })
      if (preparationStage) {
        await load('sessionTenancy', sessionTenancyTablePlugin, {})
        const value: unknown = context.get(SESSION_TENANCY_SERVICE)
        if (!sessionTenancyFace(value)) throw new Error('acceptance session tenancy absent')
        sessionTenancy = value
      }
      if (logStage) {
        phase = 'sessionLog'
        category = 'failed'
        assertNotClosing()
        if (logDeployment === undefined) throw new Error('acceptance log deployment absent')
        sessionLogOwner = await openJsonlSessionLog({
          ...logDeployment,
          diagnostic: event =>
            record({
              event: 'sessionLog',
              phase: event.stage,
              outcome: event.outcome ?? event.level,
            }),
        })
        await load('sessionLog', sessionLogContribution(sessionLogOwner), {})
      }
      const loginValue: unknown = context.get(LOGINS_SERVICE),
        membershipValue: unknown = context.get(MEMBERSHIPS_SERVICE),
        catalogValue: unknown = context.get(MODEL_CATALOG_SERVICE),
        lookupValue: unknown = context.get(CREDENTIAL_LOOKUP_SERVICE),
        registrationValue: unknown = context.get(REGISTRATION_SERVICE)
      if (
        !loginFace(loginValue) ||
        !membershipFace(membershipValue) ||
        !catalogFace(catalogValue) ||
        !lookupFace(lookupValue) ||
        !registrationFace(registrationValue)
      )
        throw new Error('acceptance service mapping invalid')
      logins = loginValue
      memberships = membershipValue
      catalog = catalogValue
      lookup = lookupValue
      registration = registrationValue
      phase = 'admission'
      assertNotClosing()
      if (!allActive(stage === 'modelRequest' ? SESSION_LOG_FIBERS : requiredFibers))
        throw new Error('acceptance required stage changed')
      if (stage === 'modelRequest') identityGateOpen = true
      else gateOpen = true
      record({
        event: 'gate',
        phase: 'scenario',
        outcome: stage === 'modelRequest' ? 'identityOpen' : 'open',
      })
      return { confirmation }
    } catch (error) {
      if (error instanceof StorageStartupFailure) category = 'storage'
      record({ event: 'stage', phase, outcome: category })
      const cleanup = await closeResources()
      throw new AcceptanceStartupFailure(phase, category, cleanup)
    }
  }
  const ready = start()
  ready.then(
    () => undefined,
    () => undefined,
  )

  async function checkActor(
    actor: AuthenticatedActor,
  ): Promise<ScenarioResult<AuthenticatedActor>> {
    if (logins === undefined || memberships === undefined)
      throw new AcceptanceOperationDefect('identity')
    const loginState = actor?.loginState,
      claimedAccount = actor?.account
    const claimedTenant = parseTenantId(actor?.tenant)
    const verified = await logins.verify(loginState)
    if ('failure' in verified) return { step: 'verify', result: verified }
    if (verified.ok !== claimedAccount) return { failure: 'identityMismatch' }
    const current = await memberships.currentTenant(loginState)
    if ('failure' in current) return { step: 'currentTenant', result: current }
    if (
      !isOk(claimedTenant) ||
      current.ok.account !== verified.ok ||
      !tenantIdEquals(current.ok, claimedTenant.ok)
    )
      return { failure: 'identityMismatch' }
    const standing = await memberships.standing(current.ok)
    if ('failure' in standing) return { step: 'standing', result: standing }
    if (standing.standing !== 'effective') return { failure: 'membershipNotEffective' }
    return Object.freeze({
      account: verified.ok,
      loginState,
      tenant: Object.freeze({ ...current.ok }),
    })
  }
  function activateModelRequest(
    actor: AuthenticatedActor,
    diagnostics: DemoDiagnosticScope,
    transportRetention: DemoTransportRetention,
  ): Promise<ScenarioResult<{ readonly activated: true }>> {
    if (stage !== 'modelRequest' || closing) return Promise.resolve({ failure: 'stageClosed' })
    if (activationTask !== undefined) {
      return activationInputs?.actor === actor &&
        activationInputs.diagnostics === diagnostics &&
        activationInputs.transportRetention === transportRetention
        ? activationTask
        : Promise.resolve({ failure: 'identityMismatch' })
    }
    const task = (async (): Promise<ScenarioResult<{ readonly activated: true }>> => {
      await ready
      if (!admitIdentity()) return { failure: 'stageClosed' }
      const checked = await checkActor(actor)
      if (!('account' in checked)) return checked
      const diagnosticTenant =
        diagnostics?.scope?.kind === 'tenant' ? parseTenantId(diagnostics.scope.tenant) : undefined
      if (
        diagnosticTenant === undefined ||
        !isOk(diagnosticTenant) ||
        !tenantIdEquals(diagnosticTenant.ok, checked.tenant)
      )
        return { failure: 'identityMismatch' }
      if (
        typeof diagnostics.collector?.emitter !== 'function' ||
        typeof transportRetention?.reserveReplacement !== 'function'
      )
        return { failure: 'stageClosed' }
      activationInputs = { actor, diagnostics, transportRetention }
      try {
        if (stage === 'modelRequest') {
          if (
            requestDeployment === undefined ||
            sessionTenancy === undefined ||
            storage === undefined
          )
            throw new Error('acceptance request deployment absent')
          const actualMemberships: unknown = context.get(MEMBERSHIPS_SERVICE)
          if (!sourceMembershipFace(actualMemberships))
            throw new Error('acceptance source memberships absent')
          const ports = {
            monotonicNow: requestDeployment.evaluationInputs.monotonicNow,
            diagnostics: () =>
              record({ event: 'evaluationInputs', phase: 'provider', outcome: 'observed' }),
            onDiagnosticFailure: () => {
              diagnosticFailures += 1
            },
          }
          inputSource = {
            ...ports,
            storage,
            memberships: actualMemberships,
            sessionTenancy,
            storeKey: requestDeployment.evaluationInputs.storeKey,
            deployedOfficial: requestDeployment.evaluationInputs.deployedOfficial,
          }
          await load('evaluationInputs', createEvaluationInputStorePlugin(ports), {
            storeKey: inputSource.storeKey,
            deployedOfficial: [...inputSource.deployedOfficial],
          })
          const value: unknown = context.get(CURRENT_EVALUATION_INPUTS_SERVICE)
          if (!currentInputFace(value)) throw new Error('acceptance input service absent')
          currentInputs = value
          phase = 'transport'
          category = 'failed'
          assertNotClosing()
          const transportConfiguration = requestDeployment.transport
          if (
            transportConfiguration.inputMeters.length !== transportConfiguration.definitions.length
          )
            throw new Error('one exact input meter per model contribution required')
          const onDiagnostic = (event: { readonly level: string }) =>
            record({ event: 'transport', phase: 'provider', outcome: event.level })
          const reserved = transportRetention.reserveReplacement()
          if ('unavailable' in reserved) throw new Error('transport_retention_full')
          const reservation: TransportReservation = reserved.reservation
          let committed = false
          try {
            if (options.developmentTransport === undefined) {
              await load('modelTransport', piAiTransportPlugin, {
                policy: transportConfiguration.policy,
                retirement: transportConfiguration.retirement,
                onDiagnostic,
              })
            } else {
              const developmentTransport = options.developmentTransport
              await load(
                'modelTransport',
                {
                  name: 'acceptance-controlled-model-transport',
                  apply(ctx: Context) {
                    const service = createModelTransportService({
                      ...developmentTransport,
                      policy: transportConfiguration.policy,
                      onDiagnostic,
                    })
                    ctx.effect(() => async () => {
                      const result = await service.close(transportConfiguration.retirement)
                      if ('cleanup_failed' in result || 'rejected' in result)
                        throw new Error('model transport cleanup failed')
                      await service.closed
                    })
                    ctx.provide(MODEL_TRANSPORT_SERVICE, service)
                  },
                },
                undefined,
              )
            }
            const provided: unknown = context.get(MODEL_TRANSPORT_SERVICE)
            if (!modelTransportFace(provided)) throw new Error('model transport service absent')
            transportService = provided
            reservation.commit(provided)
            committed = true
          } catch (error) {
            if (!committed) {
              let partial: unknown
              try {
                partial = context.get(MODEL_TRANSPORT_SERVICE)
              } catch {
                // A fiber may still own a failed construction even if no service can be read.
              }
              if (modelTransportFace(partial)) reservation.adoptFailedConstruction(partial)
              else reservation.abortUnknown()
            }
            throw error
          }
          for (const definition of transportConfiguration.definitions) {
            const meters = transportConfiguration.inputMeters.filter(
              meter =>
                meter.modelId === definition.modelId &&
                meter.definitionRevision === definition.revision &&
                meter.implementation.name === definition.implementation.name &&
                meter.implementation.revision === definition.implementation.revision &&
                Object.hasOwn(definition.routes, meter.provider),
            )
            if (meters.length !== 1 || meters[0] === undefined)
              throw new Error('one exact input meter per model contribution required')
            const fiber = context.plugin(
              createModelPlugin(definition, meters[0], transportConfiguration.retirement),
              {},
            )
            modelContributions.push(fiber)
            await hooks?.modelContributionCreated?.(definition, fiber)
            await fiber
            if (fiber.state !== FIBER_STATE.ACTIVE) throw new Error('model contribution not active')
          }
          record({ event: 'transport', phase: 'contributions', outcome: 'ready' })
        }
        if (stage === 'modelRequest') {
          if (requestDeployment === undefined || transportService === undefined)
            throw new Error('model runtime construction prerequisites absent')
          const deployment = requestDeployment
          const transport = transportService
          function newId<B extends string>(label: string, brand: B) {
            const parsed = parseOpaqueIdentifier(`${label}-${randomUUID()}`, brand)
            if (!isOk(parsed)) throw new Error('model identity source invalid')
            return parsed.ok
          }
          const construction: RuntimeConstruction<PlannedRequest, RawResponse> = {
            sessions: {
              async bind(session) {
                const originalActor = runtimeActors.get(session)
                if (originalActor === undefined) return { failure: 'unavailable' }
                const access = await sessionAccess(originalActor, session)
                if (!('borrow' in access)) return { failure: 'unavailable' }
                if (catalog === undefined || lookup === undefined || currentInputs === undefined)
                  return { failure: 'unavailable' }
                const selectionInput = ensureSelection(access.borrow)
                if (selectionInput === undefined) return { failure: 'unavailable' }
                const existing = runtimeBindings.get(session)
                if (existing !== undefined) {
                  if (
                    existing.log !== access.borrow.binding ||
                    existing.selection !== selectionInput
                  )
                    return { failure: 'unavailable' }
                  return { binding: existing }
                }
                const binding: SessionRuntimeBinding = {
                  log: access.borrow.binding,
                  selection: selectionInput,
                  catalog,
                  credentials: lookup,
                  currentEvaluationInputs: currentInputs,
                  observers: observerAccess.access,
                  tools: requestDeployment?.assetRegistry ?? {
                    async lookup() {
                      return { failure: 'unavailable' }
                    },
                  },
                }
                runtimeBindings.set(session, binding)
                return { binding }
              },
            },
            calls,
            transport: {
              acquire(binding, routeName) {
                if (closing) return { unavailable: true }
                const acquired = transport.acquire(binding, routeName)
                if ('lease' in acquired) return acquired
                return acquired.rejected === 'invalidInput'
                  ? { invalidInput: { reason: 'malformed' } }
                  : { unavailable: true }
              },
            },
            settlementContention: deployment.settlement.contention,
            settlementScheduler: deployment.settlement.scheduler,
            policy: {
              ...deployment.invocation,
              diagnostic: event =>
                'tenant' in event ? recordSettlement(event) : recordInvocationDiagnostic(event),
            },
            tokenMargin: deployment.tokenMargin,
            identities: {
              call: () => newId('call', 'ModelCallId'),
              response: () => newId('response', 'ResponseId'),
              message: () => newId('reply', 'MessageId'),
            },
            history: {
              call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
              failure: readDemoNoRunFailure,
              run: () => ({ unavailable: true }),
            },
            reservationWaitPolicy: deployment.reservationWaitPolicy,
            recovery: {
              async enter(input) {
                const ready = recoveryReady.get(input.session)
                if (
                  ready === undefined ||
                  ready.scopeIssued ||
                  !recoveryAdmission.has(input.session) ||
                  ready.binding.log.currentGeneration() !== ready.binding.log.generation ||
                  ready.owner.owner.admission() !== 'open' ||
                  'unknown' in ready.owner.owner.opened() ||
                  ready.owner.owner.unresolvedWrites().length !== 0
                )
                  return { unavailable: true }
                ready.scopeIssued = true
                record({ event: 'operation', phase: 'recovery', outcome: 'entered' })
                let closed = false
                return {
                  scope: {
                    binding: ready.binding,
                    owner: ready.owner.owner,
                    originalInvocation(key, target) {
                      if (key.session !== input.session || key.callId !== target.call)
                        return { unavailable: true }
                      const original = ready.originals.get(key.callId)
                      if (original !== undefined) {
                        if (
                          original.target.response !== target.response ||
                          !modelLogJsonEqual(original.target.dispatch, target.dispatch)
                        )
                          return { unavailable: true }
                        return { original: original.handle }
                      }
                      const cold = ready.coldTargets.get(key.callId)
                      if (
                        !ready.coldAbsent ||
                        cold === undefined ||
                        cold.response !== target.response ||
                        !modelLogJsonEqual(cold.dispatch, target.dispatch) ||
                        trackedCalls.get(key.session)?.has(key.callId)
                      )
                        return { unavailable: true }
                      return { absent: true }
                    },
                    async close() {
                      if (closed) return
                      await ready.owner.drain()
                      if (
                        ready.owner.retained() ||
                        ready.owner.owner.unresolvedWrites().length !== 0 ||
                        ready.binding.log.currentGeneration() !== ready.binding.log.generation
                      )
                        throw new Error('recovery owner retained')
                      closed = true
                      recoveryReady.delete(input.session)
                      recoveryAdmission.delete(input.session)
                      record({ event: 'operation', phase: 'recovery', outcome: 'closed' })
                    },
                  },
                }
              },
            },
            diagnosticCollector: diagnostics.collector,
            diagnostic: recordSettlement,
          }
          modelRuntime = createModelRuntime(construction)
        }
        phase = 'admission'
        assertNotClosing()
        if (!allActive(requiredFibers)) throw new Error('acceptance model stage changed')
        gateOpen = true
        record({ event: 'gate', phase: 'scenario', outcome: 'open' })
        return { activated: true }
      } catch (error) {
        record({ event: 'stage', phase, outcome: category })
        const cleanup = await closeResources()
        throw new AcceptanceStartupFailure(phase, category, cleanup)
      }
    })()
    activationTask = task
    task.then(
      result => {
        if (!('activated' in result) && activationTask === task) {
          activationTask = undefined
          activationInputs = undefined
        }
      },
      () => undefined,
    )
    return task
  }

  function authenticate(
    identifier: unknown,
    password: unknown,
  ): Promise<ScenarioResult<AuthenticatedActor>> {
    if (!admitIdentity()) return Promise.resolve({ failure: 'stageClosed' })
    return track(async () => {
      try {
        if (logins === undefined || memberships === undefined)
          throw new AcceptanceOperationDefect('identity')
        await hooks?.beforeIdentityStep?.('issue')
        const issued = await logins.issue(identifier, password)
        if ('failure' in issued) return { step: 'issue', result: issued }
        await hooks?.beforeIdentityStep?.('exchange')
        const exchanged = await logins.exchange(issued.ok.presentation)
        if ('failure' in exchanged) return { step: 'exchange', result: exchanged }
        if (exchanged.ok.loginStateId !== issued.ok.loginStateId)
          throw new AcceptanceOperationDefect('exchange')
        await hooks?.beforeIdentityStep?.('currentTenant')
        const tenant = await memberships.currentTenant(exchanged.ok.loginStateId)
        if ('failure' in tenant) return { step: 'currentTenant', result: tenant }
        const result = await checkActor({
          account: exchanged.ok.accountId,
          loginState: exchanged.ok.loginStateId,
          tenant: tenant.ok,
        })
        record({
          event: 'operation',
          phase: 'authenticate',
          outcome: 'account' in result ? 'authenticated' : 'rejected',
        })
        return result
      } catch (error) {
        throw operationError(error, 'authenticate')
      }
    })
  }
  function publishCredential(
    actor: AuthenticatedActor,
    source: CredentialSource,
  ): Promise<ScenarioResult<{ readonly stored: boolean }>> {
    if (!admit()) return Promise.resolve({ failure: 'stageClosed' })
    return track(async () => {
      try {
        const checked = await checkActor(actor)
        if (!('account' in checked)) return checked
        if (catalog === undefined || replica === undefined)
          throw new AcceptanceOperationDefect('publish')
        const pair = await source(checked)
        const scoped = parseTenantId(pair?.tenant)
        if (
          !isOk(scoped) ||
          pair.account !== checked.account ||
          !tenantIdEquals(scoped.ok, checked.tenant)
        )
          return { failure: 'sourceScopeMismatch' }
        const sourceRef = pair.sourceRef
        const body = pair.body instanceof Uint8Array ? Buffer.from(pair.body) : new Uint8Array()
        try {
          await hooks?.beforeIdentityStep?.('bind')
          const bound = await catalog.bindCredential(checked.tenant, checked.tenant, sourceRef)
          if ('failure' in bound) return { step: 'bind', result: bound }
          await hooks?.beforeStore?.(checked)
          await hooks?.beforeIdentityStep?.('store')
          const stored = await replica.storeBoundReplica({
            loginState: checked.loginState,
            tenant: checked.tenant,
            sourceRef,
            body,
          })
          if ('failure' in stored) return { step: 'store', result: stored }
          record({
            event: 'operation',
            phase: 'publish',
            outcome: stored.stored ? 'stored' : 'sourceChanged',
            tenant: checked.tenant,
          })
          return { stored: stored.stored }
        } finally {
          body.fill(0)
        }
      } catch (error) {
        throw operationError(error, 'publish')
      }
    })
  }
  function verifyCredential(
    actor: AuthenticatedActor,
    expectedBody: Uint8Array,
  ): Promise<ScenarioResult<{ readonly matches: boolean }>> {
    if (!admit()) return Promise.resolve({ failure: 'stageClosed' })
    return track(async () => {
      try {
        const checked = await checkActor(actor)
        if (!('account' in checked)) return checked
        if (lookup === undefined) throw new AcceptanceOperationDefect('lookup')
        const selected = await lookup.value(checked.tenant, 'custom')
        if ('failure' in selected) return { step: 'lookup', result: selected }
        try {
          if (
            selected.scope.layer !== 'tenant' ||
            !tenantIdEquals(selected.scope.tenant, checked.tenant)
          )
            throw new AcceptanceOperationDefect('lookup')
          return {
            matches:
              expectedBody instanceof Uint8Array &&
              selected.value.length === expectedBody.length &&
              timingSafeEqual(selected.value, expectedBody),
          }
        } finally {
          selected.value.fill(0)
        }
      } catch (error) {
        throw operationError(error, 'lookup')
      }
    })
  }
  function readOfficialProfiles(
    actor: AuthenticatedActor,
  ): Promise<ScenarioResult<readonly ProfileRow[]>> {
    if (!preparationStage || !admit()) return Promise.resolve({ failure: 'stageClosed' })
    return track(async () => {
      try {
        const checked = await checkActor(actor)
        if (!('account' in checked)) return checked
        if (catalog === undefined) throw new AcceptanceOperationDefect('listProfiles')
        const rows = await catalog.listProfiles(checked.tenant)
        if ('failure' in rows) return { step: 'listProfiles', result: rows }
        record({ event: 'operation', phase: 'readOfficialProfiles', outcome: 'read' })
        return rows.filter(row => row.ref.origin === 'official')
      } catch (error) {
        throw operationError(error, 'listProfiles')
      }
    })
  }
  function prepareSession(
    actor: AuthenticatedActor,
    session: unknown,
  ): Promise<ScenarioResult<PreparedSession>> {
    if (!preparationStage || !admit()) return Promise.resolve({ failure: 'stageClosed' })
    return trackSessionInput(session, async () => {
      try {
        const checked = await checkActor(actor)
        if (!('account' in checked)) return checked
        if (storage === undefined || sessionTenancy === undefined)
          throw new AcceptanceOperationDefect('prepareSession')
        const parsed = parseOpaqueIdentifier(session, 'SessionRef')
        if (!isOk(parsed) || !sessionValidator.validate(parsed.ok))
          return { step: 'holdingTenant', result: { failure: 'invalidInput' } }
        if (recoveryAdmission.has(parsed.ok)) return { failure: 'stageClosed' }
        let held = await sessionTenancy.holdingTenant(parsed.ok)
        if ('failure' in held) {
          if (held.failure !== 'sessionNotFound') return { step: 'holdingTenant', result: held }
          await storage.atomic(unit =>
            unit.mutate(tx => seedHoldingTenant(tx, parsed.ok, checked.tenant)),
          )
          held = await sessionTenancy.holdingTenant(parsed.ok)
        } else if (!tenantIdEquals(held.tenant, checked.tenant)) {
          throw new UniqueViolation('session_tenancy_pkey')
        }
        if ('failure' in held) return { step: 'holdingTenant', result: held }
        if (!tenantIdEquals(held.tenant, checked.tenant))
          throw new AcceptanceOperationDefect('prepareSession')
        record({
          event: 'operation',
          phase: 'prepareSession',
          outcome: 'prepared',
          tenant: held.tenant,
        })
        return { session: parsed.ok, tenant: held.tenant }
      } catch (error) {
        throw operationError(error, 'prepareSession')
      }
    })
  }
  function readSessionLog(
    actor: AuthenticatedActor,
    session: unknown,
  ): Promise<ScenarioResult<ReadResult>> {
    if (!logStage || !admit()) return Promise.resolve({ failure: 'stageClosed' })
    return trackSessionInput(session, async () => {
      try {
        const checked = await checkActor(actor)
        if (!('account' in checked)) return checked
        if (sessionTenancy === undefined || sessionLogOwner === undefined)
          throw new AcceptanceOperationDefect('readSessionLog')
        const parsed = parseOpaqueIdentifier(session, 'SessionRef')
        if (!isOk(parsed) || !sessionValidator.validate(parsed.ok))
          return { step: 'holdingTenant', result: { failure: 'invalidInput' } }
        if (recoveryAdmission.has(parsed.ok)) return { failure: 'stageClosed' }
        const held = await sessionTenancy.holdingTenant(parsed.ok)
        if ('failure' in held) return { step: 'holdingTenant', result: held }
        if (!tenantIdEquals(held.tenant, checked.tenant)) return { failure: 'identityMismatch' }
        return await sessionLogOwner.readSince(parsed.ok, 0)
      } catch (error) {
        throw operationError(error, 'readSessionLog')
      }
    })
  }
  function prepareModelInputs(
    actor: AuthenticatedActor,
    session: unknown,
  ): Promise<ScenarioResult<{ readonly prepared: true }>> {
    if (stage !== 'modelRequest' || !admit()) return Promise.resolve({ failure: 'stageClosed' })
    return trackSessionInput(session, async () => {
      try {
        const checked = await checkActor(actor)
        if (!('account' in checked)) return checked
        if (
          sessionTenancy === undefined ||
          currentInputs === undefined ||
          inputSource === undefined ||
          requestDeployment === undefined
        )
          throw new AcceptanceOperationDefect('prepareModelInputs')
        const parsed = parseOpaqueIdentifier(session, 'SessionRef')
        if (!isOk(parsed) || !sessionValidator.validate(parsed.ok))
          return { step: 'holdingTenant', result: { failure: 'invalidInput' } }
        if (recoveryAdmission.has(parsed.ok)) return { failure: 'stageClosed' }
        const held = await sessionTenancy.holdingTenant(parsed.ok)
        if ('failure' in held) return { step: 'holdingTenant', result: held }
        if (!tenantIdEquals(held.tenant, checked.tenant)) return { failure: 'identityMismatch' }
        const source = await requestDeployment.evaluationInputs.prepare(checked, parsed.ok)
        const published = await publishLocalInputs(inputSource, source.publication)
        if ('failure' in published) {
          return { step: 'publishLocalInputs', result: published }
        }
        const captured = await captureSessionRecipe(inputSource, {
          ...source.recipe,
          session: parsed.ok,
          tenant: held.tenant,
        })
        if ('failure' in captured) {
          return { step: 'captureSessionRecipe', result: captured }
        }
        const current = await currentInputs.read(parsed.ok, held.tenant)
        if ('failure' in current) return { step: 'currentInputs', result: current }
        const evaluated = evaluate(current.input)
        if (!('ok' in evaluated)) return { step: 'evaluate', result: evaluated }
        return { prepared: true }
      } catch (error) {
        throw operationError(error, 'prepareModelInputs')
      }
    })
  }
  async function sessionAccess(actor: AuthenticatedActor, session: unknown) {
    const checked = await checkActor(actor)
    if (!('account' in checked)) return checked
    if (sessionTenancy === undefined || sessionLogOwner === undefined)
      throw new AcceptanceOperationDefect('modelRequest')
    const parsed = parseOpaqueIdentifier(session, 'SessionRef')
    if (!isOk(parsed) || !sessionValidator.validate(parsed.ok))
      return { step: 'holdingTenant' as const, result: { failure: 'invalidInput' as const } }
    const held = await sessionTenancy.holdingTenant(parsed.ok)
    if ('failure' in held) return { step: 'holdingTenant' as const, result: held }
    if (!tenantIdEquals(held.tenant, checked.tenant))
      return { failure: 'identityMismatch' as const }
    if (closing) return { failure: 'stageClosed' as const }
    let borrow = sessionBorrows.get(parsed.ok)
    if (borrow === undefined) {
      const generation = Object.freeze({})
      const log = sessionLogOwner
      const binding: SettlementLogBinding = {
        session: parsed.ok,
        tenant: held.tenant,
        log,
        generation,
        currentGeneration: () =>
          sessionLogOwner === log && allActive(requiredFibers) ? generation : null,
      }
      const owner = createRequestOwner(`app:${config.runId}:${parsed.ok}`)
      borrow = { binding, owner }
      sessionBorrows.set(parsed.ok, borrow)
    }
    return { borrow, checked }
  }
  function ensureSelection(borrow: {
    binding: SettlementLogBinding
    owner: ReturnType<typeof createRequestOwner>
    selector?: SessionModelSelection
    selectionInput?: SessionModelSelectionInput
  }): SessionModelSelectionInput | undefined {
    if (borrow.selectionInput !== undefined) return borrow.selectionInput
    if (
      sessionTenancy === undefined ||
      currentInputs === undefined ||
      catalog === undefined ||
      requestDeployment === undefined
    )
      return undefined
    const selectionInput: SessionModelSelectionInput = {
      binding: borrow.binding,
      owner: borrow.owner.owner,
      concurrent: requestDeployment.settlement.contention.limits.concurrent,
      sessionTenancy,
      catalog,
      currentEvaluationInputs: currentInputs,
      projection: historyProjection,
      compatible: nativeCompatibility,
      now: requestDeployment.invocation.now,
      diagnostic: event =>
        record({ event: 'operation', phase: event.stage, outcome: event.outcome }),
      onDiagnosticFailure: () => {
        diagnosticFailures++
      },
    }
    borrow.selector = createSessionModelSelection(selectionInput)
    borrow.selectionInput = selectionInput
    return selectionInput
  }
  async function appendServiceMessage(
    binding: SettlementLogBinding,
    owner: SettlementOwner,
    tenant: TenantId,
    message: UserMessage | ToolMessage,
  ): Promise<
    | { readonly messages: readonly LoggedMessage[] }
    | { readonly invalidInput: { readonly reason: 'malformed' } }
    | { readonly unavailable: true }
  > {
    if (requestDeployment === undefined) return { unavailable: true }
    const acquired = owner.acquire(requestDeployment.settlement.contention.limits.concurrent)
    if ('unavailable' in acquired) return { unavailable: true }
    let unknownWrite = false
    try {
      const prefix = await readSettlementPrefix({ binding, registration: acquired.registration })
      if ('unavailable' in prefix) return { unavailable: true }
      const projected = messagePrefix(prefix.prefix)
      if ('unavailable' in projected) return { unavailable: true }
      if (message.type === 'tool') {
        const pairing = judgePairing(message, projected.messages)
        if (!('valid' in pairing) || !pairing.valid)
          return { invalidInput: { reason: 'malformed' } }
      }
      const captured = captureModelLogValue({
        category: 'message',
        input: { kind: 'value', value: message },
      })
      if ('invalidValue' in captured) return { invalidInput: { reason: 'malformed' } }
      const entry = prepareModelLogEntry({
        session: binding.session,
        shell: { tenant },
        captured: captured.ok,
        purpose: { kind: 'message' },
        messagePrefix: projected.messages,
      })
      if ('invalidValue' in entry) return { invalidInput: { reason: 'malformed' } }
      const append = acquired.registration.start(
        'append',
        async () =>
          await binding.log.append(
            binding.session,
            [entry.ok],
            { kind: 'unfenced' },
            { kind: 'tailEquals', tail: prefix.prefix.tail },
          ),
      )
      let receipt: Awaited<typeof append.completion>
      try {
        receipt = await append.completion
      } catch {
        unknownWrite = true
        return { unavailable: true }
      } finally {
        await append.stopped
      }
      if ('failure' in receipt) {
        if (receipt.failure === 'unavailable') unknownWrite = true
        return { unavailable: true }
      }
      return { messages: [...projected.messages, message] }
    } finally {
      if (!unknownWrite) acquired.registration.release()
    }
  }
  function appendServiceToolResult(
    actor: AuthenticatedActor,
    session: unknown,
    request: { readonly message: ToolMessage; readonly host: ModelCallHost },
  ): Promise<
    ScenarioResult<
      | { readonly appended: true }
      | { readonly invalidInput: { readonly reason: 'malformed' } }
      | { readonly unavailable: true }
    >
  > {
    if (stage !== 'modelRequest' || !admit()) return Promise.resolve({ failure: 'stageClosed' })
    const judged = judgeMessage(request?.message)
    if (!('ok' in judged)) return Promise.resolve({ invalidInput: { reason: 'malformed' } })
    const message = judged.ok
    if (message.type !== 'tool') return Promise.resolve({ invalidInput: { reason: 'malformed' } })
    return trackSessionInput(session, async () => {
      const access = await sessionAccess(actor, session)
      if (!('borrow' in access)) return access
      const { borrow, checked } = access
      if (recoveryAdmission.has(borrow.binding.session)) return { failure: 'stageClosed' }
      if (
        ![...(callHosts.get(borrow.binding.session) ?? [])].some(
          owner => owner.host === request.host && !owner.host.stopping(),
        )
      )
        return { failure: 'stageClosed' }
      const appended = await appendServiceMessage(
        borrow.binding,
        borrow.owner.owner,
        checked.tenant,
        message,
      )
      return 'messages' in appended ? { appended: true } : appended
    })
  }
  function bindModelRuntime(
    actor: AuthenticatedActor,
    session: unknown,
  ): Promise<ScenarioResult<{ readonly service: ModelRuntimeService }>> {
    if (stage !== 'modelRequest' || !admit()) return Promise.resolve({ failure: 'stageClosed' })
    return trackSessionInput(session, async () => {
      const access = await sessionAccess(actor, session)
      if (!('borrow' in access)) return access
      if (recoveryAdmission.has(access.borrow.binding.session)) return { failure: 'stageClosed' }
      if (modelRuntime === undefined) return { failure: 'stageClosed' }
      runtimeActors.set(access.borrow.binding.session, access.checked)
      return { service: boundModelService(access.checked, access.borrow.binding.session) }
    })
  }
  function boundModelService(actor: AuthenticatedActor, session: SessionRef): ModelRuntimeService {
    if (modelRuntime === undefined) throw new AcceptanceOperationDefect('modelRuntime')
    const service = modelRuntime.service
    function invoke<I extends { readonly session: SessionRef }, R>(
      input: I,
      operation: (value: I) => Promise<R>,
      denied: R,
    ): Promise<R> {
      if (input?.session !== session || closing || recoveryAdmission.has(session))
        return Promise.resolve(denied)
      return trackSession(session, async () => {
        const access = await sessionAccess(actor, session)
        if (!('borrow' in access) || recoveryAdmission.has(session)) return denied
        runtimeActors.set(session, access.checked)
        return operation(input)
      })
    }
    return {
      legalTargets: input =>
        invoke(input, value => service.legalTargets(value), { unavailable: true }),
      displayList: input =>
        invoke(input, value => service.displayList(value), { unavailable: true }),
      effectiveModel: input =>
        invoke(input, value => service.effectiveModel(value), { unavailable: true }),
      selectModel: input =>
        invoke(input, value => service.selectModel(value), { unavailable: true }),
      openCall: input =>
        invoke(
          input,
          async value => {
            if (![...(callHosts.get(session) ?? [])].some(owner => owner.host === value.host))
              return { runtimeStopped: true } as const
            const result = await service.openCall(value)
            if ('callId' in result) retainCall(session, result.callId)
            return result
          },
          { runtimeStopped: true },
        ),
      dispatch: input => invoke(input, value => service.dispatch(value), { runtimeStopped: true }),
      dispatchAgain: input =>
        invoke(input, value => service.dispatchAgain(value), { runtimeStopped: true }),
      interrupt: input => invoke(input, value => service.interrupt(value), { unavailable: true }),
      releaseCall: input =>
        invoke(input, value => service.releaseCall(value), { unavailable: true }),
      reconcile: async input => {
        if (input.session !== session) return { unavailable: true }
        const result = await reconcileModelRuntime(actor, session)
        return 'calls' in result || 'invalidInput' in result ? result : { unavailable: true }
      },
      readAttempts: input =>
        invoke(input, value => service.readAttempts(value), { unavailable: true }),
      settleReply: input =>
        invoke(input, value => service.settleReply(value), { unavailable: true }),
      canDispatchAgain: input =>
        invoke(input, value => service.canDispatchAgain(value), { unavailable: true }),
    }
  }
  function attachModelCallHost(
    actor: AuthenticatedActor,
    session: unknown,
    owner: DemoCallHost,
  ): Promise<ScenarioResult<{ readonly attached: true }>> {
    if (
      stage !== 'modelRequest' ||
      !admit() ||
      typeof owner?.stop !== 'function' ||
      typeof owner.host?.register !== 'function'
    )
      return Promise.resolve({ failure: 'stageClosed' })
    return trackSessionInput(session, async () => {
      const access = await sessionAccess(actor, session)
      if (!('borrow' in access)) return access
      const key = access.borrow.binding.session
      if (recoveryAdmission.has(key)) return { failure: 'stageClosed' }
      const owners = callHosts.get(key) ?? new Set<DemoCallHost>()
      for (const previous of owners) if (previous.released?.()) owners.delete(previous)
      owners.add(owner)
      callHosts.set(key, owners)
      runtimeActors.set(key, access.checked)
      return { attached: true }
    })
  }
  function reconcileModelRuntime(
    actor: AuthenticatedActor,
    session: unknown,
  ): Promise<ScenarioResult<ReconcileResult>> {
    if (stage !== 'modelRequest' || !admit()) return Promise.resolve({ failure: 'stageClosed' })
    return trackRecovery(async () => {
      const access = await sessionAccess(actor, session)
      if (!('borrow' in access)) return access
      if (closing) return { failure: 'stageClosed' }
      const key = access.borrow.binding.session
      if (recoveryBusy.has(key) || modelRuntime === undefined || requestDeployment === undefined)
        return { unavailable: true }
      recoveryBusy.add(key)
      recoveryAdmission.add(key)
      try {
        let ready = recoveryReady.get(key)
        if (ready === undefined) {
          const owners = callHosts.get(key)
          const cold = owners === undefined
          if (cold && (runtimeBindings.has(key) || trackedCalls.has(key)))
            return { unavailable: true }
          for (const previous of owners ?? []) if (previous.released?.()) owners?.delete(previous)
          // Capture the original handle before stop may remove the container from the store.
          const captured = new Map<string, AnchoredInvocationHandle>()
          for (const [callId, container] of trackedCalls.get(key) ?? []) {
            const handle = container.view().invocation
            if (handle !== undefined) captured.set(callId, handle)
          }
          // Stop active HTTP dispatch before draining admitted work: that work can be
          // waiting for the very abort which the host owns.
          const stopping = Promise.allSettled(
            [...(owners ?? [])].map(async owner => await owner.stop()),
          )
          await Promise.allSettled([...(sessionTasks.get(key) ?? [])])
          const stopped = await stopping
          await access.borrow.owner.drain()
          const warmBinding = runtimeBindings.get(key)
          const ownedCalls = trackedCalls.get(key)
          if (
            (!cold && warmBinding === undefined) ||
            (warmBinding !== undefined && warmBinding.log !== access.borrow.binding) ||
            access.borrow.binding.currentGeneration() !== access.borrow.binding.generation
          )
            return { unavailable: true }
          for (const [callId, container] of ownedCalls ?? []) {
            const view = container.view()
            if (
              view.key.session !== key ||
              view.key.callId !== callId ||
              view.session !== warmBinding ||
              view.owner !== access.borrow.owner.owner
            )
              return { unavailable: true }
            if (!captured.has(callId) && view.invocation !== undefined)
              captured.set(callId, view.invocation)
          }
          if (
            stopped.some(result => result.status === 'rejected' || 'unavailable' in result.value) ||
            [...(ownedCalls?.values() ?? [])].some(container => !container.canRemove())
          )
            return { unavailable: true }
          if (
            access.borrow.owner.retained() ||
            access.borrow.owner.owner.admission() !== 'open' ||
            'unknown' in access.borrow.owner.owner.opened() ||
            access.borrow.owner.owner.unresolvedWrites().length !== 0
          )
            return { unavailable: true }
          const admitted = access.borrow.owner.owner.acquire(
            requestDeployment.settlement.contention.limits.concurrent,
          )
          if ('unavailable' in admitted) return { unavailable: true }
          const prefix = await readSettlementPrefix({
            binding: access.borrow.binding,
            registration: admitted.registration,
          })
          await access.borrow.owner.drain()
          admitted.registration.release()
          if ('unavailable' in prefix) return { unavailable: true }
          const callIds = new Set<string>()
          for (const entry of prefix.prefix.entries) {
            for (const rawKey of entry.readKeys) {
              const decoded = decodeModelLogKey(rawKey)
              if ('ok' in decoded && 'call' in decoded.ok) {
                callIds.add(decoded.ok.call)
                if (!cold && !ownedCalls?.has(decoded.ok.call)) return { unavailable: true }
              }
            }
          }
          const coldTargets = new Map<string, ModelLogSettlementTarget>()
          if (cold) {
            for (const callId of callIds) {
              const history = interpretCallHistory({ prefix: prefix.prefix, callId })
              if (!('known' in history)) return { unavailable: true }
              const last = history.known.dispatches.at(-1)
              if (last === undefined || last.response !== null) continue
              coldTargets.set(callId, {
                call: callId,
                dispatch: last.record.dispatch,
                response: last.record.response,
              })
            }
          }
          const originals = new Map<
            string,
            { readonly target: ModelLogSettlementTarget; readonly handle: AnchoredInvocationHandle }
          >()
          for (const [callId, handle] of captured) {
            const history = interpretCallHistory({ prefix: prefix.prefix, callId })
            if (!('known' in history)) return { unavailable: true }
            const last = history.known.dispatches.at(-1)
            if (last === undefined || last.response !== null) continue
            originals.set(callId, {
              target: {
                call: callId,
                dispatch: last.record.dispatch,
                response: last.record.response,
              },
              handle,
            })
          }
          ready = {
            binding: { log: access.borrow.binding },
            owner: access.borrow.owner,
            originals,
            coldTargets,
            coldAbsent: cold && options.coldRecovery?.covered === true,
            scopeIssued: false,
          }
          recoveryReady.set(key, ready)
        } else {
          await Promise.allSettled([...(sessionTasks.get(key) ?? [])])
          await access.borrow.owner.drain()
        }
        return await modelRuntime.service.reconcile({ session: key })
      } catch {
        return { unavailable: true }
      } finally {
        recoveryBusy.delete(key)
      }
    })
  }
  function openModelObserver(
    actor: AuthenticatedActor,
    session: unknown,
    callId: unknown | undefined,
    consume: (serialized: string, signal: AbortSignal) => Promise<void>,
  ): Promise<
    ScenarioResult<
      | {
          readonly endpoint: ModelObserverEndpoint
          readonly access: SessionObserverAccess
          readonly revoke: () => Promise<RuntimeCloseResult>
        }
      | { readonly rejected: 'invalidInput' }
    >
  > {
    if (stage !== 'modelRequest' || !admit()) return Promise.resolve({ failure: 'stageClosed' })
    const parsedCall =
      callId === undefined ? undefined : parseOpaqueIdentifier(callId, 'ModelCallId')
    if ((parsedCall !== undefined && !isOk(parsedCall)) || typeof consume !== 'function')
      return Promise.resolve({ rejected: 'invalidInput' })
    return trackSessionInput(session, async () => {
      const access = await sessionAccess(actor, session)
      if (!('borrow' in access)) return access
      if (closing || recoveryAdmission.has(access.borrow.binding.session))
        return { failure: 'stageClosed' }
      const { borrow, checked } = access
      const endpoint = createDemoObserverEndpoint(consume)
      const original = observerAccess.grant({
        endpoint,
        session: borrow.binding.session,
        tenant: checked.tenant,
        ...(parsedCall === undefined ? {} : { callId: parsedCall.ok }),
        current: () => !closing && borrow.binding.currentGeneration() === borrow.binding.generation,
      })
      const grant = {
        async revoke(): Promise<RuntimeCloseResult> {
          const result = await original.revoke()
          if ('released' in result) observerGrants.delete(grant)
          return result
        },
      }
      observerGrants.add(grant)
      return { endpoint, access: observerAccess.access, revoke: grant.revoke }
    })
  }
  function persistModelReply(
    actor: AuthenticatedActor,
    session: unknown,
    pending: PendingModelResponse,
  ): Promise<ScenarioResult<SettlementResult>> {
    if (stage !== 'modelRequest' || !admit()) return Promise.resolve({ failure: 'stageClosed' })
    const parsed = parseOpaqueIdentifier(session, 'SessionRef')
    const work = async (): Promise<ScenarioResult<SettlementResult>> => {
      const access = await sessionAccess(actor, session)
      if (!('borrow' in access)) return access
      if (recoveryAdmission.has(access.borrow.binding.session)) return { failure: 'stageClosed' }
      if (requestDeployment === undefined) return { unavailable: true, reason: 'dependency' }
      return await persistDemoModelReply({
        pending,
        binding: access.borrow.binding,
        owner: access.borrow.owner.owner,
        contention: requestDeployment.settlement.contention,
        scheduler: requestDeployment.settlement.scheduler,
        diagnostic: recordSettlement,
      })
    }
    return isOk(parsed) ? trackSession(parsed.ok, work) : track(work)
  }
  async function modelSelectionOperation<T>(
    actor: AuthenticatedActor,
    session: unknown,
    work: (service: ModelRuntimeService, session: SessionRef) => Promise<T>,
  ): Promise<ScenarioResult<T>> {
    const bound = await bindModelRuntime(actor, session)
    if (!('service' in bound)) return bound
    const parsed = parseOpaqueIdentifier(session, 'SessionRef')
    if (!isOk(parsed)) return { failure: 'stageClosed' }
    return work(bound.service, parsed.ok)
  }
  function startServiceCall(
    actor: AuthenticatedActor,
    session: unknown,
    request: {
      readonly callId?: unknown
      readonly user: UserMessage
      readonly tools?: readonly ModelToolName[]
      readonly parameters: ModelRequestParameters
      readonly host: ModelCallHost
      readonly observer?: ModelObserverRequest
    },
  ): Promise<
    ScenarioResult<{ readonly callId: string; readonly result: DispatchResult } | OpenCallResult>
  > {
    if (stage !== 'modelRequest' || !admit()) return Promise.resolve({ failure: 'stageClosed' })
    const callId =
      request?.callId === undefined
        ? undefined
        : parseOpaqueIdentifier(request.callId, 'ModelCallId')
    const message = judgeMessage(request?.user)
    const copiedParameters = copyJsonValue(request?.parameters)
    const copiedTools = copyJsonValue(request?.tools ?? [])
    if (
      (callId !== undefined && !isOk(callId)) ||
      !('ok' in message) ||
      message.ok.type !== 'user' ||
      !('ok' in copiedParameters) ||
      !('ok' in copiedTools) ||
      !Array.isArray(copiedTools.ok)
    )
      return Promise.resolve({ invalidInput: { reason: 'malformed' } })
    const copiedUser = message.ok
    const parameters = copiedParameters.ok
    const tools: ModelToolName[] = []
    for (const raw of copiedTools.ok) {
      const name: unknown = raw
      if (typeof name !== 'string' || name.length === 0 || tools.includes(name))
        return Promise.resolve({ invalidInput: { reason: 'malformed' } })
      tools.push(name)
    }
    if (!parametersFace(parameters))
      return Promise.resolve({ invalidInput: { reason: 'malformed' } })
    const parsedSession = parseOpaqueIdentifier(session, 'SessionRef')
    const run = isOk(parsedSession)
      ? (
          work: () => Promise<
            ScenarioResult<
              { readonly callId: string; readonly result: DispatchResult } | OpenCallResult
            >
          >,
        ) => trackSession(parsedSession.ok, work)
      : track
    return run(async () => {
      const access = await sessionAccess(actor, session)
      if (!('borrow' in access)) return access
      const { borrow, checked } = access
      if (recoveryAdmission.has(borrow.binding.session)) return { failure: 'stageClosed' }
      if (
        ![...(callHosts.get(borrow.binding.session) ?? [])].some(
          owner => owner.host === request.host,
        )
      )
        return { failure: 'stageClosed' }
      if (modelRuntime === undefined) return { unavailable: true }
      if (tools.length !== 0 && requestDeployment?.assetRegistry === undefined)
        return { unavailable: true }
      runtimeActors.set(borrow.binding.session, checked)
      const effective = await modelRuntime.service.effectiveModel({
        session: borrow.binding.session,
      })
      if (!('effectiveModel' in effective)) return effective
      if (requestDeployment === undefined) return { unavailable: true }
      const appended = await appendServiceMessage(
        borrow.binding,
        borrow.owner.owner,
        checked.tenant,
        copiedUser,
      )
      if (!('messages' in appended)) return appended
      const opened = await modelRuntime.service.openCall({
        session: borrow.binding.session,
        ...(callId === undefined ? {} : { callId: callId.ok }),
        target: effective.effectiveModel.routeName,
        basis: effective.effectiveModel,
        messages: appended.messages,
        parameters,
        tools,
        host: request.host,
        ...(request.observer === undefined ? {} : { observer: request.observer }),
      })
      if ('callId' in opened) retainCall(borrow.binding.session, opened.callId)
      if (!('state' in opened) || (opened.state !== 'open' && opened.state !== 'resumable'))
        return opened
      const result = await modelRuntime.service.dispatch({
        session: borrow.binding.session,
        callId: opened.callId,
      })
      return { callId: opened.callId, result }
    })
  }
  return {
    ready,
    activateModelRequest,
    currentTime() {
      // Admitted model work may still need its terminal timestamp after the
      // application closes admission but before the clock fiber is disposed.
      if (activeClock === undefined) return 'unavailable'
      const now = activeClock.now()
      return now === 'unavailable' ? now : new Date(now).toISOString()
    },
    register(identifier, password) {
      if (!admitIdentity()) return Promise.resolve({ failure: 'stageClosed' })
      return track(async () => {
        try {
          if (registration === undefined) throw new AcceptanceOperationDefect('register')
          const result = await registration.register(identifier, password)
          record({ event: 'operation', phase: 'register', outcome: result })
          return result
        } catch (error) {
          throw operationError(error, 'register')
        }
      })
    },
    authenticate,
    publishCredential,
    verifyCredential,
    readOfficialProfiles,
    prepareSession,
    readSessionLog,
    prepareModelInputs,
    legalTargets: (actor, session) =>
      modelSelectionOperation(actor, session, (service, boundSession) =>
        service.legalTargets({ session: boundSession }),
      ),
    selectModel: (actor, session, routeName) =>
      typeof routeName === 'string'
        ? modelSelectionOperation(actor, session, (service, boundSession) =>
            service.selectModel({ session: boundSession, routeName }),
          )
        : Promise.resolve({ invalidInput: { reason: 'malformed' } }),
    effectiveModel: (actor, session) =>
      modelSelectionOperation(actor, session, (service, boundSession) =>
        service.effectiveModel({ session: boundSession }),
      ),
    displayList: (actor, session) =>
      modelSelectionOperation(actor, session, (service, boundSession) =>
        service.displayList({ session: boundSession }),
      ),
    openModelObserver,
    persistModelReply,
    bindModelRuntime,
    attachModelCallHost,
    reconcileModelRuntime,
    startServiceCall,
    appendServiceToolResult,
    close() {
      if (closingPromise !== undefined) return closingPromise
      closing = true
      gateOpen = false
      const attempt = (async () => {
        await ready.then(
          () => undefined,
          () => undefined,
        )
        await activationTask?.then(
          () => undefined,
          () => undefined,
        )
        return closeResources()
      })()
      closingPromise = attempt
      attempt.then(
        result => {
          if (!result.complete && closingPromise === attempt) closingPromise = undefined
        },
        () => {
          if (closingPromise === attempt) closingPromise = undefined
        },
      )
      return attempt
    },
    status() {
      return {
        serving: admit(),
        closing,
        diagnosticFailures,
        inFlight: admitted.size,
        fibers: Object.fromEntries([...fibers].map(([name, fiber]) => [name, fiber.state])),
      }
    },
  }
}

export interface ModelInputSource {
  readonly publication: LocalPublication
  readonly recipe: Omit<SessionRecipeInput, 'session' | 'tenant'>
}
export type PublishSourceFailure = Extract<
  Awaited<ReturnType<typeof publishLocalInputs>>,
  { readonly failure: string }
>
export type CaptureRecipeFailure = Extract<
  Awaited<ReturnType<typeof captureSessionRecipe>>,
  { readonly failure: string }
>

function parametersFace(value: unknown): value is ModelRequestParameters {
  return 'ok' in judgeModelProfileDocument('ModelRequestParameters', value)
}
