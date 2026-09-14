import type { MembershipRef } from '@omne-harness-lite/work-data'
import type { MembershipBasis } from './index.js'
import type { Member, Tenant, TenantFoldState } from './records.js'

export type TenantManagementQualification =
  | Readonly<{ status: 'ready'; membership: MembershipBasis }>
  | Readonly<{
      status: 'denied'
      code: 'membership_not_current' | 'membership_not_authorized' | 'qualification_not_durable'
    }>
  | Readonly<{ status: 'unavailable'; code: 'operation_not_supported' | 'authority_state_invalid' }>

const SUPPORTED_MANAGEMENT_OPERATIONS = new Set(['tenant.members'])

function currentMember(tenant: Tenant, identity: MembershipRef): Member | undefined {
  if (tenant.tenantId !== identity.tenantId) return undefined
  return tenant.members.find(entry => entry.member.userId === identity.userId)
}

function grantsManagement(tenant: Tenant, member: Member, operation: string): boolean {
  if (member.state !== 'active') return false
  if (tenant.kind === 'personal' && member.role === 'owner') return true
  if (tenant.kind === 'organization' && member.role === 'super_admin') return true
  return member.delegatedOperations.includes(operation)
}

function denied(
  code: 'membership_not_current' | 'membership_not_authorized' | 'qualification_not_durable',
): TenantManagementQualification {
  return Object.freeze({ status: 'denied', code })
}

/**
 * Evaluate one named TG management operation against the durable root and every newer pending
 * root. A pending positive change cannot supply the returned basis, while every pending
 * restriction remains effective until the whole prefix reaches durability.
 */
export function qualifyTenantManagement(
  durable: TenantFoldState,
  pending: readonly TenantFoldState[],
  identity: MembershipRef,
  operation: string,
): TenantManagementQualification {
  if (!SUPPORTED_MANAGEMENT_OPERATIONS.has(operation)) {
    return Object.freeze({ status: 'unavailable', code: 'operation_not_supported' })
  }
  const durableMember = currentMember(durable.tenant, identity)
  if (durableMember === undefined || durableMember.state !== 'active') {
    return denied('membership_not_current')
  }
  if (!grantsManagement(durable.tenant, durableMember, operation)) {
    return denied('qualification_not_durable')
  }

  for (const root of pending) {
    if (root.tenant.tenantId !== durable.tenant.tenantId) {
      return Object.freeze({ status: 'unavailable', code: 'authority_state_invalid' })
    }
    const candidate = currentMember(root.tenant, identity)
    if (
      candidate === undefined ||
      candidate.state !== 'active' ||
      candidate.joinedRevision !== durableMember.joinedRevision
    ) {
      return denied('membership_not_current')
    }
    if (!grantsManagement(root.tenant, candidate, operation)) {
      return denied('membership_not_authorized')
    }
  }

  const membership: MembershipBasis = Object.freeze({
    member: Object.freeze({
      tenantId: durableMember.member.tenantId,
      userId: durableMember.member.userId,
    }),
    joinedRevision: durableMember.joinedRevision,
    observedRevision: durableMember.revision,
  })
  return Object.freeze({ status: 'ready', membership })
}
