import type { Fiber } from '@deepseek-ai/cordis'
import type { AccountId, LoginStateId, TenantId } from '@omne-harness-lite/identity-values'
import type { AccountIdentityConfig } from '@omne-harness-lite/account-identity'
import type { CredentialRef } from '@omne-harness-lite/asset-model'
import type { AssetRegistryService } from '@omne-harness-lite/asset-registry'
import type { CredentialVerificationConfig } from '@omne-harness-lite/credential-verification'
import type { SessionRef } from '@omne-harness-lite/messages'
import type { ModelCatalog, OfficialManifest } from '@omne-harness-lite/model-profile-directory'
import type { OrganizationGovernanceConfig } from '@omne-harness-lite/organization-governance'
import type { ProcessOwnership, SessionLogPolicy } from '@omne-harness-lite/session-log-jsonl'
import type {DeployedOfficialEntry} from '@omne-harness-lite/evaluation-input-store'
import type { ModelInputSource, PublishSourceFailure, CaptureRecipeFailure } from './bootstrap.ts'
import type {TransportOptions} from '@omne-harness-lite/pi-ai-transport'
import type {ModelDefinition} from '@omne-harness-lite/model-request-runtime'
import type { RetirementPolicy } from '@omne-harness-lite/model-request-runtime'
import type {AcknowledgementCleanupPolicy, SettlementContention, SettlementScheduler, ReservationWaitPolicy, ModelCallContentPolicy, ObserverDiagnostic, SettlementDiagnostic, DefaultRetryConfiguration} from '@omne-harness-lite/model-request-runtime-local'
import type {InvocationPolicy} from '@omne-harness-lite/model-request-runtime'
import type { TokenMargin } from '@omne-harness-lite/model-request-runtime'
import type { HoldingTenantResult } from '@omne-harness-lite/session-tenancy'
import type { AtomicStorage, MigrationFragment } from '@omne-harness-lite/storage'
import type {
  UpgradeConfirmation,
  UpgradeGuard,
  UpgradePending,
} from '@omne-harness-lite/storage-sql'

export const BASE_FIBERS = Object.freeze([
  'storage',
  'clock',
  'credentials',
  'accountIdentity',
  'governance',
  'registration',
] as const)
export const STAGE_FIBERS = Object.freeze([...BASE_FIBERS, 'directory', 'lookup'] as const)
export const REQUEST_PREPARATION_FIBERS = Object.freeze([
  ...STAGE_FIBERS,
  'sessionTenancy',
] as const)
export const SESSION_LOG_FIBERS = Object.freeze([
  ...REQUEST_PREPARATION_FIBERS,
  'sessionLog',
] as const)
export const MODEL_REQUEST_FIBERS = Object.freeze([
  ...SESSION_LOG_FIBERS,
  'evaluationInputs',
  'modelTransport',
] as const)
export type AcceptanceStage =
  'authentication' | 'requestPreparation' | 'sessionLog' | 'modelRequest'
export type StageFiber = (typeof MODEL_REQUEST_FIBERS)[number]
export interface PreparedSession {
  readonly session: SessionRef
  readonly tenant: TenantId
}
export type StartupPhase =
  | 'prepare'
  | 'storage'
  | StageFiber
  | 'clockReady'
  | 'confirm'
  | 'replica'
  | 'transport'
  | 'admission'

