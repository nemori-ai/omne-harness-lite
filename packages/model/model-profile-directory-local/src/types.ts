import { type OfficialManifest, type CredentialBinding, type ReadBoundReplicaIn, type DiagnosticSink } from '@omne-harness-lite/model-profile-directory'
import type { CredentialRef } from '@omne-harness-lite/asset-model'

import type { MembershipStandingResult, TenantId } from '@omne-harness-lite/identity-values'
import type { ProfileOrigin } from '@omne-harness-lite/model-profile'

import type { StorageUnit } from '@omne-harness-lite/storage'
export type ReadCredentialBindingIn = (
  unit: StorageUnit,
  tenant: TenantId,
) => Promise<{ readonly binding: CredentialBinding } | { readonly absent: true }>
export type FactoryCredential = () => Promise<
  { readonly body: Uint8Array } | { readonly absent: true } | { readonly failure: 'unavailable' }
>
export interface MembershipsRead {
  standing(
    tenant: TenantId,
  ): Promise<MembershipStandingResult | { readonly failure: 'invalidInput' }>
}
export interface ModelProfileDirectoryConfig {
  readonly faceMode: 'management' | 'singleProcessCatalog' | 'developmentBaseFaces'
  readonly officialManifest: OfficialManifest
  readonly factoryCredentialRef?: CredentialRef | undefined
}
export interface LocalCredentialLookupConfig {
  readonly mode: 'localCredentialOnly'
}
export type { ProfileOrigin }
