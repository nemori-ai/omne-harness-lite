import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  OrganizationsService,
  OffersService,
  MembershipsService,
  OrganizationPurgeService,
  OrganizationGovernanceEvents,
} from './types.ts'

/** @contract capability.organization-governance */
export abstract class Organizations extends Service implements OrganizationsService {
  static readonly provide = 'organizations'
  constructor(ctx: Context) {
    super(ctx, Organizations.provide)
  }
  abstract participate: OrganizationsService['participate']
  abstract createPersonal: OrganizationsService['createPersonal']
  abstract createTeam: OrganizationsService['createTeam']
  abstract read: OrganizationsService['read']
  abstract dissolveAffiliation: OrganizationsService['dissolveAffiliation']
  abstract ancestorChain: OrganizationsService['ancestorChain']
  abstract shareAncestor: OrganizationsService['shareAncestor']
  abstract scopeLayers: OrganizationsService['scopeLayers']
}

export const ORGANIZATIONS_SERVICE = Organizations.provide

/** @contract capability.organization-governance */
export abstract class Offers extends Service implements OffersService {
  static readonly provide = 'offers'
  constructor(ctx: Context) {
    super(ctx, Offers.provide)
  }
  abstract declineInvitation: OffersService['declineInvitation']
  abstract declineAffiliationRequest: OffersService['declineAffiliationRequest']
  abstract participate: OffersService['participate']
  abstract issueInvitation: OffersService['issueInvitation']
  abstract withdrawInvitation: OffersService['withdrawInvitation']
  abstract acceptInvitation: OffersService['acceptInvitation']
  abstract issueAffiliationRequest: OffersService['issueAffiliationRequest']
  abstract withdrawAffiliationRequest: OffersService['withdrawAffiliationRequest']
  abstract acceptAffiliationRequest: OffersService['acceptAffiliationRequest']
  abstract readInvitation: OffersService['readInvitation']
  abstract readAffiliationRequest: OffersService['readAffiliationRequest']
  abstract listReceivedInvitations: OffersService['listReceivedInvitations']
  abstract listIssued: OffersService['listIssued']
  abstract listReceivedAffiliationRequests: OffersService['listReceivedAffiliationRequests']
}

export const OFFERS_SERVICE = Offers.provide

/** @contract capability.organization-governance */
export abstract class Memberships extends Service implements MembershipsService {
  static readonly provide = 'memberships'
  constructor(ctx: Context) {
    super(ctx, Memberships.provide)
  }
  abstract participate: MembershipsService['participate']
  abstract standing: MembershipsService['standing']
  abstract mine: MembershipsService['mine']
  abstract changeRole: MembershipsService['changeRole']
  abstract remove: MembershipsService['remove']
  abstract currentTenant: MembershipsService['currentTenant']
  abstract switchCurrentTenant: MembershipsService['switchCurrentTenant']
  abstract list: MembershipsService['list']
  abstract sweepStaleSelections: MembershipsService['sweepStaleSelections']
}

export const MEMBERSHIPS_SERVICE = Memberships.provide

/** @contract capability.organization-governance */
export abstract class OrganizationPurge extends Service implements OrganizationPurgeService {
  static readonly provide = 'organizationPurge'
  constructor(ctx: Context) {
    super(ctx, OrganizationPurge.provide)
  }
  abstract purgePersonalOrganization: OrganizationPurgeService['purgePersonalOrganization']
}

export const ORGANIZATION_PURGE_SERVICE = OrganizationPurge.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    organizations: Organizations
    offers: Offers
    memberships: Memberships
    organizationPurge: OrganizationPurge
  }
  interface Events {
    /** @mode emit
     * @param payload Committed governance notification.
     */
    'organization-governance/invitation-issued': OrganizationGovernanceEvents['organization-governance/invitation-issued']
    /** @mode emit
     * @param payload Committed governance notification.
     */
    'organization-governance/membership-changed': OrganizationGovernanceEvents['organization-governance/membership-changed']
    /** @mode emit
     * @param payload Committed governance notification.
     */
    'organization-governance/role-changed': OrganizationGovernanceEvents['organization-governance/role-changed']
    /** @mode emit
     * @param payload Committed governance notification.
     */
    'organization-governance/affiliation-dissolved': OrganizationGovernanceEvents['organization-governance/affiliation-dissolved']
    /** @mode emit
     * @param payload Committed governance notification.
     */
    'organization-governance/organization-purged': OrganizationGovernanceEvents['organization-governance/organization-purged']
  }
}