export interface SessionLogDeployment {
  readonly dir: string
  readonly processOwnership: ProcessOwnership
  readonly policy: SessionLogPolicy
}
export type { ModelInputSource } from './bootstrap.ts'
export interface ModelRequestDeployment {
  /** Finite runtime-owned image preparation scopes; not an upstream model limit. */
  readonly maxScopes: number
  /** Explicit finite budgets for durable call references; the runtime supplies no defaults. */
  readonly callReferences: {
    /** Bounded number of Session log generations the call-fact projection keeps warm. */
    readonly maxScopes: number
    /** Immutable creation and reply-ready content rows in this demo's own SQLite storage. */
    readonly content: ModelCallContentPolicy
  }
  /**
   * Explicit schedule for retrying durable acknowledgement cleanup. The runtime supplies no
   * default; stopping a round never drops the durable responsibility.
   */
  readonly acknowledgementCleanup: AcknowledgementCleanupPolicy
  /** Borrowed trusted provider; its owner keeps it alive through application close. */
  readonly assetRegistry?: Pick<AssetRegistryService, 'lookup'>
  readonly tokenMargin: TokenMargin
  /** Explicit P-5 policy and replaceable sample source for this demonstration. */
  readonly defaultRetry: DefaultRetryConfiguration
  /** Bounded current-evaluation fill retries and concurrent operations. */
  readonly registryPolicy: { readonly maxRetries: number; readonly maxInFlight: number }
  readonly evaluationInputs: {
    readonly storeKey: string
    readonly deployedOfficial: readonly DeployedOfficialEntry[]
    readonly monotonicNow: () => bigint
    /** Trusted deployment preparation; never a tenant-controlled publishing callback. */
    readonly prepare: (actor: AuthenticatedActor, session: SessionRef) => Promise<ModelInputSource>
  }
  readonly transport: Pick<TransportOptions, 'definitions' | 'inputMeters' | 'policy'> & {
    readonly imagePreparation: NonNullable<TransportOptions['imagePreparation']>
    readonly retirement: RetirementPolicy
  }
  readonly invocation: Pick<
    InvocationPolicy,
    | 'now'
    | 'schedule'
    | 'statusCauseTable'
    | 'credentialRedaction'
    | 'firstContentTimeoutMs'
    | 'idleContentTimeoutMs'
  >
  readonly reservationWaitPolicy: ReservationWaitPolicy
  readonly settlement: {
    readonly contention: SettlementContention
    readonly scheduler: SettlementScheduler
  }
}
export interface AcceptanceConfig {
  readonly modelRequest?: ModelRequestDeployment
  readonly sessionLog?: SessionLogDeployment
  readonly runId: string
  readonly databaseFile: string
  readonly keys: {
    readonly activationSigning: string
    readonly activationVerification: string
    readonly purgeSigning: string
    readonly purgeVerification: string
    readonly modelReplica: string
  }
  readonly credentials: CredentialVerificationConfig
  readonly identity: Pick<AccountIdentityConfig, 'credentialPolicy' | 'unactivatedRetention'>
  readonly governance: Omit<OrganizationGovernanceConfig, 'purgeSigningKeyPem'>
  readonly officialManifest: OfficialManifest
  readonly wait: {
    readonly clockTimeoutMs: number
    readonly pollMs: number
    readonly monotonicNow: () => number
    readonly sleep: (ms: number) => Promise<void>
  }
}
export interface AcceptanceEvent {
  readonly runId: string
  readonly event:
    | 'stage'
    | 'fiber'
    | 'confirm'
    | 'gate'
    | 'operation'
    | 'directory'
    | 'sessionLog'
    | 'evaluationInputs'
    | 'transport'
    | 'replica'
    | 'provider'
    | 'close'
  readonly phase: string
  readonly outcome: string
  readonly fiber?: StageFiber
  readonly state?: number
  readonly confirmation?: UpgradeConfirmation
  readonly tenant?: TenantId
  readonly sourceMatch?: boolean
  /** Correlation-only projections from the runtime's typed diagnostic sources. */
  readonly settlement?: SettlementDiagnostic
  readonly observer?: ObserverDiagnostic
}
export interface AcceptanceDiagnostics {
  record(event: AcceptanceEvent): void
}
/** Trusted test controls, never supplied by a tenant or a model profile. */
export interface AcceptanceHooks {
  readonly extraMigrations?: readonly MigrationFragment[]
  readonly storageOpened?: (storage: AtomicStorage, guard: UpgradeGuard) => void | Promise<void>
  readonly fiberCreated?: (name: StageFiber, fiber: Fiber) => void | Promise<void>
  readonly modelContributionCreated?: (
    definition: ModelDefinition,
    fiber: Fiber,
  ) => void | Promise<void>
  readonly beforeConfirm?: (guard: UpgradeGuard) => void | Promise<void>
  readonly afterConfirm?: () => void | Promise<void>
  readonly beforeReplica?: () => void | Promise<void>
  readonly beforeLookup?: () => void | Promise<void>
  readonly beforeStore?: (actor: AuthenticatedActor) => void | Promise<void>
  readonly beforeIdentityStep?: (
    step: 'issue' | 'exchange' | 'currentTenant' | 'bind' | 'store',
  ) => void | Promise<void>
}
export interface AuthenticatedActor {
  readonly account: AccountId
  readonly loginState: LoginStateId
  readonly tenant: TenantId
}
export interface CredentialSourcePair {
  readonly account: AccountId
  readonly tenant: TenantId
  readonly sourceRef: CredentialRef
  readonly body: Uint8Array
}
export type CredentialSource = (actor: AuthenticatedActor) => Promise<CredentialSourcePair>
export interface StageRejection {
  readonly failure:
    'stageClosed' | 'identityMismatch' | 'sourceScopeMismatch' | 'membershipNotEffective'
}
interface AuthenticationProviderRejection {
  readonly step:
    'issue' | 'exchange' | 'verify' | 'currentTenant' | 'standing' | 'bind' | 'store' | 'lookup'
  readonly result: { readonly failure: string }
}
export type ProviderRejection =
  | AuthenticationProviderRejection
  | {
      readonly step: 'listProfiles'
      readonly result: Extract<
        Awaited<ReturnType<ModelCatalog['listProfiles']>>,
        { readonly failure: string }
      >
    }
  | {
      readonly step: 'publishLocalInputs'
      readonly result: PublishSourceFailure
    }
  | {
      readonly step: 'captureSessionRecipe'
      readonly result: CaptureRecipeFailure
    }
  | {
      readonly step: 'currentInputs'
      readonly result: Extract<
        import('@omne-harness-lite/asset-evaluation').CurrentInputResult,
        { readonly failure: string }
      >
    }
  | {
      readonly step: 'evaluate'
      readonly result: Exclude<
        import('@omne-harness-lite/asset-evaluation').EvaluationResult,
        { readonly ok: unknown }
      >
    }
  | {
      readonly step: 'assetRegistry'
      readonly result: import('@omne-harness-lite/asset-registry').RegistryFailure
    }
  | {
      readonly step: 'holdingTenant'
      readonly result: Extract<HoldingTenantResult, { readonly failure: string }>
    }
export type ScenarioResult<T> = T | StageRejection | ProviderRejection
export interface CloseResult {
  readonly complete: boolean
  readonly unfinished: readonly string[]
  readonly pending: UpgradePending
}
