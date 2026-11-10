import type {
  PermissionDefinition,
  PermissionDefinitionRef,
  PermissionRule,
} from '@omne-harness/permissions'
import type { TenantId } from '@omne-harness/legal-identity'
import type { DurableEvidence, SessionId, SessionOperationId } from './identity.ts'

export type SessionPermissionAssignment = Readonly<{
  capabilityId: string
  enforcementKey: string
  definition: PermissionDefinitionRef
  rule: PermissionRule
  source: DurableEvidence
}>

export type SessionPermissions = Readonly<{
  revision: string
  assignments: readonly SessionPermissionAssignment[]
}>

/** Transaction fact supplied by the protected writer, never accepted from a command's caller. */
export type SessionPermissionChangeBasis = Readonly<{
  operation: SessionOperationId
  commandDigest: string
  revision: string
  definition: PermissionDefinition | null
  authority: DurableEvidence
}>

/** Original-operation qualification from the trusted access service, before durable custody. */
export type SessionPermissionWriteQualification = Readonly<{
  tenant: TenantId
  session: SessionId
  operation: SessionOperationId
  commandDigest: string
  permissionRevision: string
  principalRef: string
  policy: DurableEvidence
}>
