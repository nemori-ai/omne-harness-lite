import { createDemoModelInputs } from './model-runtime-inputs.ts'
import { startModelRuntimeAssembly } from './model-runtime-assembly.ts'
import {
  createDemoRecoveryScope,
  discardUnissuedRecovery,
  type DemoRecoveryReady,
} from './recovery-lifetime.ts'
import {
  captureExecutionInvocations,
  releasedExecutionCalls,
  originalExecutionInvocation,
} from './recovery-executions.ts'
import {
  createSessionModelSelection,
  ownOpenCallInput,
  validDispatchInput,
  modelCallContentMigrations,
  type SettlementCoordinator,
  type SessionModelSelection,
} from '@omne-harness-lite/model-request-runtime-local'
import { attemptStartedPayload } from '@omne-harness-lite/session-runtime'
import type { UpgradeConfirmation } from '@omne-harness-lite/storage'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import { organizationGovernancePlugin } from '@omne-harness-lite/organization-governance-sql/cordis'
import { credentialsPlugin } from '@omne-harness-lite/credential-verification-scrypt/cordis'
import { clockPlugin } from '@omne-harness-lite/clock-lease/cordis'
import { storageBinding } from './storage-binding.ts'
import { controlledModelTransport } from './controlled-model-transport.ts'
import { TransportTls } from './assembly-inputs.ts'
import {
  DirectoryDiagnostics,
  ReplicaReader,
  EvaluationSupport,
  TransportSupport,
  InputMeters,
  RetrySample,
  BorrowedRunnerHost,
  BorrowedManifest,
  BorrowedAssetRegistry,
} from './assembly-inputs.ts'
import {
  copyJsonValue,
  isJsonNumber,
  jsonNumberSource,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  judgeModelProfileDocument,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import { type SessionEffectiveModelResult } from '@omne-harness-lite/model-request-runtime-local'
import {
  interpretCallHistory,
  readSettlementPrefix,
  type SessionRuntimeBinding,
  type SessionObserverAccess,
  type SettlementResult,
  type SettlementOwner,
  type SessionModelSelectionInput,
  type SettlementLogBinding,
  type RunHistoryReader,
  type CurrentHistoryReaders,
  type LegalTargetsResult,
  type DisplayListResult,
  type AnchoredInvocationHandle,
  type ModelRuntimeExecutionCapture,
  type ObserverDiagnostic,
  type SettlementDiagnostic,
} from '@omne-harness-lite/model-request-runtime'
import type {
  ModelRuntimeOperations,
  ModelRuntimeHostInputs,
  ModelCallHost,
  ModelObserverRequest,
  DispatchResult,
  OpenCallResult,
  OpenCallRun,
  ModelObserverEndpoint,
  RuntimeCloseResult,
  SessionSelectModelResult,
  ServiceEffectiveModelResult,
  ServiceLegalTargetsResult,
  ServiceSelectModelResult,
  ServiceDisplayListResult,
  ReconcileResult,
  FailureConsumableOperation,
  FailureConsumption,
} from '@omne-harness-lite/model-request-runtime'
import {
  type ModelLogSettlementTarget,
  type DiagnosticEvent,
} from '@omne-harness-lite/model-request-runtime'
import {
  captureModelLogValue,
  decodeModelLogKey,
  prepareModelLogEntry,
  modelLogJsonEqual,
} from '@omne-harness-lite/model-request-runtime'
import {
  validate as validateMessage,
  judgeMessage,
  judgePairing,
  type SessionRef,
  type UserMessage,
  type ToolMessage,
  type LoggedMessage,
  type SystemReminderMessage,
} from '@omne-harness-lite/messages'
import {
  ExactDecimal,
  judgeAccountValue,
  type RunId,
  type AttemptId,
} from '@omne-harness-lite/call-accounts'
import type { ModelToolName } from '@omne-harness-lite/tool-definition'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import { createRequestOwner } from './model-request-owner.ts'
import {
  createDemoCallAccess,
  createDemoCallPresence,
  deriveCreationKey,
} from './call-references.ts'
import { createDemoRunnerHost, type DemoRunnerRequest } from './runner-host.ts'
import { LOOP_EXTENSION_RUNNER } from '@omne-harness-lite/loop-extension-runner/cordis'
import { loopExtensionRunnerPlugin } from '@omne-harness-lite/loop-extension-runner-local/cordis'
import {
  type LoopExtensionRunnerService,
  type RunnerDispatchRequest,
  type RunnerPassResult,
  type RunnerReplayFailure,
  type RunnerReplayRequest,
} from '@omne-harness-lite/loop-extension-runner'
import { modelDefaultRetry } from '@omne-harness-lite/model-request-runtime-local/cordis'
import {
  createDemoRunnerServiceHost,
  readDemoRunnerFailure,
  type DemoRunnerServiceHostDependencies,
} from './runner-service-host.ts'
import { createDemoObserverAccess, createDemoObserverEndpoint } from './model-observer-endpoint.ts'
import { persistDemoModelReply } from './persist-model-reply.ts'
import { installDemoTools } from './tool-demo-assembly.ts'
import { createToolRunnerFacilities } from './tool-runner-facilities.ts'
import { createToolDriverJournal, createToolDeliveryJournal } from './tool-driver-journal.ts'
import { createToolActionDriver } from './tool-action-driver.ts'
import { createToolDelivery } from './tool-delivery.ts'
import { createToolTurnDriver } from './tool-turn-driver.ts'
import { createToolMaintenanceRunner } from './tool-maintenance-runner.ts'
import { projectToolJournal } from '@omne-harness-lite/tool-execution-runtime'
import { createToolDriverRunReader } from './tool-driver-run-reader.ts'
import { encodeModelLogKey } from '@omne-harness-lite/model-request-runtime'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'

import type { DemoCallHost } from './model-call-host.ts'
import {
  messagePrefix,
  readDemoCalibrationHistory,
  historyProjection,
  nativeCompatibility,
  type ControlledSingleRunSelection,
} from './model-request-text.ts'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import {
  assemblyManifestMigrations,
  createAssemblyManifestStore,
  type AssemblyManifestStore,
} from '@omne-harness-lite/assembly-manifest-store'
import { createAssetRegistry, type AssetRegistry } from '@omne-harness-lite/asset-registry-local'
import { type AvailabilityReport } from '@omne-harness-lite/asset-registry'
import {
  createRegistryHistoryReader,
  type RegistryHistoryReader,
} from '@omne-harness-lite/evaluation-input-store/registry-history'
import {
  createRegistryInputReader,
  type RegistryInputReader,
} from '@omne-harness-lite/evaluation-input-store/registry-inputs'
import { evaluationInputStorePlugin } from '@omne-harness-lite/evaluation-input-store/cordis'
import {
  evaluationInputMigrations,
  type InputSourceDependencies,
} from '@omne-harness-lite/evaluation-input-store'
import { CURRENT_EVALUATION_INPUTS } from '@omne-harness-lite/asset-evaluation/cordis'
import { type CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import {
  publishLocalInputs,
  captureSessionRecipe,
  type LocalPublication,
  type SessionRecipeInput,
} from '@omne-harness-lite/evaluation-input-store/publication'
import {
  createModelTransportService,
  type TransportOptions,
} from '@omne-harness-lite/pi-ai-transport'
import {
  type ModelTransportService,
  type PlannedRequest,
  type RawResponse,
} from '@omne-harness-lite/model-request-runtime'
import { modelContribution, piAiTransportPlugin } from '@omne-harness-lite/pi-ai-transport/cordis'
import { MODEL_TRANSPORT } from '@omne-harness-lite/model-request-runtime/cordis'
import { prepareModelRequestDeployment } from './model-request-deployment.ts'
import type {
  DemoDiagnosticAssembly,
  DemoTransportRetention,
  TransportReservation,
} from './diagnostic-assembly.ts'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { Context, type Fiber, type Plugin } from '@deepseek-ai/cordis'
import { accountIdentityPlugin } from '@omne-harness-lite/account-identity-sql/cordis'
import { LOGINS_SERVICE } from '@omne-harness-lite/account-identity/cordis'
import { type LoginsService } from '@omne-harness-lite/account-identity'
import { registrationPlugin } from '@omne-harness-lite/account-registration-sequential/cordis'
import { REGISTRATION_SERVICE } from '@omne-harness-lite/account-registration/cordis'
import {
  type RegistrationService,
  type TerminalOutcome,
} from '@omne-harness-lite/account-registration'
import { clockPreflight } from '@omne-harness-lite/clock-lease'
import {
  createModelReplicaCustodian,
  type ModelReplicaCustodian,
} from '@omne-harness-lite/credential-custodian-local/model-replica'
import {
  isOk,
  parseOpaqueIdentifier,
  parseTenantId,
  type TenantId,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import {
  type ModelCatalog,
  type ProfileRow,
  type CredentialLookup,
} from '@omne-harness-lite/model-profile-directory'
import {
  modelProfileDirectoryPlugin,
  localCredentialLookupPlugin,
} from '@omne-harness-lite/model-profile-directory-local/cordis'
import { MODEL_CATALOG, CREDENTIAL_LOOKUP } from '@omne-harness-lite/model-profile-directory/cordis'
import { createCredentialBindingReader } from '@omne-harness-lite/model-profile-directory-local/tx-reads'
import { sessionTenancyTablePlugin } from '@omne-harness-lite/session-tenancy-table/cordis'
import { SESSION_TENANCY } from '@omne-harness-lite/session-tenancy/cordis'
import { type SessionTenancyService } from '@omne-harness-lite/session-tenancy'
import {
  openSqlSessionLog,
  sessionLogMigrations,
  type SqlSessionLog,
} from '@omne-harness-lite/session-log-sql'
import {
  createOriginalIssueOwner,
  originalIssueMigrations,
} from '@omne-harness-lite/model-request-runtime-local'
import { createSessionTenancyReader } from '@omne-harness-lite/session-tenancy-table'
import {
  createSqlLogAuthority,
  checkSqlActor,
  type SqlLogAuthoritySources,
} from './sql-log-authority.ts'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import { type ReadResult } from '@omne-harness-lite/session-log'
import {
  borrowedSessionLog,
  SessionLogBacking,
  prepareSessionLogDeployment,
} from './session-log-owner.ts'
import { createSessionLogBacking } from './log-backing.ts'
import { AuthorizedLogOwner, createAuthorizedLogOwner } from './authorized-log-owner.ts'
import { createSessionIngress, SessionIngressAuthority } from './session-ingress.ts'
import { createSessionContextCreator } from './session-context-creation.ts'
import { sessionIdentitySource } from './session-context-source.ts'
import { runtimeContextMigrations } from '@omne-harness-lite/runtime-context-local'
import { startRuntimeContextAssembly } from './runtime-context-assembly.ts'
import { createTrustedSessionAccessPlugin } from './trusted-session-access.ts'
import type {
  SessionAccess,
  SessionScope,
  AccessOperation,
} from '@omne-harness-lite/session-tenancy'
import { seedHoldingTenant } from '@omne-harness-lite/session-tenancy-table/seed'
import { readSessionCatalogIn } from '@omne-harness-lite/session-tenancy-table/maintenance'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { MEMBERSHIPS_SERVICE } from '@omne-harness-lite/organization-governance/cordis'
import { type MembershipsService } from '@omne-harness-lite/organization-governance'
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

type LoginFace = Pick<LoginsService, 'participate' | 'issue' | 'exchange' | 'verify'>
type MembershipFace = Pick<MembershipsService, 'participate' | 'currentTenant' | 'standing'>
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
    typeof value.verify === 'function' &&
    typeof value.participate === 'function'
  )
}
function membershipFace(value: unknown): value is MembershipFace {
  return (
    object(value) &&
    typeof value.currentTenant === 'function' &&
    typeof value.standing === 'function' &&
    typeof value.participate === 'function'
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
    typeof value.clearReuseScope === 'function' &&
    typeof value.retire === 'function' &&
    typeof value.close === 'function' &&
    typeof value.inspect === 'function' &&
    value.closed instanceof Promise
  )
}
function runnerServiceFace(value: unknown): value is LoopExtensionRunnerService {
  return object(value) && typeof value.dispatch === 'function' && typeof value.replay === 'function'
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

/** Fixed demo grants; the tool function receives neither of these coordinator-held tokens. */
export type ToolSessionBinding =
  | {
      readonly kind: 'bound'
      readonly scope: SessionScope
      readonly control: SessionAccess
      readonly tool: SessionAccess
      readonly model: SessionAccess
    }
  | {
      readonly kind: 'rejected'
      readonly reason: 'invalidInput' | 'notAuthorized' | 'unavailable' | 'ownerStopped'
    }

export interface AcceptanceApplication {
  /** Creates the context-aware demo session. Existing sessions are never given default declarations. */
  readonly createToolSession: (
    actor: AuthenticatedActor,
    session: unknown,
  ) => Promise<ToolSessionBinding>
  readonly bindToolSession: (
    actor: AuthenticatedActor,
    session: unknown,
  ) => Promise<ToolSessionBinding>
  /** Explicit development host entry; storage and tenant scope remain application-owned. */
  runExtensionPass(
    actor: AuthenticatedActor,
    session: unknown,
    request: DemoRunnerRequest,
  ): Promise<ScenarioResult<RunnerPassResult>>
  dispatchRunner(
    actor: AuthenticatedActor,
    session: unknown,
    request: RunnerDispatchRequest,
    signal: AbortSignal,
  ): Promise<ScenarioResult<RunnerPassResult>>
  replayRunner(
    actor: AuthenticatedActor,
    session: unknown,
    request: RunnerReplayRequest,
  ): Promise<
    ScenarioResult<
      readonly import('@omne-harness-lite/loop-extension').Conclusion[] | RunnerReplayFailure
    >
  >
  readonly ready: Promise<{ readonly confirmation: UpgradeConfirmation }>
  /** The verified tenant and local diagnostic owners must already be open before P-2 starts. */
  activateModelRequest(
    actor: AuthenticatedActor,
    diagnostics: Pick<DemoDiagnosticAssembly, 'local' | 'tenant'>,
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
  ): Promise<ScenarioResult<{ readonly service: ModelRuntimeOperations }>>
  startServiceCall(
    actor: AuthenticatedActor,
    session: unknown,
    request: OpenCallRun & {
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
  runToolTurn(
    actor: AuthenticatedActor,
    session: unknown,
    request: {
      readonly user: UserMessage
      readonly parameters: ModelRequestParameters
      readonly host: ModelCallHost
      readonly observer?: ModelObserverRequest
    },
    signal: AbortSignal,
  ): Promise<
    | { readonly kind: 'saved' | 'failed'; readonly response: ModelResponse }
    | { readonly kind: 'rejected'; readonly reason: string }
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

/** Construction-only fixture: it borrows this application's real auth, registry and SL3 owner. */
export interface ControlledRunFixturePort {
  startAttempt(
    actor: AuthenticatedActor,
    session: unknown,
    run: RunId,
    attempt: AttemptId,
  ): Promise<
    ScenarioResult<
      | { readonly report: AvailabilityReport; readonly release: () => void }
      | { readonly invalidInput: { readonly reason: 'malformed' } }
      | { readonly unavailable: true }
    >
  >
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
    /** Only a trusted external execution owner may lend Run, log and environment facts. */
    readonly runnerExternal?: DemoRunnerServiceHostDependencies['external']
    /** Trusted Run owner interprets both terminal axes from the supplied owned prefix. */
    readonly runHistory?: RunHistoryReader
    /** Trusted source owner proves selected-message ancestry from this owned prefix. */
    readonly calibrationHistory?: CurrentHistoryReaders['calibration']
    /** Trusted local acceptance fixture only; not a demo application or CLI operation. */
    readonly controlledRunFixture?: (port: ControlledRunFixturePort) => void
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
  const fibers = new Map<ResourceCloseStep, Fiber>()
  const admitted = new Set<Promise<unknown>>()
  const hooks = options.hooks
  let storage: SqlStorage | undefined
  let replica: ModelReplicaCustodian | undefined
  let sessionLogOwner: SqlSessionLog | undefined
  let journalTenancy: ReturnType<typeof createSessionTenancyReader> | undefined
  let originalIssue: ReturnType<typeof createOriginalIssueOwner> | undefined
  let journalAuthoritySource: SqlLogAuthoritySources | undefined
  const journalRecovery = Object.freeze(Object.create(null)) as RecoveryAccess
  let sessionLogBacking: ReturnType<typeof createSessionLogBacking> | undefined
  let authorizedLogOwner: Awaited<ReturnType<typeof createAuthorizedLogOwner>> | undefined
  let sessionIngress: ReturnType<typeof createSessionIngress> | undefined
  let contextCreator: ReturnType<typeof createSessionContextCreator> | undefined
  let contextAssembly: Awaited<ReturnType<typeof startRuntimeContextAssembly>> | undefined
  const trustedAccess = createTrustedSessionAccessPlugin()
  let runnerHost: ReturnType<typeof createDemoRunnerHost> | undefined
  let runnerService: LoopExtensionRunnerService | undefined
  let runnerServiceFiber: Fiber | undefined
  let defaultRetryFiber: Fiber | undefined
  let toolAssembly: Awaited<ReturnType<typeof installDemoTools>> | undefined
  let toolFacilities: ReturnType<typeof createToolRunnerFacilities> | undefined
  // The demo policy owner issues one opaque, empty discretionary-grant context.
  const demoToolGrants = Object.freeze(
    Object.create(null),
  ) as import('@omne-harness-lite/tool-admission').AuthorizationContext
  const toolDrivers = new Map<
    string,
    {
      readonly actor: AuthenticatedActor
      readonly binding: Extract<ToolSessionBinding, { kind: 'bound' }>
      readonly driver: ReturnType<typeof createToolTurnDriver>
      readonly close: () => Promise<void>
    }
  >()

  const invocationActors = new AsyncLocalStorage<AuthenticatedActor | undefined>()
  function withInvocationActor<T>(actor: AuthenticatedActor, work: () => Promise<T>): Promise<T> {
    const captured = copyJsonValue(actor)
    const identity =
      'failed' in captured ||
      captured.ok === null ||
      typeof captured.ok !== 'object' ||
      Array.isArray(captured.ok)
        ? undefined
        : (captured.ok as unknown as AuthenticatedActor)
    return invocationActors.run(identity, work)
  }
  const toolMaintenance = new AsyncLocalStorage<SessionScope>()
  const toolDeliveries = new Map<string, ReturnType<typeof createToolDelivery>>()
  let manifest: AssemblyManifestStore | undefined
  let registryHistory: RegistryHistoryReader | undefined
  let fixedRootInput: RegistryInputReader | undefined
  let assetRegistry: AssetRegistry | undefined
  let transportService: ModelTransportService | undefined
  const modelContributions: Fiber[] = []
  let modelAssembly: Awaited<ReturnType<typeof startModelRuntimeAssembly>> | undefined
  let modelInputs: Awaited<ReturnType<typeof createDemoModelInputs>> | undefined
  let modelRuntime:
    ReturnType<Awaited<ReturnType<typeof startModelRuntimeAssembly>>['owner']> | undefined
  let projectModel:
    | ((
        actor: AuthenticatedActor,
        boundSession?: SessionRef,
        recoveryAuthorization?: ModelRuntimeHostInputs['recovery']['authorize'],
      ) => ModelRuntimeOperations)
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
  // Aborted when this application withdraws access; every access evidence carries this signal.
  const accessRevocation = new AbortController()
  // Sessions whose cold recovery scope was built under host-witnessed exit of the old worker.
  // Settlement coordinators that still own an unresolved original write; closed again on shutdown.
  const retainedSettlements = new Set<Pick<SettlementCoordinator, 'close'>>()
  const retainedSettlementSessions = new WeakMap<Pick<SettlementCoordinator, 'close'>, SessionRef>()
  const coldStopped = new Map<SessionRef, ReadonlyMap<string, ModelLogSettlementTarget>>()
  const runtimeBindings = new Map<SessionRef, SessionRuntimeBinding>()
  const controlledRuns = new Map<SessionRef, ControlledSingleRunSelection>()
  const callHosts = new Map<SessionRef, Set<DemoCallHost>>()
  const sessionTasks = new Map<SessionRef, Set<Promise<unknown>>>()
  const recoveryTasks = new Set<Promise<unknown>>()
  const recoveryAdmission = new Set<SessionRef>()
  const recoveryBusy = new Set<SessionRef>()
  const recoveryReady = new Map<SessionRef, DemoRecoveryReady>()
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
        readonly local: DemoDiagnosticAssembly['local']
        readonly tenant: DemoDiagnosticAssembly['tenant']
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
          inputSource !== undefined &&
          runnerServiceFiber?.state === FIBER_STATE.ACTIVE &&
          defaultRetryFiber?.state === FIBER_STATE.ACTIVE))
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
  type ResourceCloseStep =
    | StageFiber
    | 'replica'
    | 'sessionLogOwner'
    | 'sessionLogBorrows'
    | 'authorizedLogOwner'
    | 'contextCreator'
    | 'modelContributions'
    | 'modelRuntime'
    | 'modelInputs'
    | 'assetRegistry'
    | 'registryHistory'
    | 'fixedRootInput'
    | 'assemblyManifest'

  async function drainToolConsumers() {
    if ((await toolAssembly?.closeAuthors()) === 'retained')
      throw new Error('Tool author close retained')
    for (const driver of toolDrivers.values()) await driver.close()
    toolDrivers.clear()
    for (const delivery of toolDeliveries.values()) await delivery.close()
    toolDeliveries.clear()
    await toolFacilities?.close()
    if ((await toolAssembly?.closeDependencies()) === 'retained')
      throw new Error('Tool dependency close retained')
    await runnerServiceFiber?.dispose()
    await defaultRetryFiber?.dispose()
  }
  function modelResourcesRetained(
    stoppedRuntime: Awaited<ReturnType<NonNullable<typeof modelRuntime>['close']>> | undefined,
  ) {
    return (
      retainedSettlements.size !== 0 ||
      (stoppedRuntime !== undefined && 'unavailable' in stoppedRuntime) ||
      (transportService !== undefined &&
        (transportService.inspect().references !== 0 ||
          transportService.inspect().executions !== 0)) ||
      [...sessionBorrows.values()].some(borrow => borrow.owner.retained())
    )
  }
  async function closeRetainedSettlements(session?: SessionRef): Promise<boolean> {
    const owned = [...retainedSettlements].filter(
      coordinator =>
        session === undefined || retainedSettlementSessions.get(coordinator) === session,
    )
    const results = await Promise.allSettled(
      owned.map(async coordinator => {
        await coordinator.close()
        retainedSettlements.delete(coordinator)
        retainedSettlementSessions.delete(coordinator)
      }),
    )
    return results.every(result => result.status === 'fulfilled')
  }
  async function drainModelConsumers() {
    // Recovery still uses the original runtime, binding and SQL journal owner.
    await Promise.allSettled([...recoveryTasks])
    for (const session of recoveryReady.keys()) discardUnissuedRecovery(session, recoveryReady)
    const stoppedRuntime = await modelRuntime?.close()
    const stoppedSelections = await Promise.allSettled(
      [...sessionBorrows.values()].flatMap(borrow =>
        borrow.selector === undefined ? [] : [borrow.selector.close()],
      ),
    )
    await Promise.allSettled([...admitted])
    const lateObservers = await Promise.allSettled([...observerGrants].map(grant => grant.revoke()))
    // An unresolved original settlement write is resolved on its own coordinator, or it stays owned.
    await closeRetainedSettlements()
    const consumerUnavailable = [...stoppedSelections, ...lateObservers].some(
      result => result.status === 'rejected' || 'unavailable' in result.value,
    )
    if (consumerUnavailable || modelResourcesRetained(stoppedRuntime)) return false
    if (modelRuntime !== undefined && !('released' in modelRuntime.executionSource.release()))
      return false
    for (const borrow of sessionBorrows.values()) borrow.owner.release()
    return true
  }
  function resourceCloseOrder(): readonly ResourceCloseStep[] {
    return [
      ...(stage === 'modelRequest'
        ? ([
            'modelRuntime',
            'modelInputs',
            'modelContributions',
            'modelTransport',
            'assetRegistry',
            'fixedRootInput',
            'registryHistory',
            'assemblyManifest',
            'evaluationInputs',
          ] as const)
        : []),
      ...(logStage
        ? ([
            'contextCreator',
            'sessionContextSource',
            'runtimeContext',
            'authorizedLogOwner',
            'sessionAccess',
            'sessionLogBorrows',
            'sessionLogOwner',
            'sessionLog',
          ] as const)
        : []),
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
  }
  const resourceClosers: Partial<Record<ResourceCloseStep, () => Promise<unknown>>> = {
    async modelRuntime() {
      if ((await modelAssembly?.close()) === 'retained')
        throw new Error('model runtime close retained')
    },
    async modelInputs() {
      await modelInputs?.close()
    },
    async modelContributions() {
      const retired = await Promise.allSettled(
        [...modelContributions].reverse().map(fiber => fiber.dispose()),
      )
      if (retired.some(result => result.status === 'rejected'))
        throw new Error('model contribution cleanup failed')
    },
    contextCreator: async () => contextCreator?.drain(),
    async runtimeContext() {
      if ((await contextAssembly?.close()) === 'retained')
        throw new Error('runtime context close retained')
    },
    authorizedLogOwner: async () => authorizedLogOwner?.drain(),
    sessionLogBorrows: async () => sessionLogBacking?.drain(),
    async sessionLogOwner() {
      if (originalIssue !== undefined && (await originalIssue.close()).kind !== 'released')
        throw new Error('original model claim retained')
      if (!runnerHost) {
        await sessionLogOwner?.close()
        return
      }
      const result = await runnerHost.close()
      if (!result.complete) throw new Error('runner task recovery unfinished')
      await journalTenancy?.close()
      for (const item of result.recovered)
        record({ event: 'close', phase: 'runnerRecovery', outcome: item.kind })
    },
    assetRegistry: async () => assetRegistry?.close(),
    fixedRootInput: async () => fixedRootInput?.close(),
    registryHistory: async () => registryHistory?.close(),
    assemblyManifest: async () => manifest?.close(),
  }
  async function closeAssemblyResource(name: ResourceCloseStep) {
    const close = resourceClosers[name]
    if (close) await close()
    else await fibers.get(name)?.dispose()
  }
  async function closePhysicalResources(unfinished: string[]) {
    if (unfinished.length) return
    try {
      await storage?.close()
      record({ event: 'close', phase: 'storageOwner', outcome: 'closed' })
    } catch {
      unfinished.push('storageOwner')
      record({ event: 'close', phase: 'storageOwner', outcome: 'failed' })
      return
    }
    try {
      await context.fiber.dispose()
    } catch {
      unfinished.push('context')
    }
  }
  async function closeResources(): Promise<CloseResult> {
    if (cleanupPromise !== undefined) return cleanupPromise
    closing = true
    gateOpen = false
    accessRevocation.abort()
    runnerHost?.closeAdmission()
    contextCreator?.closeAdmission()
    contextAssembly?.closeAdmission()
    modelAssembly?.closeAdmission()
    record({ event: 'gate', phase: 'scenario', outcome: 'closed' })
    const attempt = (async () => {
      // Stop actual consumers before waiting admitted work: setup work cannot start a new call once closing.
      await Promise.allSettled([...observerGrants].map(grant => grant.revoke()))
      try {
        await drainToolConsumers()
      } catch {
        return {
          complete: false,
          unfinished: ['runnerService', 'defaultRetry', 'modelRequestConsumers', 'sessionLogOwner'],
          pending: await guard.pending(),
        }
      }
      if (!(await drainModelConsumers()))
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
      // Admitted delivery can still need a maintenance read to recognize its complete C batch.
      // The business gate is already closed; keep the physical owner available until consumers drain.
      authorizedLogOwner?.closeAdmission()
      sessionLogBacking?.closeAdmission()
      sessionIngress?.stop()

      coldStopped.clear()
      runtimeBindings.clear()
      controlledRuns.clear()
      const unfinished: string[] = []
      const order = resourceCloseOrder()
      for (const [index, name] of order.entries()) {
        try {
          if (name === 'replica') await replica?.close()
          else await closeAssemblyResource(name)
          record({ event: 'close', phase: name, outcome: 'closed' })
        } catch {
          unfinished.push(...order.slice(index))
          record({ event: 'close', phase: name, outcome: 'failed' })
          break
        }
      }
      await closePhysicalResources(unfinished)
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
  function migrationFragments() {
    return [
      ...(preparationStage ? requestPreparationMigrations : acceptanceMigrations),
      ...(stage === 'modelRequest' ? evaluationInputMigrations : []),
      ...(stage === 'modelRequest' ? assemblyManifestMigrations : []),
      ...(stage === 'modelRequest' ? modelCallContentMigrations('sqlite') : []),
      ...(logStage
        ? [...runtimeContextMigrations, ...sessionLogMigrations, ...originalIssueMigrations]
        : []),
      ...(hooks?.extraMigrations ?? []).filter(
        extra => !assemblyManifestMigrations.some(builtin => builtin === extra),
      ),
    ]
  }
  async function prepareDeploymentStage() {
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
    return { prepared, logDeployment }
  }
  function databaseReplaced(
    prepared: Awaited<ReturnType<typeof prepare>>,
    owner: { readonly dev: bigint; readonly ino: bigint; readonly birthtimeNs: bigint },
  ) {
    const prior = prepared.databaseIdentity
    return (
      prior === undefined ||
      prior.dev !== owner.dev ||
      prior.ino !== owner.ino ||
      prior.birthtimeNs !== owner.birthtimeNs
    )
  }
  async function verifyDatabaseOwner(prepared: Awaited<ReturnType<typeof prepare>>) {
    const database = await open(config.databaseFile, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const owner = await database.stat({ bigint: true })
      const uid = process.getuid?.()
      if (!owner.isFile() || uid === undefined || owner.uid !== BigInt(uid))
        throw new Error('acceptance database owner invalid')
      // The read-only precheck already refused unsafe preexisting files.
      // Only a genuinely new/replaced owned file is eligible for restriction.
      const replaced = databaseReplaced(prepared, owner)
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
  }
  async function openStorageStage(prepared: Awaited<ReturnType<typeof prepare>>) {
    phase = 'storage'
    category = 'storage'
    const fragments = migrationFragments()
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
    await verifyDatabaseOwner(prepared)
    record({ event: 'stage', phase: 'migrations', outcome: 'complete' })
    await hooks?.storageOpened?.(storage, guard)
    assertNotClosing()
    await load('storage', storageBinding(storage), {})

    return storage
  }
  async function awaitClockReady() {
    phase = 'clockReady'
    category = 'clockUnavailable'
    const clock: unknown = context.get(CLOCK_SERVICE)
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
    return clock
  }
  async function confirmUpgrade(clock: Clock) {
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
    return confirmation
  }
  async function startDirectory(prepared: Awaited<ReturnType<typeof prepare>>) {
    new DirectoryDiagnostics(context, {
      record(event) {
        record({
          event: 'directory',
          phase: event.operation,
          outcome: event.outcome ?? event.phase,
        })
      },
    })
    await load('directory', modelProfileDirectoryPlugin, prepared.directory)
  }
  async function startSessionTenancy() {
    if (preparationStage) {
      await load('sessionTenancy', sessionTenancyTablePlugin, {})
      const value: unknown = context.get(SESSION_TENANCY)
      if (!sessionTenancyFace(value)) throw new Error('acceptance session tenancy absent')
      sessionTenancy = value
    }
  }
  async function openPhysicalLog(logDeployment: AcceptanceConfig['sessionLog']) {
    phase = 'sessionLog'
    category = 'failed'
    assertNotClosing()
    if (logDeployment === undefined) throw new Error('acceptance log deployment absent')
    if (storage === undefined) throw new Error('session journal storage absent')
    journalTenancy = createSessionTenancyReader(storage)
    journalAuthoritySource = {
      storage,
      recovery: journalRecovery,
      tenancy: journalTenancy,
      logins: () => logins,
      memberships: () => memberships,
      access: trustedAccess,
      ingress: () => sessionIngress,
    }
    const authority = createSqlLogAuthority(journalAuthoritySource)
    sessionLogOwner = openSqlSessionLog({
      storage,
      authority,
      operationLimit: logDeployment.operationLimit,
    })
    originalIssue = createOriginalIssueOwner({
      storage,
      log: sessionLogOwner.participant,
      access: journalRecovery,
      limit: logDeployment.operationLimit,
      authority: {
        async authorizeIn(unit, identity) {
          const actor = invocationActors.getStore()
          if (actor === undefined || closing || journalAuthoritySource === undefined)
            return { kind: 'unavailable' }
          const result = await checkSqlActor(unit, journalAuthoritySource, actor, identity)
          return { kind: result === 'notAuthorized' ? 'denied' : result }
        },
      },
    })
    const consumerLog = (await hooks?.sessionLogOpened?.(sessionLogOwner)) ?? sessionLogOwner
    sessionLogBacking = createSessionLogBacking(
      consumerLog,
      sessionLogOwner.backing.ownerGeneration,
    )
    new SessionLogBacking(context, sessionLogBacking.operations)
    runnerHost = createDemoRunnerHost(sessionLogOwner, sessionLogOwner.backing.ownerGeneration)
    await load('sessionLog', borrowedSessionLog, {})
  }
  function captureBusinessServices() {
    const loginValue: unknown = context.get(LOGINS_SERVICE),
      membershipValue: unknown = context.get(MEMBERSHIPS_SERVICE),
      catalogValue: unknown = context.get(MODEL_CATALOG),
      lookupValue: unknown = context.get(CREDENTIAL_LOOKUP),
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
  }
  const authorizeSessionIngress: Parameters<typeof createSessionIngress>[0] = async (
    actor,
    scope,
  ) => {
    // Application admission rejects new work during close. Existing tracked work
    // keeps its live ingress until the domain drains, with current identity checks.
    if (sessionTenancy === undefined) return 'unavailable'
    const checked = await checkActor(actor)
    if (!('account' in checked)) return 'notAuthorized'
    if (!tenantIdEquals(checked.tenant, scope.tenant)) return 'notAuthorized'
    const held = await sessionTenancy.holdingTenant(scope.session)
    if ('failure' in held) return held.failure === 'unavailable' ? 'unavailable' : 'notAuthorized'
    return tenantIdEquals(held.tenant, scope.tenant) ? 'authorized' : 'notAuthorized'
  }
  async function startLogicalLogDomain(
    logDeployment: AcceptanceConfig['sessionLog'],
    storage: SqlStorage,
    clock: Clock,
  ) {
    sessionIngress = createSessionIngress(authorizeSessionIngress)
    new SessionIngressAuthority(context, sessionIngress.operations)
    await load('sessionAccess', trustedAccess.plugin, {})
    if (!sessionLogBacking || !sessionTenancy || !logDeployment)
      throw new Error('session log owner dependencies absent')
    const catalogStorage = storage
    if (sessionLogOwner === undefined) throw new Error('SQL journal owner absent')
    const owner = await createAuthorizedLogOwner({
      owner: sessionLogOwner.owner,
      ...(hooks?.sessionLogOpened === undefined ? {} : { decorateLog: hooks.sessionLogOpened }),
      generation: sessionLogOwner.backing.ownerGeneration,
      recovery: journalRecovery,
      catalog: () => catalogStorage.read(tx => readSessionCatalogIn(tx)),
    })
    authorizedLogOwner = owner
    context.effect(() => () => owner.drain())
    new AuthorizedLogOwner(context, owner.operations)
    await restoreContextPrefixes(owner)
    await startContextProvider(catalogStorage, sessionTenancy, clock)
  }
  async function restoreContextPrefixes(
    owner: Awaited<ReturnType<typeof createAuthorizedLogOwner>>,
  ) {
    // No creation or user write is admitted until every existing physical prefix is checked.
    const owned = await owner.operations.enumerate(owner.recovery)
    if (owned.kind !== 'sessions') throw new Error('session log catalog unavailable')
    for (const { scope } of owned.sessions) {
      const prefix = await owner.operations.readPrefix(owner.recovery, scope)
      if (prefix.kind !== 'prefix') throw new Error('session log prefix recovery unavailable')
    }
  }
  async function startContextProvider(
    catalogStorage: SqlStorage,
    sessionTenancy: SessionTenancyService,
    clock: Clock,
  ) {
    contextAssembly = await startRuntimeContextAssembly(context)
    await contextAssembly.ready
    const contextFiber = contextAssembly.fiber()
    if (!contextFiber) throw new Error('runtime context fiber missing')
    fibers.set('runtimeContext', contextFiber)
    await hooks?.fiberCreated?.('runtimeContext', contextFiber)
    if (contextFiber.state !== FIBER_STATE.ACTIVE) throw new Error('runtime context fiber inactive')
    record({
      event: 'fiber',
      phase: 'runtimeContext',
      outcome: 'active',
      fiber: 'runtimeContext',
      state: contextFiber.state,
    })
    assertNotClosing()
    await load('sessionContextSource', sessionIdentitySource, {})
    const creator = createSessionContextCreator({
      initializer: contextAssembly.initializer,
      tenancy: sessionTenancy,
      clock,
      createRow: scope =>
        catalogStorage.atomic(unit =>
          unit.mutate(tx => seedHoldingTenant(tx, scope.session, scope.tenant)),
        ),
    })
    contextCreator = creator
    context.effect(() => () => creator.drain())
  }

  function openAdmission() {
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
  }
  async function start(): Promise<{ readonly confirmation: UpgradeConfirmation }> {
    try {
      const { prepared, logDeployment } = await prepareDeploymentStage()
      const storage = await openStorageStage(prepared)
      await load('clock', clockPlugin, {})
      await load('credentials', credentialsPlugin, prepared.credentials)
      await load('accountIdentity', accountIdentityPlugin, prepared.identity)
      await load('governance', organizationGovernancePlugin, prepared.governance)
      await load('registration', registrationPlugin, prepared.registration)
      const clock = await awaitClockReady()
      const confirmation = await confirmUpgrade(clock)
      await startDirectory(prepared)
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
      new ReplicaReader(context, { readIn: replica.readBoundReplicaIn })
      await load('lookup', localCredentialLookupPlugin, { mode: 'localCredentialOnly' })
      await startSessionTenancy()
      if (logStage) await openPhysicalLog(logDeployment)
      captureBusinessServices()
      if (logStage) await startLogicalLogDomain(logDeployment, storage, clock)
      openAdmission()
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
  async function bindToolSession(
    actor: AuthenticatedActor,
    session: unknown,
  ): Promise<ToolSessionBinding> {
    if (!logStage || !admit() || !sessionIngress)
      return { kind: 'rejected', reason: 'ownerStopped' }
    const parsed = parseOpaqueIdentifier(session, 'SessionRef'),
      tenant = parseTenantId(actor?.tenant)
    if (!isOk(parsed) || !isOk(tenant)) return { kind: 'rejected', reason: 'invalidInput' }
    const scope = Object.freeze({ session: parsed.ok, tenant: Object.freeze(tenant.ok) })
    const entered: string[] = []
    const grants = [
      {
        consumer: 'coordinator' as const,
        operations: [
          'run.advance',
          'session.log.coordinate',
          'context.read',
          'context.configure',
          'context.publish',
        ] satisfies AccessOperation[],
      },
      { consumer: 'model' as const, operations: ['context.read'] satisfies AccessOperation[] },
      {
        consumer: 'tool' as const,
        operations: [
          'tool.submit',
          'tool.read',
          'tool.stop',
          'tool.answer',
          'context.read',
          'environment.describe',
          'environment.acquire',
          'result.read',
        ] satisfies AccessOperation[],
      },
    ]
    const accesses: SessionAccess[] = []
    let completed = false
    try {
      for (const grant of grants) {
        const ingress = await sessionIngress.enter(
          actor,
          scope,
          grant.consumer,
          ['session'],
          grant.operations,
        )
        if (ingress.kind !== 'entered') return ingress
        entered.push(ingress.identity.binding)
        const issuer = trustedAccess.currentIssuer(ingress.identity)
        if ('unavailable' in issuer) return { kind: 'rejected', reason: 'unavailable' }
        const issued = await issuer.issue({ ...ingress.identity, operations: grant.operations })
        if (issued.kind !== 'issued') return issued
        accesses.push(issued.access)
      }
      const [control, model, tool] = accesses
      if (!control || !model || !tool) return { kind: 'rejected', reason: 'unavailable' }
      const reader = await context.runtimeContext.bind(tool, scope, 'tool')
      if (reader.kind !== 'bound') return { kind: 'rejected', reason: 'unavailable' }
      const content = await reader.reader.read(['session'])
      if (content.kind !== 'values' || content.values.length !== 1)
        return { kind: 'rejected', reason: 'unavailable' }
      const value = content.values[0]?.value
      if (!object(value) || value.session !== scope.session)
        return { kind: 'rejected', reason: 'unavailable' }
      const actualTenant = parseTenantId(value.tenant)
      if (!isOk(actualTenant) || !tenantIdEquals(actualTenant.ok, scope.tenant))
        return { kind: 'rejected', reason: 'unavailable' }
      completed = true
      return { kind: 'bound', scope, control, tool, model }
    } catch {
      return { kind: 'rejected', reason: 'unavailable' }
    } finally {
      if (!completed) for (const binding of entered) sessionIngress.revoke(binding)
    }
  }
  async function createToolSession(
    actor: AuthenticatedActor,
    session: unknown,
  ): Promise<ToolSessionBinding> {
    if (!logStage || !admit() || !contextCreator)
      return { kind: 'rejected', reason: 'ownerStopped' }
    const parsed = parseOpaqueIdentifier(session, 'SessionRef')
    if (!isOk(parsed) || !validateMessage('SessionRef', parsed.ok).valid)
      return { kind: 'rejected', reason: 'invalidInput' }
    try {
      const checked = await checkActor(actor)
      if (!('account' in checked)) return { kind: 'rejected', reason: 'notAuthorized' }
      const scope = { session: parsed.ok, tenant: checked.tenant }
      const prepared = await contextCreator.prepare(scope)
      if (prepared.kind === 'rejected') return prepared
      return await bindToolSession(checked, parsed.ok)
    } catch {
      return { kind: 'rejected', reason: 'unavailable' }
    }
  }
  function activateModelRequest(
    actor: AuthenticatedActor,
    diagnostics: Pick<DemoDiagnosticAssembly, 'local' | 'tenant'>,
    transportRetention: DemoTransportRetention,
  ): Promise<ScenarioResult<{ readonly activated: true }>> {
    if (stage !== 'modelRequest' || closing) return Promise.resolve({ failure: 'stageClosed' })
    if (activationTask !== undefined) {
      return activationInputs?.actor === actor &&
        activationInputs.local === diagnostics.local &&
        activationInputs.tenant === diagnostics.tenant &&
        activationInputs.transportRetention === transportRetention
        ? activationTask
        : Promise.resolve({ failure: 'identityMismatch' })
    }
    const task = (async (): Promise<ScenarioResult<{ readonly activated: true }>> => {
      await ready
      if (!admitIdentity()) return { failure: 'stageClosed' }
      const checked = await checkActor(actor)
      if (!('account' in checked)) return checked
      const local = diagnostics?.local
      const tenant = diagnostics?.tenant
      const diagnosticTenant =
        tenant?.scope?.kind === 'tenant' ? parseTenantId(tenant.scope.tenant) : undefined
      if (
        local?.scope?.kind !== 'local' ||
        diagnosticTenant === undefined ||
        !isOk(diagnosticTenant) ||
        !tenantIdEquals(diagnosticTenant.ok, checked.tenant)
      )
        return { failure: 'identityMismatch' }
      if (
        typeof local.collector?.record !== 'function' ||
        typeof tenant.collector?.emitter !== 'function' ||
        typeof transportRetention?.reserveReplacement !== 'function'
      )
        return { failure: 'stageClosed' }
      try {
        if (
          local.health().writeState !== 'open' ||
          tenant.health().writeState !== 'open' ||
          !transportRetention.health().accepting
        )
          return { failure: 'stageClosed' }
      } catch {
        return { failure: 'stageClosed' }
      }
      activationInputs = { actor, local, tenant, transportRetention }
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
          new EvaluationSupport(context, ports)
          await load('evaluationInputs', evaluationInputStorePlugin, {
            storeKey: inputSource.storeKey,
            deployedOfficial: [...inputSource.deployedOfficial],
          })
          const value: unknown = context.get(CURRENT_EVALUATION_INPUTS)
          if (!currentInputFace(value)) throw new Error('acceptance input service absent')
          currentInputs = value
          if (activeClock === undefined) throw new Error('acceptance clock absent')
          manifest = createAssemblyManifestStore(storage, {
            diagnostic: event =>
              record({ event: 'provider', phase: 'assemblyManifest', outcome: event.result }),
            diagnosticFailure: () => {
              diagnosticFailures += 1
            },
          })
          new BorrowedManifest(context, manifest)
          registryHistory = createRegistryHistoryReader({
            storage,
            storeKey: inputSource.storeKey,
            sessionTenancy,
            memberships: actualMemberships,
            manifestHistory: manifest,
            diagnostics: () =>
              record({ event: 'provider', phase: 'registryHistory', outcome: 'observed' }),
            onDiagnosticFailure: () => {
              diagnosticFailures += 1
            },
            monotonicNow: inputSource.monotonicNow,
          })
          fixedRootInput = createRegistryInputReader(inputSource)
          assetRegistry = createAssetRegistry({
            manifest,
            clock: activeClock,
            sessionTenancy,
            currentInputs,
            historicalBody: registryHistory,
            fixedRootInput,
            deployedMeta: inputSource.deployedOfficial
              .filter(entry => entry.meta)
              .map(entry => entry.capability),
            diagnostic: () =>
              record({ event: 'provider', phase: 'assetRegistry', outcome: 'observed' }),
            diagnosticFailure: () => {
              diagnosticFailures += 1
            },
            monotonicNow: inputSource.monotonicNow,
            conflictPolicy: { maxRetries: requestDeployment.registryPolicy.maxRetries },
            maxInFlight: requestDeployment.registryPolicy.maxInFlight,
          })
          new BorrowedAssetRegistry(context, assetRegistry)
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
          const association = Object.freeze({ executionId: `transport:${reservation.generation}` })
          const registryDiagnostics = Object.freeze({
            record(event: DiagnosticEvent) {
              return local.collector.record(event, local.scope, association)
            },
          })
          new TransportSupport(context, {
            retirementSchedule: transportConfiguration.retirement.schedule,
            ...(transportConfiguration.imagePreparation
              ? { imageCodec: transportConfiguration.imagePreparation.codec }
              : {}),
            onDiagnostic,
            registryDiagnostics,
          })
          new InputMeters(context, transportConfiguration.inputMeters)
          let committed = false
          try {
            if (options.developmentTransport === undefined) {
              await load('modelTransport', piAiTransportPlugin, {
                policy: transportConfiguration.policy,
                ...(transportConfiguration.imagePreparation
                  ? { imagePreparation: { policy: transportConfiguration.imagePreparation.policy } }
                  : {}),
                retirement: {
                  waitMilliseconds: transportConfiguration.retirement.waitMilliseconds,
                  force: transportConfiguration.retirement.force,
                },
              })
            } else {
              const developmentTransport = options.developmentTransport
              const ca = developmentTransport.tls?.ca
              const rawCa = ca === undefined ? [] : Array.isArray(ca) ? ca : [ca]
              const certificates = Object.freeze(
                rawCa.map(value => (typeof value === 'string' ? value : value.toString('utf8'))),
              )
              new TransportTls(context, { readCa: () => certificates })
              await load('modelTransport', controlledModelTransport, {
                baseUrl: developmentTransport.baseUrl ?? 'https://openrouter.ai/api/v1/',
                policy: transportConfiguration.policy,
                ...(transportConfiguration.imagePreparation
                  ? { imagePreparation: { policy: transportConfiguration.imagePreparation.policy } }
                  : {}),
                retirement: {
                  waitMilliseconds: transportConfiguration.retirement.waitMilliseconds,
                  force: transportConfiguration.retirement.force,
                },
              })
            }
            const provided: unknown = context.get(MODEL_TRANSPORT)
            if (!modelTransportFace(provided)) throw new Error('model transport service absent')
            transportService = provided
            reservation.commit(provided)
            committed = true
          } catch (error) {
            if (!committed) {
              let partial: unknown
              try {
                partial = context.get(MODEL_TRANSPORT)
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
            const fiber = context.plugin(modelContribution, {
              definition,
              meter: {
                modelId: meters[0].modelId,
                definitionRevision: meters[0].definitionRevision,
                implementation: meters[0].implementation,
                provider: meters[0].provider,
              },
              retirement: {
                waitMilliseconds: transportConfiguration.retirement.waitMilliseconds,
                force: transportConfiguration.retirement.force,
              },
            })
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
          function newId<B extends string>(label: string, brand: B) {
            const parsed = parseOpaqueIdentifier(`${label}-${randomUUID()}`, brand)
            if (!isOk(parsed)) throw new Error('model identity source invalid')
            return parsed.ok
          }
          if (storage === undefined) throw new Error('acceptance storage absent')
          const callPresence = createDemoCallPresence({
            executions: () => modelRuntime?.executionSource,
            settled: session => {
              const owner = sessionBorrows.get(session)?.owner.owner
              return (
                owner !== undefined &&
                'confirmed' in owner.opened() &&
                owner.unresolvedWrites().length === 0
              )
            },
            coldRecovered: ref => {
              const targets = coldStopped.get(ref.session)
              return targets === undefined ? undefined : { target: targets.get(ref.callId) ?? null }
            },
          })
          // Immutable deployment identifiers only; the created payload cannot cite a mutable path.
          const sourceVersions = Object.freeze({
            officialManifest: `ordinal:${config.officialManifest.ordinal}`,
            deployedOfficial: deployment.evaluationInputs.deployedOfficial
              .map(
                entry =>
                  `${entry.capability.category}/${entry.capability.name}${entry.meta ? '#meta' : ''}`,
              )
              .sort()
              .join(','),
          })
          const baseInputs: ModelRuntimeHostInputs = {
            callAccess: {
              async check() {
                return { unavailable: true }
              },
            },
            callPresence,
            sessions: {
              async bind() {
                return { failure: 'unavailable' }
              },
            },
            identities: {
              call: () => newId('call', 'ModelCallId'),
              response: () => newId('response', 'ResponseId'),
              message: () => newId('reply', 'MessageId'),
            },
            history: {
              call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
              failure: readDemoRunnerFailure,
              calibration:
                options.calibrationHistory ??
                ((prefix, messages, target) =>
                  readDemoCalibrationHistory(
                    prefix,
                    messages,
                    target,
                    controlledRuns.get(prefix.binding.session),
                    sessionLogBacking?.operations.ownerGeneration,
                  )),
              run:
                options.runHistory ??
                createToolDriverRunReader(sessionLogBacking!.operations.ownerGeneration),
            },
            recovery: {
              async authorize() {
                return { unavailable: true }
              },
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
                record({ event: 'operation', phase: 'recovery', outcome: 'entered' })
                return createDemoRecoveryScope(input.session, ready, {
                  executions: () => modelRuntime?.executionSource,
                  readyRows: recoveryReady,
                  admission: recoveryAdmission,
                  coldStopped,
                  onClosed: () =>
                    record({ event: 'operation', phase: 'recovery', outcome: 'closed' }),
                })
              },
            },
          }
          modelInputs = await createDemoModelInputs(context, baseInputs, {
            settlementContention: deployment.settlement.contention,
            settlementScheduler: deployment.settlement.scheduler,
            policy: {
              ...deployment.invocation,
              diagnostic: event =>
                'tenant' in event ? recordSettlement(event) : recordInvocationDiagnostic(event),
            },
            acknowledgementCleanup: deployment.acknowledgementCleanup,
            diagnosticCollector: tenant.collector,
            diagnostic: recordSettlement,
          })
          modelAssembly = await startModelRuntimeAssembly(context, {
            maxScopes: deployment.maxScopes,
            callReferences: deployment.callReferences,
            reservationWaitPolicy: {
              maxWaitersPerCall: jsonNumberSource(
                deployment.reservationWaitPolicy.maxWaitersPerCall,
              ),
              timeoutMs: jsonNumberSource(deployment.reservationWaitPolicy.timeoutMs),
            },
            tokenMargin: {
              multiplier: jsonNumberSource(deployment.tokenMargin.multiplier),
              reserveTokens: jsonNumberSource(deployment.tokenMargin.reserveTokens),
            },
          })
          await modelAssembly.ready
          modelRuntime = modelAssembly.owner()
          projectModel = (original, boundSession, recoveryAuthorization) => {
            // Capture identity values, then recheck the same subject at every admission point.
            const actor: AuthenticatedActor = Object.freeze({
              ...original,
              tenant: Object.freeze({ ...original.tenant }),
            })
            const inputsOwner = modelInputs
            if (!inputsOwner) throw new AcceptanceOperationDefect('modelInputs')
            return inputsOwner.caller(callerStopped => {
              const qualification = new AbortController()
              const revoked = AbortSignal.any([
                accessRevocation.signal,
                qualification.signal,
                callerStopped,
              ])
              const qualify = async (session: SessionRef) => {
                if (boundSession !== undefined && session !== boundSession)
                  return { failure: 'stageClosed' as const }
                const current = await sessionAccess(actor, session)
                if (
                  'step' in current &&
                  current.step === 'verify' &&
                  'failure' in current.result &&
                  current.result.failure === 'login-state-rejected'
                ) {
                  qualification.abort()
                }
                return current
              }
              const facts = modelRuntime?.facts
              if (!facts) throw new AcceptanceOperationDefect('modelRuntimeFacts')
              const access = createDemoCallAccess({
                async authorize(session) {
                  if (revoked.aborted || closing || recoveryAdmission.has(session))
                    return { unavailable: true }
                  const current = await qualify(session)
                  if ('borrow' in current) return { binding: current.borrow.binding }
                  return 'failure' in current &&
                    (current.failure === 'identityMismatch' ||
                      current.failure === 'membershipNotEffective')
                    ? { denied: true }
                    : { unavailable: true }
                },
                facts,
                revoked,
                diagnostic: outcome => record({ event: 'operation', phase: 'callAccess', outcome }),
              })
              const inputs: ModelRuntimeHostInputs = Object.freeze({
                callAccess: access,
                callPresence,
                identities: baseInputs.identities,
                history: baseInputs.history,
                sessions: Object.freeze({
                  async bind(
                    session: SessionRef,
                  ): ReturnType<ModelRuntimeHostInputs['sessions']['bind']> {
                    if (boundSession !== undefined && recoveryAdmission.has(session))
                      return { failure: 'unavailable' }
                    const access = await qualify(session)
                    if (revoked.aborted || !('borrow' in access)) return { failure: 'unavailable' }
                    if (
                      catalog === undefined ||
                      lookup === undefined ||
                      currentInputs === undefined
                    )
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
                      sourceVersions,
                      catalog,
                      credentials: lookup,
                      currentEvaluationInputs: currentInputs,
                      observers: observerAccess.access,
                      tools: requestDeployment?.assetRegistry ??
                        assetRegistry ?? {
                          async lookup() {
                            return { failure: 'unavailable' }
                          },
                        },
                    }
                    runtimeBindings.set(session, binding)
                    return { binding }
                  },
                }),
                recovery: Object.freeze({
                  async authorize(
                    input: Parameters<ModelRuntimeHostInputs['recovery']['authorize']>[0],
                  ) {
                    if (recoveryAuthorization !== undefined) return recoveryAuthorization(input)
                    const current = await qualify(input.session)
                    return !revoked.aborted && 'borrow' in current
                      ? { authorized: true as const }
                      : { unavailable: true as const }
                  },
                  enter: baseInputs.recovery.enter,
                }),
              })
              return inputs
            })
          }
          if (
            runnerHost === undefined ||
            manifest === undefined ||
            registryHistory === undefined ||
            sessionTenancy === undefined ||
            modelRuntime === undefined
          )
            throw new Error('runner service assembly prerequisites absent')
          if (config.tools && authorizedLogOwner)
            toolFacilities = createToolRunnerFacilities(authorizedLogOwner.operations)
          const host = createDemoRunnerServiceHost({
            runnerHost,
            model: actor => actorModel(actor),
            manifest,
            history: { read: registryHistory.read },
            sessionTenancy,
            authorize: async session => {
              const maintenance = toolMaintenance.getStore()
              if (maintenance) {
                if (
                  maintenance.session !== session ||
                  closing ||
                  !authorizedLogOwner ||
                  !sessionLogOwner ||
                  !sessionLogBacking ||
                  !toolFacilities
                )
                  return { unavailable: true }
                const prefix = await authorizedLogOwner.operations.readPrefix(
                  authorizedLogOwner.recovery,
                  maintenance,
                )
                if (prefix.kind !== 'prefix') return { unavailable: true }
                const log = sessionLogOwner,
                  generation = Object.freeze({
                    ownerGeneration: sessionLogBacking.operations.ownerGeneration,
                  })
                return {
                  binding: {
                    ...maintenance,
                    log,
                    generation,
                    currentGeneration: () =>
                      !closing &&
                      sessionLogOwner === log &&
                      sessionLogBacking?.operations.ownerGeneration === generation.ownerGeneration
                        ? generation
                        : null,
                  },
                  maintenance: {
                    scope: maintenance,
                    access: authorizedLogOwner.recovery,
                    external: (signal: AbortSignal) =>
                      toolFacilities!.external(
                        { scope: maintenance, coordinator: authorizedLogOwner!.recovery },
                        signal,
                      ),
                  },
                }
              }
              const actor = invocationActors.getStore()
              if (actor === undefined) return { unavailable: true }
              const access = await sessionAccess(actor, session)
              if (!('borrow' in access) || recoveryAdmission.has(access.borrow.binding.session))
                return { unavailable: true }

              return { actor: access.checked, binding: access.borrow.binding }
            },
            ...(options.runnerExternal === undefined ? {} : { external: options.runnerExternal }),
            ...(config.tools && authorizedLogOwner && toolFacilities
              ? {
                  actions: {
                    owner: authorizedLogOwner.operations,
                    authorization: context.sessionAccess,
                    async authorize(actor: AuthenticatedActor, session: string) {
                      const checked = await checkActor(actor)
                      if (!('account' in checked)) return { unavailable: true as const }
                      const existing = toolDrivers.get(session)
                      const binding =
                        existing?.actor.account === checked.account
                          ? existing.binding
                          : await bindToolSession(checked, session)
                      return binding.kind === 'bound'
                        ? {
                            scope: binding.scope,
                            coordinator: binding.control,
                            access: binding.control,
                            policy: { grants: demoToolGrants, runMode: 'auto_permission' as const },
                          }
                        : { unavailable: true as const }
                    },
                    async external(
                      actor: AuthenticatedActor,
                      request: import('@omne-harness-lite/loop-extension-runner').RunnerAnyDispatchRequest,
                      signal: AbortSignal,
                    ) {
                      const checked = await checkActor(actor)
                      if (!('account' in checked)) return { unavailable: true as const }
                      const existing = toolDrivers.get(request.manifest)
                      const binding =
                        existing?.actor.account === checked.account
                          ? existing.binding
                          : await bindToolSession(checked, request.manifest)
                      if (binding.kind !== 'bound' || !toolFacilities)
                        return { unavailable: true as const }
                      return toolFacilities.external(
                        {
                          scope: binding.scope,
                          coordinator: binding.control,
                        },
                        signal,
                      )
                    },
                  },
                }
              : {}),
            selectedRun: (session, run, attempt) => {
              const parsed = parseOpaqueIdentifier(session, 'SessionRef')
              if (!isOk(parsed)) return undefined
              const selected = controlledRuns.get(parsed.ok)
              return selected?.run === run &&
                ExactDecimal.from(selected.attempt).compare(ExactDecimal.from(attempt)) === 0
                ? selected
                : undefined
            },
            now: () => {
              if (activeClock === undefined) return { unavailable: true }
              const now = activeClock.now()
              return now === 'unavailable' ? { unavailable: true } : new Date(now).toISOString()
            },
          })
          new BorrowedRunnerHost(context, host)
          runnerServiceFiber = context.plugin(loopExtensionRunnerPlugin, {})
          await runnerServiceFiber
          if (runnerServiceFiber.state !== FIBER_STATE.ACTIVE)
            throw new Error('runner service not active')
          const runnerValue: unknown = context.get(LOOP_EXTENSION_RUNNER)
          if (!runnerServiceFace(runnerValue)) throw new Error('runner service face absent')
          runnerService = runnerValue
          if (config.tools) {
            if (!authorizedLogOwner) throw new Error('tool maintenance owner absent')
            await verifyToolRecoveryOwnership()
            toolAssembly = await installDemoTools({
              ctx: context,
              recovery: authorizedLogOwner.recovery,
              directory: config.tools.directory,
              config: config.tools.runtime,
              onStopping: () => {
                gateOpen = false
                runnerHost?.closeAdmission()
                contextCreator?.closeAdmission()
                contextAssembly?.closeAdmission()
                modelAssembly?.closeAdmission()
              },
            })
            await toolAssembly.ready
            await hooks?.toolProvidersInstalled?.({
              officialAdmission: toolAssembly.officialAdmission,
              admissionPublication: toolAssembly.admissionPublication,
              environments: toolAssembly.environments,
            })
            await recoverToolDeliveries()
          }
          new RetrySample(context, { sample: deployment.defaultRetry.sample })
          defaultRetryFiber = context.plugin(modelDefaultRetry, {
            policy: deployment.defaultRetry.policy,
          })
          await defaultRetryFiber
          if (defaultRetryFiber.state !== FIBER_STATE.ACTIVE)
            throw new Error('default retry contribution not active')
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
        if (!isOk(parsed) || !validateMessage('SessionRef', parsed.ok).valid)
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
  function observeLogRead(result: ReadResult): ReadResult {
    if ('failure' in result) record({ event: 'sessionLog', phase: 'read', outcome: result.failure })
    return result
  }
  async function readAuthorizedLog(
    actor: AuthenticatedActor,
    scope: SessionScope,
  ): Promise<ReadResult> {
    const ingressOwner = sessionIngress,
      logOwner = sessionLogOwner
    if (ingressOwner === undefined || logOwner === undefined) return { failure: 'unavailable' }
    const operations = ['session.log.coordinate'] satisfies AccessOperation[]
    const ingress = await ingressOwner.enter(actor, scope, 'coordinator', [], operations)
    if (ingress.kind !== 'entered') return { failure: 'unavailable' }
    try {
      const issuer = trustedAccess.currentIssuer(ingress.identity)
      if ('unavailable' in issuer) return { failure: 'unavailable' }
      const issued = await issuer.issue({ ...ingress.identity, operations })
      if (issued.kind !== 'issued') return { failure: 'unavailable' }
      try {
        const held = await logOwner.owner.borrow(issued.access, scope)
        if (held.kind !== 'borrowed') return { failure: 'unavailable' }
        try {
          return await held.log.readSince(scope.session, 0)
        } finally {
          await held.release()
        }
      } finally {
        issuer.revoke(issued.access)
      }
    } finally {
      ingressOwner.revoke(ingress.identity.binding)
    }
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
        if (!isOk(parsed) || !validateMessage('SessionRef', parsed.ok).valid)
          return { step: 'holdingTenant', result: { failure: 'invalidInput' } }
        if (recoveryAdmission.has(parsed.ok)) return { failure: 'stageClosed' }
        const held = await sessionTenancy.holdingTenant(parsed.ok)
        if ('failure' in held) return { step: 'holdingTenant', result: held }
        if (!tenantIdEquals(held.tenant, checked.tenant)) return { failure: 'identityMismatch' }
        return observeLogRead(
          await readAuthorizedLog(checked, { session: parsed.ok, tenant: held.tenant }),
        )
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
        if (!isOk(parsed) || !validateMessage('SessionRef', parsed.ok).valid)
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
        if (assetRegistry === undefined) throw new AcceptanceOperationDefect('assetRegistry')
        const evaluationRef = parseOpaqueIdentifier(`evaluation-${randomUUID()}`, 'EvaluationRef')
        if (!isOk(evaluationRef)) throw new AcceptanceOperationDefect('evaluationRef')
        const filled = await assetRegistry.fill(
          parsed.ok,
          evaluated.ok,
          evaluationRef.ok,
          evaluated.ok.composition,
        )
        if (!('snapshots' in filled)) return { step: 'assetRegistry', result: filled }
        return { prepared: true }
      } catch (error) {
        throw operationError(error, 'prepareModelInputs')
      }
    })
  }
  async function fixedJournalPrefix(
    log: NonNullable<typeof sessionLogOwner>,
    session: SessionRef,
    tenant: TenantId,
  ) {
    const current = await log.participant.source(journalRecovery, { session, tenant })
    if ('failure' in current) return { failure: 'unavailable' } as const
    const fixed = await log.participant.readPrefix(journalRecovery, current.source)
    return 'failure' in fixed
      ? ({ failure: 'unavailable' } as const)
      : { entries: fixed.entries, tail: fixed.source.tail, source: fixed.source }
  }
  async function ensureCallJournal(session: SessionRef, tenant: TenantId) {
    const issue = originalIssue
    if (closing || authorizedLogOwner === undefined || issue === undefined) return
    const held = await authorizedLogOwner.operations.borrow(journalRecovery, { session, tenant })
    if (held.kind !== 'borrowed') return
    await held.release()
    return issue
  }
  async function sessionAccess(actor: AuthenticatedActor, session: unknown) {
    const checked = await checkActor(actor)
    if (!('account' in checked)) return checked
    if (sessionTenancy === undefined || sessionLogOwner === undefined)
      throw new AcceptanceOperationDefect('modelRequest')
    const parsed = parseOpaqueIdentifier(session, 'SessionRef')
    if (!isOk(parsed) || !validateMessage('SessionRef', parsed.ok).valid)
      return { step: 'holdingTenant' as const, result: { failure: 'invalidInput' as const } }
    const held = await sessionTenancy.holdingTenant(parsed.ok)
    if ('failure' in held) return { step: 'holdingTenant' as const, result: held }
    if (!tenantIdEquals(held.tenant, checked.tenant))
      return { failure: 'identityMismatch' as const }
    const issue = await ensureCallJournal(parsed.ok, held.tenant)
    if (issue === undefined) return { failure: 'stageClosed' as const }
    let borrow = sessionBorrows.get(parsed.ok)
    if (borrow === undefined) {
      const generation = Object.freeze({})
      const log = sessionLogOwner
      const binding: SettlementLogBinding = {
        session: parsed.ok,
        tenant: held.tenant,
        log,
        readPrefix: () => fixedJournalPrefix(log, parsed.ok, held.tenant),
        originalIssue: issue,
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
  const controlledRunFixture: ControlledRunFixturePort = {
    startAttempt(actor, session, run, attempt) {
      if (stage !== 'modelRequest' || !admit()) return Promise.resolve({ failure: 'stageClosed' })
      return trackSessionInput(session, async () => {
        const access = await sessionAccess(actor, session)
        if (!('borrow' in access)) return access
        if (
          recoveryAdmission.has(access.borrow.binding.session) ||
          requestDeployment === undefined ||
          assetRegistry === undefined ||
          controlledRuns.has(access.borrow.binding.session) ||
          attempt !== 1 ||
          !('ok' in judgeAccountValue('RunId', run)) ||
          !('ok' in judgeAccountValue('AttemptId', attempt))
        )
          return { invalidInput: { reason: 'malformed' } } as const
        const { binding, owner } = access.borrow
        const acquired = owner.owner.acquire(
          requestDeployment.settlement.contention.limits.concurrent,
        )
        if ('unavailable' in acquired) return { unavailable: true } as const
        let retained = false
        try {
          const prefix = await readSettlementPrefix({
            binding,
            registration: acquired.registration,
          })
          if ('unavailable' in prefix) return { unavailable: true } as const
          const decoded = messagePrefix(
            prefix.prefix,
            undefined,
            sessionLogBacking?.operations.ownerGeneration,
          )
          if ('unavailable' in decoded) return { unavailable: true } as const
          const available = await assetRegistry.refreshAvailability(
            binding.session,
            { kind: 'start', runId: run },
            attempt,
          )
          if (!('report' in available)) return { unavailable: true } as const
          const now = activeClock?.now()
          if (now === undefined || now === 'unavailable') return { unavailable: true } as const
          const entry = {
            ok: {
              tenant: access.checked.tenant,
              run,
              attempt,
              dedupeKey: `session-attempt:${randomUUID()}`,
              readKeys: ['session-runtime/attempts'],
              payload: attemptStartedPayload({
                kind: 'attempt_started',
                run,
                attempt,
                reason: 'first',
                at: new Date(now).toISOString(),
              }),
            },
          }
          const task = acquired.registration.start('append', async () =>
            binding.log.append(
              binding.session,
              [entry.ok],
              { kind: 'fenced', run, attempt },
              { kind: 'tailEquals', tail: prefix.prefix.tail },
            ),
          )
          const receipt = await task.completion.catch(() => ({ failure: 'unavailable' as const }))
          await task.stopped
          if ('failure' in receipt) {
            if (receipt.failure === 'unavailable') retained = true
            return { unavailable: true } as const
          }
          const selection = Object.freeze({ run, attempt })
          controlledRuns.set(binding.session, selection)
          retained = true
          let released = false
          return {
            report: available.report,
            release() {
              if (released) return
              released = true
              acquired.registration.release()
            },
          }
        } finally {
          if (!retained) acquired.registration.release()
        }
      })
    },
  }
  options.controlledRunFixture?.(controlledRunFixture)
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
      projection: prefix =>
        historyProjection(
          prefix,
          controlledRuns.get(prefix.binding.session),
          sessionLogBacking?.operations.ownerGeneration,
        ),
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
      const projected = messagePrefix(
        prefix.prefix,
        controlledRuns.get(binding.session),
        sessionLogBacking?.operations.ownerGeneration,
      )
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
  ): Promise<ScenarioResult<{ readonly service: ModelRuntimeOperations }>> {
    if (stage !== 'modelRequest' || !admit()) return Promise.resolve({ failure: 'stageClosed' })
    return trackSessionInput(session, async () => {
      const access = await sessionAccess(actor, session)
      if (!('borrow' in access)) return access
      if (recoveryAdmission.has(access.borrow.binding.session)) return { failure: 'stageClosed' }
      if (modelRuntime === undefined) return { failure: 'stageClosed' }

      return { service: boundModelService(access.checked, access.borrow.binding.session) }
    })
  }
  function actorModel(
    actor: AuthenticatedActor,
    boundSession?: SessionRef,
    recoveryAuthorization?: ModelRuntimeHostInputs['recovery']['authorize'],
  ): ModelRuntimeOperations {
    if (projectModel === undefined) throw new AcceptanceOperationDefect('modelRuntime')
    return projectModel(actor, boundSession, recoveryAuthorization)
  }
  function boundModelService(
    actor: AuthenticatedActor,
    session: SessionRef,
  ): ModelRuntimeOperations {
    if (modelRuntime === undefined) throw new AcceptanceOperationDefect('modelRuntime')
    const service = actorModel(actor, session)
    function invoke<I, R>(input: I, operation: (value: I) => Promise<R>): Promise<R> {
      // The projected ports enforce this Session after each operation's own representation check.
      return trackSession(session, () => withInvocationActor(actor, () => operation(input)))
    }
    function scopedFailure<I extends { readonly session: SessionRef }, R>(
      operation: FailureConsumableOperation<I, R>,
      blocked?: (value: I) => Promise<R | undefined>,
    ): FailureConsumableOperation<I, R> {
      function call(input: I): Promise<R>
      function call(
        input: I,
        options: { readonly consumeFailure: true },
      ): Promise<FailureConsumption<R>>
      function call(
        input: I,
        options?: { readonly consumeFailure: true },
      ): Promise<R | FailureConsumption<R>> {
        return invoke(input, async value => {
          const validOptions =
            options === undefined ||
            (options?.consumeFailure === true && Object.keys(options).length === 1)
          const result = validOptions ? await blocked?.(value) : undefined
          if (result !== undefined)
            return options === undefined
              ? result
              : {
                  result,
                  consumption: { kind: 'notApplicable' as const },
                }
          return options === undefined ? operation(value) : operation(value, options)
        })
      }
      return call
    }
    return {
      acquireCall: input => invoke(input, value => service.acquireCall(value)),
      // ACK still obtains its own fresh access; a held reference never confirms permission.
      acknowledgeCall: input => invoke(input, value => service.acknowledgeCall(value)),
      legalTargets: input => invoke(input, value => service.legalTargets(value)),
      displayList: input => invoke(input, value => service.displayList(value)),
      effectiveModel: input => invoke(input, value => service.effectiveModel(value)),
      selectModel: input => invoke(input, value => service.selectModel(value)),
      openCall: input => {
        const owned = ownOpenCallInput(input)
        if ('invalidInput' in owned) return Promise.resolve(owned)
        return invoke(owned.request, async value => {
          if (value.session !== session) return { unavailable: true } as const
          const access = await sessionAccess(actor, session)
          if (!('borrow' in access) && !('failure' in access && access.failure === 'stageClosed'))
            return { unavailable: true } as const
          if (closing || recoveryAdmission.has(session)) return { runtimeStopped: true } as const
          if (!('borrow' in access)) return { unavailable: true } as const
          if (![...(callHosts.get(session) ?? [])].some(owner => owner.host === value.host))
            return { runtimeStopped: true } as const
          const result = await service.openCall(value)
          return result
        })
      },
      dispatch: scopedFailure(service.dispatch, async value => {
        if (
          !validDispatchInput(value) ||
          value.session !== session ||
          !(closing || recoveryAdmission.has(session))
        )
          return undefined
        const access = await sessionAccess(actor, session)
        return 'borrow' in access || ('failure' in access && access.failure === 'stageClosed')
          ? { runtimeStopped: true }
          : { unavailable: true }
      }),
      dispatchAgain: scopedFailure(service.dispatchAgain, async value => {
        if (
          !validDispatchInput(value) ||
          !('plan' in value) ||
          value.session !== session ||
          !(closing || recoveryAdmission.has(session))
        )
          return undefined
        const access = await sessionAccess(actor, session)
        return 'borrow' in access || ('failure' in access && access.failure === 'stageClosed')
          ? { runtimeStopped: true }
          : { unavailable: true }
      }),
      interrupt: input => invoke(input, value => service.interrupt(value)),
      releaseCall: input => invoke(input, value => service.releaseCall(value)),
      reconcile: async input => {
        const represented = parseOpaqueIdentifier(input?.session, 'SessionRef')
        if (!isOk(represented) || !validateMessage('SessionRef', represented.ok).valid)
          return { invalidInput: { reason: 'malformed' } }
        if (input.session !== session) return { unavailable: true }
        const result = await reconcileModelRuntime(actor, session)
        return 'calls' in result || 'invalidInput' in result ? result : { unavailable: true }
      },
      readAttempts: scopedFailure(service.readAttempts),
      settleReply: input => invoke(input, value => service.settleReply(value)),
      canDispatchAgain: input => invoke(input, value => service.canDispatchAgain(value)),
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
      const captures: ModelRuntimeExecutionCapture[] = []
      const captured = new Map<string, Set<AnchoredInvocationHandle>>()
      try {
        // Resolve only this Session's original message writer before stopping its calls.
        if (!(await closeRetainedSettlements(key))) return { unavailable: true }
        let ready = recoveryReady.get(key)
        if (ready === undefined) {
          const owners = callHosts.get(key)
          const cold = owners === undefined
          if (
            cold &&
            (runtimeBindings.has(key) || modelRuntime.executionSource.snapshot(key).length !== 0)
          )
            return { unavailable: true }
          for (const previous of owners ?? []) if (previous.released?.()) owners?.delete(previous)
          // Capture the original handle before stop may remove the container from the store.
          const beforeStop = modelRuntime.executionSource.capture(key)
          if ('unavailable' in beforeStop) return { unavailable: true }
          captures.push(beforeStop.capture)
          for (const [callId, handles] of captureExecutionInvocations(
            beforeStop.capture.executions,
          ))
            captured.set(callId, handles)
          // Stop active HTTP dispatch before draining admitted work: that work can be
          // waiting for the very abort which the host owns.
          const stopping = Promise.allSettled(
            [...(owners ?? [])].map(async owner => await owner.stop()),
          )
          await Promise.allSettled([...(sessionTasks.get(key) ?? [])])
          const stopped = await stopping
          await access.borrow.owner.drain()
          const warmBinding = runtimeBindings.get(key)
          const afterStop = modelRuntime.executionSource.capture(key)
          if ('unavailable' in afterStop) return { unavailable: true }
          captures.push(afterStop.capture)
          let executions = afterStop.capture.executions
          if (
            (!cold && warmBinding === undefined) ||
            (warmBinding !== undefined && warmBinding.log !== access.borrow.binding) ||
            access.borrow.binding.currentGeneration() !== access.borrow.binding.generation
          )
            return { unavailable: true }
          const ownedCalls = releasedExecutionCalls(
            executions,
            key,
            warmBinding,
            access.borrow.owner.owner,
          )
          if (
            ownedCalls === undefined ||
            stopped.some(result => result.status === 'rejected' || 'unavailable' in result.value)
          )
            return { unavailable: true }
          for (const [callId, handles] of captureExecutionInvocations(executions)) {
            const originals = captured.get(callId) ?? new Set<AnchoredInvocationHandle>()
            for (const handle of handles) originals.add(handle)
            captured.set(callId, originals)
          }
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
          for (const [callId, handles] of captured) {
            const history = interpretCallHistory({ prefix: prefix.prefix, callId })
            if (!('known' in history)) return { unavailable: true }
            const last = history.known.dispatches.at(-1)
            if (last === undefined || last.response !== null) continue
            const target: ModelLogSettlementTarget = {
              call: callId,
              dispatch: last.record.dispatch,
              response: last.record.response,
            }
            const handle = originalExecutionInvocation(handles, target)
            if (handle === undefined) return { unavailable: true }
            originals.set(callId, { target, handle })
          }
          ready = {
            binding: { log: access.borrow.binding },
            owner: access.borrow.owner,
            captures: [...captures],
            originals,
            coldTargets,
            coldAbsent: cold && options.coldRecovery?.covered === true,
            scopeIssued: false,
          }
          recoveryReady.set(key, ready)
          // The ready row is now the sole prepared holder. No raw preparation array
          // or handle Map may cross the asynchronous scope handoff.
          captured.clear()
          executions = []
          captures.length = 0
          if (ready.coldAbsent) coldStopped.set(key, coldTargets)
        } else {
          await Promise.allSettled([...(sessionTasks.get(key) ?? [])])
          await access.borrow.owner.drain()
        }
        // This task was admitted before closing. Recheck its subject and original
        // borrow without admitting new work or borrowing a replacement source.
        const authorizeRecovery: ModelRuntimeHostInputs['recovery']['authorize'] = async input => {
          if (
            input.session !== key ||
            !recoveryBusy.has(key) ||
            sessionBorrows.get(key) !== access.borrow ||
            access.borrow.binding.currentGeneration() !== access.borrow.binding.generation
          )
            return { unavailable: true }
          const checked = await checkActor(access.checked)
          if (!('account' in checked) || !tenantIdEquals(checked.tenant, access.checked.tenant))
            return { unavailable: true }
          const held = await sessionTenancy?.holdingTenant(key)
          return held !== undefined &&
            'tenant' in held &&
            tenantIdEquals(held.tenant, checked.tenant) &&
            recoveryBusy.has(key) &&
            sessionBorrows.get(key) === access.borrow &&
            access.borrow.binding.currentGeneration() === access.borrow.binding.generation
            ? { authorized: true }
            : { unavailable: true }
        }
        return await actorModel(access.checked, key, authorizeRecovery).reconcile({ session: key })
      } catch {
        return { unavailable: true }
      } finally {
        captured.clear()
        const prepared = recoveryReady.get(key)
        discardUnissuedRecovery(key, recoveryReady)
        // A successful enter hands these frames to the registered runtime scope.
        if (prepared?.scopeIssued !== true) for (const capture of captures) capture.release()
        captures.length = 0
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
        run:
          options.runHistory ??
          createToolDriverRunReader(sessionLogBacking!.operations.ownerGeneration),
        diagnostic: recordSettlement,
        retain: coordinator => {
          retainedSettlements.add(coordinator)
          retainedSettlementSessions.set(coordinator, access.borrow.binding.session)
        },
      })
    }
    return isOk(parsed) ? trackSession(parsed.ok, work) : track(work)
  }
  async function modelSelectionOperation<T>(
    actor: AuthenticatedActor,
    session: unknown,
    work: (service: ModelRuntimeOperations, session: SessionRef) => Promise<T>,
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
    request: OpenCallRun & {
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
    return withInvocationActor(actor, () =>
      run(async () => {
        const access = await sessionAccess(actor, session)
        if (!('borrow' in access)) return access
        const { borrow, checked } = access
        if (recoveryAdmission.has(borrow.binding.session)) return { failure: 'stageClosed' }
        const controlledRun = controlledRuns.get(borrow.binding.session)
        if (
          controlledRun !== undefined &&
          (request.run !== controlledRun.run ||
            request.attempt === undefined ||
            ExactDecimal.from(request.attempt).compare(ExactDecimal.from(controlledRun.attempt)) !==
              0)
        )
          return { invalidInput: { reason: 'malformed' } }
        if (
          ![...(callHosts.get(borrow.binding.session) ?? [])].some(
            owner => owner.host === request.host,
          )
        )
          return { failure: 'stageClosed' }
        if (modelRuntime === undefined) return { unavailable: true }
        if (tools.length !== 0 && requestDeployment?.assetRegistry === undefined)
          return { unavailable: true }

        const service = actorModel(checked)
        const effective = await service.effectiveModel({
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
        const opened = await service.openCall({
          creationKey: deriveCreationKey({
            session: borrow.binding.session,
            userMessage: copiedUser.id,
            ...(callId === undefined ? {} : { callId: callId.ok }),
            ...(request.run === undefined ? {} : { run: request.run, attempt: request.attempt }),
          }),
          session: borrow.binding.session,
          ...(callId === undefined ? {} : { callId: callId.ok }),
          target: effective.effectiveModel.routeName,
          basis: effective.effectiveModel,
          messages: appended.messages,
          parameters,
          tools,
          host: request.host,
          ...(request.observer === undefined ? {} : { observer: request.observer }),
          ...(request.run === undefined
            ? {}
            : { run: request.run, attempt: request.attempt, report: request.report }),
        })
        if (!('state' in opened) || (opened.state !== 'open' && opened.state !== 'resumable'))
          return opened
        const result = await service.dispatch({
          session: borrow.binding.session,
          callId: opened.callId,
          ...(request.run === undefined ? {} : { attempt: request.attempt }),
        })
        return { callId: opened.callId, result }
      }),
    )
  }
  async function toolDeliveryFor(scope: SessionScope) {
    if (!config.tools || !authorizedLogOwner || !runnerService) return
    const checked = await authorizedLogOwner.operations.readPrefix(
      authorizedLogOwner.recovery,
      scope,
    )
    if (checked.kind !== 'prefix') return
    const existing = toolDeliveries.get(scope.session)
    if (existing) return existing
    const journal = await createToolDeliveryJournal({
      owner: authorizedLogOwner.operations,
      recovery: authorizedLogOwner.recovery,
      scope,
    })
    if (journal.kind !== 'journal') return
    const maintenanceRunner = createToolMaintenanceRunner({
      scope,
      runner: runnerService,
      within: (ownedScope, task) => toolMaintenance.run(ownedScope, task),
    })
    const delivery = createToolDelivery({
      journal,
      recovery: authorizedLogOwner.recovery,
      results: context.toolResults,
      runner: () => maintenanceRunner,
      attempts: config.tools.runtime.tailRetry.attempts,
    })
    toolDeliveries.set(scope.session, delivery)
    return delivery
  }

  async function verifyToolRecoveryOwnership() {
    if (options.coldRecovery?.covered === true) return
    if (!authorizedLogOwner) throw new Error('tool recovery owner absent')
    const owned = await authorizedLogOwner.operations.enumerate(authorizedLogOwner.recovery)
    if (owned.kind !== 'sessions') throw new Error('tool recovery catalog unavailable')
    for (const { scope } of owned.sessions) {
      const prefix = await authorizedLogOwner.operations.readPrefix(
        authorizedLogOwner.recovery,
        scope,
      )
      if (prefix.kind !== 'prefix') throw new Error('tool recovery prefix unavailable')
      const tools = projectToolJournal(scope, prefix.prefix.entries)
      if ('invalid' in tools) throw new Error('tool recovery journal invalid')
      if ([...tools.executions.values()].some(execution => !execution.confirmed))
        throw new Error('original tool execution stop unverified')
    }
  }

  async function recoverToolDeliveries() {
    if (!authorizedLogOwner) throw new Error('tool recovery owner absent')
    const owned = await authorizedLogOwner.operations.enumerate(authorizedLogOwner.recovery)
    if (owned.kind !== 'sessions') throw new Error('tool recovery catalog unavailable')
    for (const { scope } of owned.sessions) {
      const prefix = await authorizedLogOwner.operations.readPrefix(
        authorizedLogOwner.recovery,
        scope,
      )
      if (prefix.kind !== 'prefix') throw new Error('tool recovery prefix unavailable')
      const tools = projectToolJournal(scope, prefix.prefix.entries)
      if ('invalid' in tools) throw new Error('tool recovery journal invalid')
      for (const [call, execution] of tools.executions) {
        if (!execution.terminal || execution.confirmed) continue
        const delivery = await toolDeliveryFor(scope)
        if (
          !delivery ||
          (await delivery.recover(call)).kind !== 'ready' ||
          (await delivery.confirm(call)).kind !== 'confirmed'
        )
          throw new Error('tool recovery delivery unfinished')
      }
    }
  }

  async function runToolTurn(
    actor: AuthenticatedActor,
    session: unknown,
    request: {
      readonly user: UserMessage
      readonly parameters: ModelRequestParameters
      readonly host: ModelCallHost
      readonly observer?: ModelObserverRequest
    },
    signal: AbortSignal,
  ): Promise<
    | { readonly kind: 'saved' | 'failed'; readonly response: ModelResponse }
    | { readonly kind: 'rejected'; readonly reason: string }
  > {
    const reject = (reason: string) => ({ kind: 'rejected', reason }) as const
    if (
      !config.tools ||
      !toolAssembly ||
      !runnerService ||
      !authorizedLogOwner ||
      !assetRegistry ||
      !manifest ||
      !modelRuntime ||
      !admit()
    )
      return reject('stageClosed')
    return withInvocationActor(actor, () =>
      trackSessionInput(session, async () => {
        const access = await sessionAccess(actor, session)
        if (!('borrow' in access)) return reject('notAuthorized')
        const { borrow, checked } = access
        if (recoveryAdmission.has(borrow.binding.session) || signal.aborted)
          return reject('cancelled')
        if (
          ![...(callHosts.get(borrow.binding.session) ?? [])].some(
            owner => owner.host === request.host,
          )
        )
          return reject('hostUnavailable')
        let owned = toolDrivers.get(borrow.binding.session)
        if (owned && owned.actor.account !== checked.account) return reject('notAuthorized')
        if (!owned) {
          const binding = await bindToolSession(checked, session)
          if (binding.kind !== 'bound') return reject(binding.reason)
          const journal = await createToolDriverJournal({
            owner: authorizedLogOwner!.operations,
            access: binding.control,
            recovery: authorizedLogOwner!.recovery,
            scope: binding.scope,
          })
          if (journal.kind !== 'journal') return reject('journalUnavailable')
          const delivery = await toolDeliveryFor(binding.scope)
          if (!delivery) {
            await journal.close()
            return reject('deliveryUnavailable')
          }
          const authority = {
            scope: binding.scope,
            coordinator: binding.control,
            access: binding.control,
            policy: { grants: demoToolGrants, runMode: 'auto_permission' as const },
          }
          const actions = createToolActionDriver({
            journal,
            owner: authorizedLogOwner!.operations,
            authorization: context.sessionAccess,
            authority,
            runner: runnerService!,
          })
          const driver = createToolTurnDriver({
            journal,
            authority,
            toolAccess: binding.tool,
            modelAccess: binding.model,
            assets: context.assetRegistry,
            manifest: manifest!,
            context: context.runtimeContext,
            runtime: context.toolRuntimeRegistry,
            actions,
            delivery,
            runner: runnerService!,
            now: () => {
              const value = activeClock?.now()
              return value === undefined || value === 'unavailable'
                ? 'unavailable'
                : new Date(value).toISOString()
            },
          })
          owned = {
            actor: checked,
            binding,
            driver,
            async close() {
              await journal.close()
            },
          }
          toolDrivers.set(borrow.binding.session, owned)
        }

        const model = actorModel(checked)
        const appended = await appendServiceMessage(
          borrow.binding,
          borrow.owner.owner,
          checked.tenant,
          request.user,
        )
        if (!('messages' in appended)) return reject('inputUnavailable')
        const inbound = encodeModelLogKey({ kind: 'message', message: request.user.id })
        if (!('ok' in inbound)) return reject('inputInvalid')
        const started = await owned.driver.beginRun(inbound.ok)
        if (started.kind !== 'started') return reject('runStart:' + started.reason)
        const adopted = await owned.driver.beginAttempt(started.run)
        if (adopted.kind !== 'started')
          return reject('attemptAdoption:' + ('step' in adopted ? adopted.step : adopted.reason))
        let creationKey = deriveCreationKey({
          session: borrow.binding.session,
          userMessage: request.user.id,
          run: adopted.run,
          attempt: adopted.attempt,
        })
        while (!signal.aborted && admit()) {
          const acquired = borrow.owner.owner.acquire(
            requestDeployment!.settlement.contention.limits.concurrent,
          )
          if ('unavailable' in acquired) return reject('historyAcquireUnavailable')
          let projected
          try {
            const prefix = await readSettlementPrefix({
              binding: borrow.binding,
              registration: acquired.registration,
            })
            if ('unavailable' in prefix) return reject('historyRead:' + prefix.reason)
            projected = messagePrefix(
              prefix.prefix,
              undefined,
              sessionLogBacking!.operations.ownerGeneration,
            )
          } finally {
            acquired.registration.release()
          }
          if ('unavailable' in projected) return reject('historyProjectionUnavailable')
          const effective = await model.effectiveModel({
            session: borrow.binding.session,
          })
          if (!('effectiveModel' in effective)) return reject('modelUnavailable')
          let observer: ModelObserverRequest | undefined
          let grant: { readonly revoke: () => Promise<RuntimeCloseResult> } | undefined
          if (request.observer) {
            const endpoint: ModelObserverEndpoint = {
              open: input => request.observer!.endpoint.open(input),
            }
            const original = observerAccess.grant({
              endpoint,
              session: borrow.binding.session,
              tenant: checked.tenant,
              current: () =>
                !closing && borrow.binding.currentGeneration() === borrow.binding.generation,
            })
            grant = {
              async revoke() {
                const result = await original.revoke()
                if ('released' in result) observerGrants.delete(grant!)
                return result
              },
            }
            observerGrants.add(grant)
            observer = { ...request.observer, endpoint }
          }
          const opened = await model.openCall({
            creationKey,
            session: borrow.binding.session,
            target: effective.effectiveModel.routeName,
            basis: effective.effectiveModel,
            messages: projected.messages,
            parameters: request.parameters,
            tools: adopted.tools,
            host: request.host,
            ...(observer ? { observer } : {}),
            run: adopted.run,
            attempt: adopted.attempt,
            report: adopted.report,
          })
          if (!('state' in opened) || (opened.state !== 'open' && opened.state !== 'resumable')) {
            await grant?.revoke()
            return reject(
              'callUnavailable:' +
                ('invalidInput' in opened
                  ? opened.invalidInput.reason
                  : Object.keys(opened).join(',')),
            )
          }
          const dispatched = await model.dispatch({
            session: borrow.binding.session,
            callId: opened.callId,
            attempt: adopted.attempt,
          })
          await grant?.revoke()
          if (!('replyPending' in dispatched)) {
            if ('settled' in dispatched && dispatched.settled.outcome === 'failed') {
              const key = encodeModelLogKey({ kind: 'response', response: dispatched.settled.id })
              if (!('ok' in key)) return reject('responseInvalid')
              const ended = await owned.driver.endRun(adopted.run, [key.ok], 'failed')
              return ended.kind === 'ended'
                ? { kind: 'failed' as const, response: dispatched.settled }
                : reject('runEndUnavailable')
            }
            return reject('modelReplyUnavailable')
          }
          const settled = await persistModelReply(checked, session, dispatched.replyPending)
          if (!('settled' in settled)) return reject('settlementUnavailable')
          const durableResponse = settled.settled.response.response
          if (!durableResponse || !('ok' in judgeModelResponse(durableResponse)))
            return reject('settlementUnavailable')
          const response = durableResponse as unknown as ModelResponse
          if (!response.reply) return reject('modelReplyUnavailable')
          const calls = response.reply.blocks.flatMap(block =>
            block.kind === 'tool_call' && block.complete ? [block] : [],
          )
          if (!calls.length) {
            const key = encodeModelLogKey({ kind: 'message', message: response.reply.id })
            if (!('ok' in key)) return reject('messageInvalid')
            const ended = await owned.driver.endRun(adopted.run, [key.ok])
            return ended.kind === 'ended'
              ? { kind: 'saved' as const, response }
              : reject('runEndUnavailable')
          }
          const origin = {
            run: adopted.run,
            attempt: adopted.attempt,
            assistantMessage: response.reply.id,
          }
          const executed = await owned.driver.execute(origin, signal)
          if (executed.kind !== 'returned')
            return reject('actions:' + ('reason' in executed ? executed.reason : 'unavailable'))
          const continuation = await owned.driver.continueModel(origin, signal)
          if (continuation.kind !== 'ready') return reject('continuation:' + continuation.reason)
          const parsedKey = parseOpaqueIdentifier(continuation.requestKey, 'CreationKey')
          if (!isOk(parsedKey)) return reject('continuationInvalid')
          creationKey = parsedKey.ok
        }
        return reject('cancelled')
      }),
    )
  }
  return {
    ready,
    createToolSession: (actor, session) =>
      closing
        ? Promise.resolve({ kind: 'rejected', reason: 'ownerStopped' })
        : trackSessionInput(session, () => createToolSession(actor, session)),
    bindToolSession: (actor, session) =>
      !admit()
        ? Promise.resolve({ kind: 'rejected', reason: 'ownerStopped' })
        : trackSessionInput(session, () => bindToolSession(actor, session)),
    dispatchRunner(actor, session, request, signal) {
      const service = runnerService
      if (stage !== 'modelRequest' || !admit() || service === undefined)
        return Promise.resolve({ failure: 'stageClosed' })
      if (request.manifest !== session) return Promise.resolve({ failure: 'identityMismatch' })
      return withInvocationActor(actor, () =>
        trackSessionInput(session, () => service.dispatch(request, signal)),
      )
    },
    replayRunner(actor, session, request) {
      const service = runnerService
      if (stage !== 'modelRequest' || !admit() || service === undefined)
        return Promise.resolve({ failure: 'stageClosed' })
      if (request.manifest !== session) return Promise.resolve({ failure: 'identityMismatch' })
      return withInvocationActor(actor, () =>
        trackSessionInput(session, () => service.replay(request)),
      )
    },
    runExtensionPass(actor, session, request) {
      if (!logStage || !admit() || runnerHost === undefined)
        return Promise.resolve({ failure: 'stageClosed' })
      return trackSessionInput(session, async () => {
        const access = await sessionAccess(actor, session)
        if (!('borrow' in access)) return access
        if (recoveryAdmission.has(access.borrow.binding.session) || runnerHost === undefined)
          return { failure: 'stageClosed' }
        return runnerHost.run(access.borrow.binding, request)
      })
    },
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
    runToolTurn,
    appendServiceToolResult,
    close() {
      if (closingPromise !== undefined) return closingPromise
      closing = true
      gateOpen = false
      runnerHost?.closeAdmission()
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
