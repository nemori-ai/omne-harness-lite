import type { Counter } from '@omne-harness-lite/records'
import type { DefinitionRef, MembershipRef, OpaqueId } from '@omne-harness-lite/work-data'

export type VersionSet = {
  readonly definition: DefinitionRef
  readonly versions: readonly OpaqueId[]
}

export type Instant = string

export type Validity = {
  readonly notBefore: Instant
  readonly expiresAt: Instant | null
}

export type MembershipBasis = {
  readonly member: MembershipRef
  readonly joinedRevision: Counter
  readonly observedRevision: Counter
}

export type EvidenceRef = {
  readonly authority: string
  readonly kind: string
  readonly id: OpaqueId
  readonly revision: OpaqueId
}

export type Conditions = {
  readonly validity: Validity
  readonly membership: readonly MembershipBasis[]
  readonly requiredFacts: readonly EvidenceRef[]
}

export type {
  AuthenticatedInvocation,
  IdentityInspection,
  IdentitySource,
  TenantAccess,
  TenantAccessBasis,
  TenantAccessCandidate,
  TenantAccessDecision,
  TenantAccessFailure,
  TenantAccessPreparation,
  TenantAccessRequest,
} from './protocols.js'

export {
  decodeTenantRecord,
  foldBootstrapRecords,
  foldPersonalClaims,
  foldTenantRecords,
} from './records.js'
export type {
  BootstrapEstablished,
  Member,
  MemberRole,
  MemberState,
  PersonalTenantClaim,
  Tenant,
  TenantFoldState,
  TenantKind,
  TenantRecordEvent,
} from './records.js'
