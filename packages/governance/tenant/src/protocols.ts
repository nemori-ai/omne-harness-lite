import type { GateFrame } from '@omne-harness-lite/admission'
import type { Principal } from '@omne-harness-lite/records'
import type { JsonValue, OpaqueId } from '@omne-harness-lite/work-data'
import type { MembershipBasis } from './index.js'

declare const authenticatedInvocationBrand: unique symbol

/**
 * Process-local invocation issued by the installed identity authority.
 * Consumers must ask that authority to recognize the exact object at the gate.
 */
export type AuthenticatedInvocation = Readonly<{
  [authenticatedInvocationBrand]: true
}>

export type IdentityInspection =
  | Readonly<{
      status: 'current'
      principal: Principal
      credentialRevision: OpaqueId
    }>
  | Readonly<{
      status: 'denied'
      code: 'invocation_not_recognized' | 'credential_revoked'
    }>
  | Readonly<{
      status: 'unavailable'
      code: string
    }>

/** The identity-owner surface consumed inside the synchronous admission gate. */
export type IdentitySource = Readonly<{
  inspectCurrent: (frame: GateFrame, invocation: AuthenticatedInvocation) => IdentityInspection
}>

export type TenantAccessRequest = Readonly<{
  invocation: AuthenticatedInvocation
  tenantId: OpaqueId
  operation: string
  target: JsonValue
}>

declare const tenantAccessCandidateBrand: unique symbol

/** Opaque, single-host preparation. A caller cannot construct a valid candidate. */
export type TenantAccessCandidate = Readonly<{
  [tenantAccessCandidateBrand]: true
}>

export type TenantAccessFailure =
  | Readonly<{
      status: 'denied'
      owner: 'tenant'
      code: string
    }>
  | Readonly<{
      status: 'unavailable'
      owner: 'tenant'
      code: string
    }>

export type TenantAccessPreparation =
  Readonly<{ status: 'prepared'; candidate: TenantAccessCandidate }> | TenantAccessFailure

export type TenantAccessBasis = Readonly<{
  principal: Principal
  credentialRevision: OpaqueId
  membership: MembershipBasis
}>

export type TenantAccessDecision =
  | Readonly<{ status: 'ready'; basis: TenantAccessBasis }>
  | Readonly<{ status: 'prepare_again' }>
  | TenantAccessFailure

/** Current tenant-membership and explicitly named management qualification. */
export type TenantAccess = Readonly<{
  prepareAccess: (request: TenantAccessRequest) => TenantAccessPreparation
  checkAccess: (frame: GateFrame, candidate: TenantAccessCandidate) => TenantAccessDecision
}>
