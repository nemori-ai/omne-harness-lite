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
