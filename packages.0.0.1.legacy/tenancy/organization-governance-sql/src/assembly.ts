import type {
  OrganizationsService,
  MembershipsService,
  OffersService,
  OrganizationPurgeService,
} from '@omne-harness-lite/organization-governance'
import type { Deps } from './assembly-deps.ts'
import type { PolicyDeps } from './policy-deps.ts'
import { createGovernancePersistence } from './governance-sql.ts'
import { createOrganizationsPolicy } from './organizations.ts'
import { createMembershipsPolicy } from './memberships.ts'
import { createOffersPolicy } from './offers.ts'
import { createOrganizationPurgePolicy } from './purge.ts'
function dependencies(deps: Deps) {
  const backend = createGovernancePersistence({
    storage: deps.storage,
    accounts: deps.accounts,
    logins: deps.logins,
  })
  const policy: PolicyDeps = {
    persistence: backend.persistence,
    clock: deps.clock,
    config: deps.config,
    logger: deps.logger,
    notify: (name, payload) => deps.notify(name, payload),
  }
  return { policy, bindUnit: backend.bindUnit }
}
type Binding = ReturnType<typeof dependencies>
function organizations(binding: Binding): OrganizationsService {
  const policy = createOrganizationsPolicy(binding.policy)
  return { ...policy, participate: unit => policy.participate(binding.bindUnit(unit)) }
}
function memberships(binding: Binding): MembershipsService {
  const policy = createMembershipsPolicy(binding.policy)
  return { ...policy, participate: unit => policy.participate(binding.bindUnit(unit)) }
}
function offers(binding: Binding): OffersService {
  const policy = createOffersPolicy(binding.policy)
  return { ...policy, participate: unit => policy.participate(binding.bindUnit(unit)) }
}
export function createOrganizationsService(deps: Deps): OrganizationsService {
  return organizations(dependencies(deps))
}
export function createMembershipsService(deps: Deps): MembershipsService {
  return memberships(dependencies(deps))
}
export function createOffersService(deps: Deps): OffersService {
  return offers(dependencies(deps))
}
export function createOrganizationPurgeService(deps: Deps): OrganizationPurgeService {
  return createOrganizationPurgePolicy(dependencies(deps).policy)
}
/** Shared pure policies and original raw-unit binding; no lifecycle owner is created here. */
export function assembleGovernanceServices(deps: Deps) {
  const binding = dependencies(deps)
  return {
    organizations: organizations(binding),
    memberships: memberships(binding),
    offers: offers(binding),
    organizationPurge: createOrganizationPurgePolicy(binding.policy),
  }
}
