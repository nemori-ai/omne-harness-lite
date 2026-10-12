import type { Context } from '@deepseek-ai/cordis'
import {
  Organizations,
  Offers,
  Memberships,
  OrganizationPurge,
} from '@omne-harness-lite/organization-governance/cordis'
import type {
  OrganizationsService,
  OffersService,
  MembershipsService,
  OrganizationPurgeService,
} from '@omne-harness-lite/organization-governance'

export class OrganizationsSqlService extends Organizations {
  readonly participate: OrganizationsService['participate']
  readonly createPersonal: OrganizationsService['createPersonal']
  readonly createTeam: OrganizationsService['createTeam']
  readonly read: OrganizationsService['read']
  readonly dissolveAffiliation: OrganizationsService['dissolveAffiliation']
  readonly ancestorChain: OrganizationsService['ancestorChain']
  readonly shareAncestor: OrganizationsService['shareAncestor']
  readonly scopeLayers: OrganizationsService['scopeLayers']
  constructor(ctx: Context, implementation: OrganizationsService) {
    super(ctx)
    this.participate = implementation.participate.bind(implementation)
    this.createPersonal = implementation.createPersonal.bind(implementation)
    this.createTeam = implementation.createTeam.bind(implementation)
    this.read = implementation.read.bind(implementation)
    this.dissolveAffiliation = implementation.dissolveAffiliation.bind(implementation)
    this.ancestorChain = implementation.ancestorChain.bind(implementation)
    this.shareAncestor = implementation.shareAncestor.bind(implementation)
    this.scopeLayers = implementation.scopeLayers.bind(implementation)
  }
}

export class OffersSqlService extends Offers {
  readonly declineInvitation: OffersService['declineInvitation']
  readonly declineAffiliationRequest: OffersService['declineAffiliationRequest']
  readonly participate: OffersService['participate']
  readonly issueInvitation: OffersService['issueInvitation']
  readonly withdrawInvitation: OffersService['withdrawInvitation']
  readonly acceptInvitation: OffersService['acceptInvitation']
  readonly issueAffiliationRequest: OffersService['issueAffiliationRequest']
  readonly withdrawAffiliationRequest: OffersService['withdrawAffiliationRequest']
  readonly acceptAffiliationRequest: OffersService['acceptAffiliationRequest']
  readonly readInvitation: OffersService['readInvitation']
  readonly readAffiliationRequest: OffersService['readAffiliationRequest']
  readonly listReceivedInvitations: OffersService['listReceivedInvitations']
  readonly listIssued: OffersService['listIssued']
  readonly listReceivedAffiliationRequests: OffersService['listReceivedAffiliationRequests']
  constructor(ctx: Context, implementation: OffersService) {
    super(ctx)
    this.declineInvitation = implementation.declineInvitation.bind(implementation)
    this.declineAffiliationRequest = implementation.declineAffiliationRequest.bind(implementation)
    this.participate = implementation.participate.bind(implementation)
    this.issueInvitation = implementation.issueInvitation.bind(implementation)
    this.withdrawInvitation = implementation.withdrawInvitation.bind(implementation)
    this.acceptInvitation = implementation.acceptInvitation.bind(implementation)
    this.issueAffiliationRequest = implementation.issueAffiliationRequest.bind(implementation)
    this.withdrawAffiliationRequest = implementation.withdrawAffiliationRequest.bind(implementation)
    this.acceptAffiliationRequest = implementation.acceptAffiliationRequest.bind(implementation)
    this.readInvitation = implementation.readInvitation.bind(implementation)
    this.readAffiliationRequest = implementation.readAffiliationRequest.bind(implementation)
    this.listReceivedInvitations = implementation.listReceivedInvitations.bind(implementation)
    this.listIssued = implementation.listIssued.bind(implementation)
    this.listReceivedAffiliationRequests =
      implementation.listReceivedAffiliationRequests.bind(implementation)
  }
}

export class MembershipsSqlService extends Memberships {
  readonly participate: MembershipsService['participate']
  readonly standing: MembershipsService['standing']
  readonly mine: MembershipsService['mine']
  readonly changeRole: MembershipsService['changeRole']
  readonly remove: MembershipsService['remove']
  readonly currentTenant: MembershipsService['currentTenant']
  readonly switchCurrentTenant: MembershipsService['switchCurrentTenant']
  readonly list: MembershipsService['list']
  readonly sweepStaleSelections: MembershipsService['sweepStaleSelections']
  constructor(ctx: Context, implementation: MembershipsService) {
    super(ctx)
    this.participate = implementation.participate.bind(implementation)
    this.standing = implementation.standing.bind(implementation)
    this.mine = implementation.mine.bind(implementation)
    this.changeRole = implementation.changeRole.bind(implementation)
    this.remove = implementation.remove.bind(implementation)
    this.currentTenant = implementation.currentTenant.bind(implementation)
    this.switchCurrentTenant = implementation.switchCurrentTenant.bind(implementation)
    this.list = implementation.list.bind(implementation)
    this.sweepStaleSelections = implementation.sweepStaleSelections.bind(implementation)
  }
}

export class OrganizationPurgeSqlService extends OrganizationPurge {
  readonly purgePersonalOrganization: OrganizationPurgeService['purgePersonalOrganization']
  constructor(ctx: Context, implementation: OrganizationPurgeService) {
    super(ctx)
    this.purgePersonalOrganization = implementation.purgePersonalOrganization.bind(implementation)
  }
}
