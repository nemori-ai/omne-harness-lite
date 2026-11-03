import { Context } from '@deepseek-ai/cordis'
import type { IdentityGovernance } from '@omne-harness/identity'
import {
  IdentityGovernanceService,
  IdentityOperationsService,
  identityGovernanceKey,
  identityOperationsKey,
} from '@omne-harness/identity/cordis'
import {
  inProcessIdentity,
  inProcessIdentityOperations,
  type IdentityContractProviderOptions,
  type IdentityGovernanceContractProviderOptions,
} from '@omne-harness/identity/testing'

export async function installOperations(options: IdentityContractProviderOptions) {
  const delegate = inProcessIdentityOperations(options)
  class Operations extends IdentityOperationsService {
    readonly registerAndActivate = delegate.registerAndActivate
    readonly issueLogin = delegate.issueLogin
    readonly recognizeLogin = delegate.recognizeLogin
  }
  const ctx = new Context()
  const fiber = await ctx.plugin(Operations)
  const operations = ctx.get(identityOperationsKey)
  if (operations === undefined) {
    await fiber.dispose()
    throw new Error('identity operations not registered')
  }
  return { ctx, operations, dispose: () => fiber.dispose() }
}

/** Installs the governance double behind the registered `identityGovernance` service. */
export async function installGovernance(options: IdentityGovernanceContractProviderOptions) {
  const double = inProcessIdentity(options)
  const delegate: IdentityGovernance = double.governance
  class Governance extends IdentityGovernanceService {
    readonly createOrganization = delegate.createOrganization
    readonly queryCreateOrganization = delegate.queryCreateOrganization
    readonly issueMemberInvitation = delegate.issueMemberInvitation
    readonly acceptMemberInvitation = delegate.acceptMemberInvitation
    readonly rejectMemberInvitation = delegate.rejectMemberInvitation
    readonly withdrawMemberInvitation = delegate.withdrawMemberInvitation
    readonly queryInvitation = delegate.queryInvitation
    readonly queryReceivedInvitations = delegate.queryReceivedInvitations
    readonly queryIssuedInvitations = delegate.queryIssuedInvitations
    readonly queryOwnMemberships = delegate.queryOwnMemberships
    readonly queryOrganizationMembers = delegate.queryOrganizationMembers
    readonly leaveOrganization = delegate.leaveOrganization
    readonly removeMember = delegate.removeMember
    readonly changeMemberRole = delegate.changeMemberRole
    readonly switchCurrentTenant = delegate.switchCurrentTenant
    readonly queryCurrentTenant = delegate.queryCurrentTenant
    readonly revokeLogin = delegate.revokeLogin
    readonly queryOwnValidLogins = delegate.queryOwnValidLogins
    readonly reportBusinessAccess = delegate.reportBusinessAccess
  }
  const ctx = new Context()
  const fiber = await ctx.plugin(Governance)
  const governance = ctx.get(identityGovernanceKey)
  if (governance === undefined) {
    await fiber.dispose()
    throw new Error('identity governance not registered')
  }
  return { ctx, operations: double.operations, governance, dispose: () => fiber.dispose() }
}
