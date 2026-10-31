// Named qualifications and the role mapping of a governance model (SPEC ID-16, ID-12). A consumer
// asks for a qualification by name and never judges a role name itself.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

/** The named qualifications, in publication order. The first one is "organization cost ledger read". */
export const QUALIFICATIONS = Object.freeze(['organization-cost-ledger-read'] as const)

export type Qualification = (typeof QUALIFICATIONS)[number]

export function isQualification(value: unknown): value is Qualification {
  return typeof value === 'string' && (QUALIFICATIONS as readonly string[]).includes(value)
}

/** A governance model and its revision; a role name means nothing outside its model. */
export type GovernanceModelRef = Readonly<{ model: string; revision: string }>

export type RoleRef = Readonly<{ model: GovernanceModelRef; role: string }>

export type RoleQualifications = Readonly<{
  role: string
  qualifications: readonly Qualification[]
}>

/** What each role of one governance model qualifies for. */
export type RoleMapping = Readonly<{
  model: GovernanceModelRef
  roles: readonly RoleQualifications[]
}>

export type RoleResolutionFailure = Readonly<{ reason: 'model-mismatch' | 'unknown-role' }>

/** The default team governance scheme of SPEC ID-05: one super administrator role and one member role. */
export const DEFAULT_TEAM_MODEL: GovernanceModelRef = Object.freeze({
  model: 'default-team',
  revision: '1',
})

export const DEFAULT_TEAM_ROLES = Object.freeze({
  superAdmin: 'super-admin',
  member: 'member',
} as const)

/** In the default team scheme, the super administrator reads the organization cost ledger; a member does not. */
export const DEFAULT_TEAM_ROLE_MAPPING: RoleMapping = Object.freeze({
  model: DEFAULT_TEAM_MODEL,
  roles: Object.freeze([
    Object.freeze({
      role: DEFAULT_TEAM_ROLES.superAdmin,
      qualifications: Object.freeze(['organization-cost-ledger-read'] as const),
    }),
    Object.freeze({ role: DEFAULT_TEAM_ROLES.member, qualifications: Object.freeze([]) }),
  ]),
})

export function governanceModelEquals(
  left: GovernanceModelRef,
  right: GovernanceModelRef,
): boolean {
  return left.model === right.model && left.revision === right.revision
}

/**
 * The qualifications of one role under one mapping. The role must name the mapping's model: a
 * role name from another model is `model-mismatch`, not a guess. A role the mapping does not list
 * is `unknown-role`.
 */
export function qualificationsOf(
  mapping: RoleMapping,
  role: RoleRef,
): Outcome<readonly Qualification[], RoleResolutionFailure> {
  if (!governanceModelEquals(mapping.model, role.model)) return fail({ reason: 'model-mismatch' })
  const entry = mapping.roles.find(candidate => candidate.role === role.role)
  if (entry === undefined) return fail({ reason: 'unknown-role' })
  return succeed(entry.qualifications)
}
