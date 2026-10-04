import type {
  OrganizationsService,
  MembershipsService,
  OffersService,
  OrganizationPurgeService,
} from '@omne-harness-lite/organization-governance'
import type { Deps } from './runtime.ts'
import { createOrganizationsService } from './organizations.ts'
import { createMembershipsService } from './memberships.ts'
import { createOffersService } from './offers.ts'
import { createOrganizationPurgeService } from './purge.ts'

export class OrganizationGovernanceStopped extends Error {
  override readonly name = 'OrganizationGovernanceStopped'
  constructor() {
    super('Organization governance instance is closed')
  }
}

export interface OrganizationGovernanceInstance {
  readonly organizations: OrganizationsService
  readonly memberships: MembershipsService
  readonly offers: OffersService
  readonly organizationPurge: OrganizationPurgeService
  close(): Promise<void>
}

/** Four service faces share one admission and completion owner. Borrowed dependencies remain caller-owned. */
export function createOrganizationGovernance(deps: Deps): OrganizationGovernanceInstance {
  const inFlight = new Set<Promise<unknown>>()
  let stopped = false
  let closing: Promise<void> | undefined
  function run<T>(work: () => Promise<T>): Promise<T> {
    if (stopped) return Promise.reject(new OrganizationGovernanceStopped())
    const { promise: result, resolve, reject } = Promise.withResolvers<T>()
    inFlight.add(result)
    result.then(
      () => inFlight.delete(result),
      () => inFlight.delete(result),
    )
    try {
      resolve(work())
    } catch (error) {
      reject(error)
    }
    return result
  }
  const organizations = createOrganizationsService(deps)
  const memberships = createMembershipsService(deps)
  const offers = createOffersService(deps)
  const organizationPurge = createOrganizationPurgeService(deps)
  return {
    organizations: {
      participate: unit => organizations.participate(unit),
      createPersonal: (...args) => run(() => organizations.createPersonal(...args)),
      createTeam: (...args) => run(() => organizations.createTeam(...args)),
      read: (...args) => run(() => organizations.read(...args)),
      dissolveAffiliation: (...args) => run(() => organizations.dissolveAffiliation(...args)),
      ancestorChain: (...args) => run(() => organizations.ancestorChain(...args)),
      shareAncestor: (...args) => run(() => organizations.shareAncestor(...args)),
      scopeLayers: input => {
        if (stopped) throw new OrganizationGovernanceStopped()
        return organizations.scopeLayers(input)
      },
    },
    memberships: {
      participate: unit => memberships.participate(unit),
      standing: (...args) => run(() => memberships.standing(...args)),
      mine: (...args) => run(() => memberships.mine(...args)),
      changeRole: (...args) => run(() => memberships.changeRole(...args)),
      remove: (...args) => run(() => memberships.remove(...args)),
      currentTenant: (...args) => run(() => memberships.currentTenant(...args)),
      switchCurrentTenant: (...args) => run(() => memberships.switchCurrentTenant(...args)),
      list: (...args) => run(() => memberships.list(...args)),
      sweepStaleSelections: (...args) => run(() => memberships.sweepStaleSelections(...args)),
    },
    offers: {
      declineInvitation: (...args) => run(() => offers.declineInvitation(...args)),
      declineAffiliationRequest: (...args) => run(() => offers.declineAffiliationRequest(...args)),
      participate: unit => offers.participate(unit),
      issueInvitation: (...args) => run(() => offers.issueInvitation(...args)),
      withdrawInvitation: (...args) => run(() => offers.withdrawInvitation(...args)),
      acceptInvitation: (...args) => run(() => offers.acceptInvitation(...args)),
      issueAffiliationRequest: (...args) => run(() => offers.issueAffiliationRequest(...args)),
      withdrawAffiliationRequest: (...args) =>
        run(() => offers.withdrawAffiliationRequest(...args)),
      acceptAffiliationRequest: (...args) => run(() => offers.acceptAffiliationRequest(...args)),
      readInvitation: (...args) => run(() => offers.readInvitation(...args)),
      readAffiliationRequest: (...args) => run(() => offers.readAffiliationRequest(...args)),
      listReceivedInvitations: (...args) => run(() => offers.listReceivedInvitations(...args)),
      listIssued: (...args) => run(() => offers.listIssued(...args)),
      listReceivedAffiliationRequests: (...args) =>
        run(() => offers.listReceivedAffiliationRequests(...args)),
    },
    organizationPurge: {
      purgePersonalOrganization: (...args) =>
        run(() => organizationPurge.purgePersonalOrganization(...args)),
    },
    close() {
      if (closing) return closing
      stopped = true
      closing = Promise.allSettled([...inFlight]).then(() => {})
      return closing
    },
  }
}
