import type { Fiber } from '@deepseek-ai/cordis'
import type { AccountId, LoginStateId, TenantId } from '@omne-harness-lite/identity-values'
import type { AccountIdentityConfig } from '@omne-harness-lite/account-identity'
import type { CredentialRef } from '@omne-harness-lite/asset-model'
import type { CredentialVerificationConfig } from '@omne-harness-lite/credential-verification'
import type { OfficialManifest } from '@omne-harness-lite/model-profile-directory'
import type { OrganizationGovernanceConfig } from '@omne-harness-lite/organization-governance'
import type { AtomicStorage, MigrationFragment } from '@omne-harness-lite/storage'
import type {
  UpgradeConfirmation,
  UpgradeGuard,
  UpgradePending,
} from '@omne-harness-lite/storage-sql'

export const BASE_FIBERS = [
  'storage',
  'clock',
  'credentials',
  'accountIdentity',
  'governance',
  'registration',
] as const
export const STAGE_FIBERS = [...BASE_FIBERS, 'directory', 'lookup'] as const
export type StageFiber = (typeof STAGE_FIBERS)[number]
export type StartupPhase =
  'prepare' | 'storage' | StageFiber | 'clockReady' | 'confirm' | 'replica' | 'admission'

export interface AcceptanceConfig {
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
}
export interface AcceptanceDiagnostics {
  record(event: AcceptanceEvent): void
}
/** Trusted test controls, never supplied by a tenant or a model profile. */
export interface AcceptanceHooks {
  readonly extraMigrations?: readonly MigrationFragment[]
  readonly storageOpened?: (storage: AtomicStorage, guard: UpgradeGuard) => void | Promise<void>
  readonly fiberCreated?: (name: StageFiber, fiber: Fiber) => void | Promise<void>
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
export interface ProviderRejection {
  readonly step:
    'issue' | 'exchange' | 'verify' | 'currentTenant' | 'standing' | 'bind' | 'store' | 'lookup'
  readonly result: { readonly failure: string }
}
export type ScenarioResult<T> = T | StageRejection | ProviderRejection
export interface CloseResult {
  readonly complete: boolean
  readonly unfinished: readonly string[]
  readonly pending: UpgradePending
}
