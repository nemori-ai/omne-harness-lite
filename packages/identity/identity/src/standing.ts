import type { TenantId } from '@omne-harness/legal-identity'
import type { Qualification, RoleRef } from './qualification.ts'

export type StandingEvidence = Readonly<{ record: string; revision: string }>

export type TenantStandingReading =
  | Readonly<{
      kind: 'member'
      role: RoleRef
      qualifications: readonly Qualification[]
      evidence: StandingEvidence
    }>
  | Readonly<{ kind: 'not-member'; evidence: StandingEvidence }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface TenantStandingSource {
  read(input: Readonly<{ tenant: TenantId }>): Promise<TenantStandingReading>
}
