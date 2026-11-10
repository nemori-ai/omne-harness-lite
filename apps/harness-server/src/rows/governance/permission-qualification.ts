import type { GovernanceDefinitionRef } from '@omne-harness/governance-contract'
import type { PermissionConstraint } from '@omne-harness/permissions'
import type { SessionPermissionCurrent } from '@omne-harness/session-storage-sql/participants'

/** What the owner of the original action proved for one permission request. It grants nothing. */
export type QualifiedOrigin = Readonly<{
  configuration: 'mapped' | 'unmapped'
  principalRef: string
  definition: GovernanceDefinitionRef
  session: SessionPermissionCurrent
  /** The bound of the original Agent definition. Empty when the action has no Agent origin. */
  constraints: readonly PermissionConstraint[]
}>

export type PermissionQualification =
  | Readonly<{ kind: 'qualified'; origin: QualifiedOrigin }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; sourceRef: string }>
