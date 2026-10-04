import type { CredentialRef } from '@omne-harness-lite/asset-model'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { ScopeLayerIdentity, TenantId } from '@omne-harness-lite/identity-values'
import type { ModelProfile, ModelProfileContent, ModelProfileRef, ModelProfileRejection } from '@omne-harness-lite/model-profile'
import type { Instant } from '@omne-harness-lite/offer-expiry'
import type { StorageUnit } from '@omne-harness-lite/storage'


export interface ProfileRow {
  readonly ref: ModelProfileRef
  readonly profile: ModelProfile
}
export type CatalogScope = ScopeLayerIdentity | { readonly layer: 'factory' }
export type InvalidInput = {
  readonly failure: 'invalidInput'
  readonly reason: ModelProfileRejection | 'origin_not_custom'
}
export type Failure<F extends string> = InvalidInput | { readonly failure: F }
export type Result<T, F extends string> = T | Failure<F>
export type ProfilePatch = {
  readonly replace?: Partial<Omit<ModelProfileContent, 'origin' | 'routeName'>>
  readonly remove?: readonly ['parameters']
}
export interface OfficialManifest {
  readonly ordinal: JsonNumber
  readonly entries: readonly ModelProfileContent[]
}
export interface ManifestEntryDisposition {
  readonly ref: ModelProfileRef
  readonly disposition: 'added' | 'updated' | 'unchanged' | 'withdrawn' | 'relisted'
}
export interface ManifestResult {
  readonly ordinal: JsonNumber
  readonly dispositions: readonly ManifestEntryDisposition[]
}
export type CredentialPresent =
  | { readonly present: false }
  | { readonly present: true; readonly scope: { readonly layer: 'factory' } }
  | {
      readonly present: true
      readonly scope: { readonly layer: 'tenant'; readonly tenant: TenantId }
      readonly boundAt: Instant
    }
export interface CredentialValue {
  readonly scope:
    { readonly layer: 'tenant'; readonly tenant: TenantId } | { readonly layer: 'factory' }
  readonly value: Uint8Array
}
export interface CredentialBinding {
  readonly credentialRef: CredentialRef
  readonly boundAt: Instant
}
export type ReadBoundReplicaIn = (
  unit: StorageUnit,
  tenant: TenantId,
  expectedRef: CredentialRef,
) => Promise<{ readonly body: Uint8Array } | { readonly absent: true }>
export interface ModelCatalogRead {
  readProfile(
    scopeChain: unknown,
    ref: unknown,
  ): Promise<Result<ProfileRow, 'notAuthorized' | 'unavailable' | 'profileNotFound'>>
  listProfiles(scopeChain: unknown): Promise<Result<readonly ProfileRow[], 'unavailable'>>
  credentialPresent(
    tenant: unknown,
    origin: unknown,
  ): Promise<Result<CredentialPresent, 'unavailable'>>
}
export interface ModelCatalog extends ModelCatalogRead {
  registerProfile(
    initiator: unknown,
    scope: unknown,
    content: unknown,
  ): Promise<Result<ProfileRow, 'notAuthorized' | 'unavailable' | 'routeNameTaken'>>
  updateProfile(
    initiator: unknown,
    ref: unknown,
    patch: unknown,
  ): Promise<
    Result<
      ProfileRow,
      'officialProfileReadOnly' | 'notAuthorized' | 'unavailable' | 'profileNotFound'
    >
  >
  withdrawProfile(
    initiator: unknown,
    ref: unknown,
  ): Promise<
    Result<
      { readonly ref: ModelProfileRef; readonly registration: 'withdrawn' },
      'officialProfileReadOnly' | 'notAuthorized' | 'unavailable' | 'profileNotFound'
    >
  >
  relistProfile(
    initiator: unknown,
    ref: unknown,
  ): Promise<
    Result<
      { readonly ref: ModelProfileRef; readonly registration: 'listed' },
      'officialProfileReadOnly' | 'notAuthorized' | 'unavailable' | 'profileNotFound'
    >
  >
  bindCredential(
    initiator: unknown,
    tenant: unknown,
    credential: unknown,
  ): Promise<
    Result<
      { readonly tenant: TenantId; readonly boundAt: Instant },
      'notAuthorized' | 'unavailable'
    >
  >
  unbindCredential(
    initiator: unknown,
    tenant: unknown,
  ): Promise<
    Result<{ readonly tenant: TenantId; readonly present: false }, 'notAuthorized' | 'unavailable'>
  >
}
export interface CredentialLookup {
  value(
    tenant: unknown,
    origin: unknown,
  ): Promise<Result<CredentialValue, 'unavailable' | 'credentialUnavailable'>>
}
export interface DirectoryDiagnostic {
  readonly operation: string
  readonly phase: 'start' | 'finish' | 'error' | 'notification' | 'close'
  readonly outcome?: string
}
export interface DiagnosticSink {
  record(event: DirectoryDiagnostic): void
}
