// The current standing of a tenant's account in the tenant's organization (SPEC ID-16): the fact
// authorization reads before every admission. Identity owns membership and role facts; it answers
// with qualifications already resolved through the governance model, so a consumer never judges a
// role name.
import type { TenantId } from '@omne-harness/legal-identity'
import type { Qualification, RoleRef } from './qualification.ts'

/** Where the reading came from, for a later check: the identity record and its revision. */
export type StandingEvidence = Readonly<{ record: string; revision: string }>

export type TenantStandingReading =
  | Readonly<{
      kind: 'member'
      role: RoleRef
      qualifications: readonly Qualification[]
      evidence: StandingEvidence
    }>
  /** The account is not a member now, or the tenant is not known. The two are not told apart. */
  | Readonly<{ kind: 'not-member'; evidence: StandingEvidence }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * Reads the current standing. Every call reads the facts of now; a reading is not a permission
 * and is not kept as one. A source that cannot read answers `unavailable`, never `member`.
 */
export interface TenantStandingSource {
  read(input: Readonly<{ tenant: TenantId }>): Promise<TenantStandingReading>
}
