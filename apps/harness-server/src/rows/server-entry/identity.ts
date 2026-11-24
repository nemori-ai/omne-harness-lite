import type { Context } from '@deepseek-ai/cordis'
import type { AccessIdentity } from '@omne-harness/access-cordis-contract'
import type {
  GovernanceBasisUnavailable,
  IdentityGovernance,
  IdentityOperations,
  TenantStandingSource,
} from '@omne-harness/identity'
import {
  identityGovernanceKey,
  identityOperationsKey,
  tenantStandingKey,
} from '@omne-harness/identity/cordis'
import { createAccessIdentity, createMemberActing } from '@omne-harness/identity-access'

const MISSING = 'identity operations are not provided by the tree'
const GOVERNANCE_MISSING = 'identity governance is not provided by the tree'
const STANDING_MISSING = 'the tenant standing source is not provided by the tree'

export function accessIdentityOfCall(ctx: Context): ReturnType<typeof createAccessIdentity> {
  return createAccessIdentity({
    operations: identityOfCall(ctx),
    governance: governanceOfCall(ctx),
    issuer: ctx.principalIssuer,
  })
}

export function memberActingOfCall(
  ctx: Context,
  identity: Pick<AccessIdentity, 'actFor'> = accessIdentityOfCall(ctx),
): AccessIdentity['actFor'] {
  return createMemberActing({ identity, standing: standingOfCall(ctx) })
}

export function standingOfCall(ctx: Context): Pick<TenantStandingSource, 'read'> {
  return {
    async read(input) {
      const standing = ctx.get(tenantStandingKey)
      return standing === undefined
        ? { kind: 'unavailable', diagnostic: STANDING_MISSING }
        : standing.read(input)
    },
  }
}

export function identityOfCall(ctx: Context): IdentityOperations {
  const current = (): IdentityOperations | undefined => ctx.get(identityOperationsKey)
  return {
    async registerAndActivate(input) {
      const identity = current()
      if (identity === undefined) throw new Error(MISSING)
      return identity.registerAndActivate(input)
    },
    async issueLogin(input) {
      const identity = current()
      if (identity === undefined) return { kind: 'basis-unavailable', diagnostic: MISSING }
      return identity.issueLogin(input)
    },
    async recognizeLogin(input) {
      const identity = current()
      if (identity === undefined) return { kind: 'basis-unavailable', diagnostic: MISSING }
      return identity.recognizeLogin(input)
    },
  }
}

const ABSENT: GovernanceBasisUnavailable = Object.freeze({
  kind: 'basis-unavailable',
  diagnostic: GOVERNANCE_MISSING,
})

export function governanceOfCall(ctx: Context): IdentityGovernance {
  const current = (): IdentityGovernance | undefined => ctx.get(identityGovernanceKey)
  return {
    async createOrganization(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.createOrganization(input)
    },
    async readAccountPreference(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.readAccountPreference(input)
    },
    async writeAccountPreference(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.writeAccountPreference(input)
    },
    async queryCreateOrganization(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.queryCreateOrganization(input)
    },
    async issueMemberInvitation(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.issueMemberInvitation(input)
    },
    async acceptMemberInvitation(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.acceptMemberInvitation(input)
    },
    async rejectMemberInvitation(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.rejectMemberInvitation(input)
    },
    async withdrawMemberInvitation(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.withdrawMemberInvitation(input)
    },
    async queryInvitation(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.queryInvitation(input)
    },
    async queryReceivedInvitations(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.queryReceivedInvitations(input)
    },
    async queryIssuedInvitations(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.queryIssuedInvitations(input)
    },
    async queryOwnMemberships(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.queryOwnMemberships(input)
    },
    async queryOrganizationMembers(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.queryOrganizationMembers(input)
    },
    async leaveOrganization(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.leaveOrganization(input)
    },
    async removeMember(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.removeMember(input)
    },
    async changeMemberRole(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.changeMemberRole(input)
    },
    async switchCurrentTenant(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.switchCurrentTenant(input)
    },
    async queryCurrentTenant(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.queryCurrentTenant(input)
    },
    async revokeLogin(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.revokeLogin(input)
    },
    async queryOwnValidLogins(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.queryOwnValidLogins(input)
    },
    async reportBusinessAccess(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.reportBusinessAccess(input)
    },
  }
}
