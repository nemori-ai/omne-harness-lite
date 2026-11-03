// The identity ports of the row, taken from the tree on every call. The assembly page lists
// `identityOperations` and `identityGovernance` as names the row reads per call, not names it
// injects, so a reloaded identity provider is seen by the next request and a missing one never
// blocks the row. Both names come from the one `identity` row, over one set of identity-sql
// records: a revocation or a switch through the governance port is what `recognizeLogin` reads.
import type { Context } from '@deepseek-ai/cordis'
import type {
  GovernanceBasisUnavailable,
  IdentityGovernance,
  IdentityOperations,
} from '@omne-harness/identity'
import { identityGovernanceKey, identityOperationsKey } from '@omne-harness/identity/cordis'

const MISSING = 'identity operations are not provided by the tree'
const GOVERNANCE_MISSING = 'identity governance is not provided by the tree'

export function identityOfCall(ctx: Context): IdentityOperations {
  const current = (): IdentityOperations | undefined => ctx.get(identityOperationsKey)
  return {
    async registerAndActivate(input) {
      const identity = current()
      // The operation has no "unavailable" outcome. The entry answers an empty 500 for a throw.
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

/**
 * The governance port read on every call. With the service absent every method answers
 * `basis-unavailable`: nothing was committed, so the answer holds (ID-18), and no method throws.
 */
export function governanceOfCall(ctx: Context): IdentityGovernance {
  const current = (): IdentityGovernance | undefined => ctx.get(identityGovernanceKey)
  return {
    async createOrganization(input) {
      const governance = current()
      return governance === undefined ? ABSENT : governance.createOrganization(input)
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
