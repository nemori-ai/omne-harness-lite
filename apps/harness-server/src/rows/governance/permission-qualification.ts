import type { GovernanceDefinitionRef } from '@omne-harness/governance-contract'
import type { PermissionConstraint } from '@omne-harness/permissions'
import type { AuthorizationConsumer } from '@omne-harness/session-contract'
import type {
  SessionAuthorizations,
  SessionPermissionCurrent,
} from '@omne-harness/session-storage-sql/participants'

export type QualifiedOrigin = Readonly<{
  configuration: 'mapped' | 'unmapped'
  principalRef: string
  definition: GovernanceDefinitionRef
  session: SessionPermissionCurrent
  /** Where the action is taken, as its original owner recognizes it: the Agent's action. */
  consumer: AuthorizationConsumer | null
  /** Read with the session row for that place; never part of the permission basis. */
  authorizations: SessionAuthorizations
  constraints: readonly PermissionConstraint[]
}>

export type PermissionQualification =
  | Readonly<{ kind: 'qualified'; origin: QualifiedOrigin }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; sourceRef: string }>
