import type { GovernanceDefinitionRef } from '@omne-harness/governance-contract'
import type { PermissionConstraint } from '@omne-harness/permissions'
import type { SessionPermissionCurrent } from '@omne-harness/session-storage-sql/participants'

export type QualifiedOrigin = Readonly<{
  configuration: 'mapped' | 'unmapped'
  principalRef: string
  definition: GovernanceDefinitionRef
  session: SessionPermissionCurrent
  constraints: readonly PermissionConstraint[]
}>

export type PermissionQualification =
  | Readonly<{ kind: 'qualified'; origin: QualifiedOrigin }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; sourceRef: string }>
