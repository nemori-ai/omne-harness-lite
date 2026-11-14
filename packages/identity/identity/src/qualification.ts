import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

export const QUALIFICATIONS = Object.freeze([
  'organization-cost-ledger-read',
  'organization-settings-manage',
] as const)

export type Qualification = (typeof QUALIFICATIONS)[number]

export function isQualification(value: unknown): value is Qualification {
  return typeof value === 'string' && (QUALIFICATIONS as readonly string[]).includes(value)
}

export type GovernanceModelRef = Readonly<{ model: string; revision: string }>

export type RoleRef = Readonly<{ model: GovernanceModelRef; role: string }>

export type RoleQualifications = Readonly<{
  role: string
  qualifications: readonly Qualification[]
}>

export type RoleMapping = Readonly<{
  model: GovernanceModelRef
  roles: readonly RoleQualifications[]
}>

export type RoleResolutionFailure = Readonly<{ reason: 'model-mismatch' | 'unknown-role' }>

export const DEFAULT_TEAM_MODEL: GovernanceModelRef = Object.freeze({
  model: 'default-team',
  revision: '1',
})

export const DEFAULT_TEAM_ROLES = Object.freeze({
  superAdmin: 'super-admin',
  member: 'member',
} as const)

export const DEFAULT_TEAM_ROLE_MAPPING: RoleMapping = Object.freeze({
  model: DEFAULT_TEAM_MODEL,
  roles: Object.freeze([
    Object.freeze({
      role: DEFAULT_TEAM_ROLES.superAdmin,
      qualifications: Object.freeze([
        'organization-cost-ledger-read',
        'organization-settings-manage',
      ] as const),
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

export function qualificationsOf(
  mapping: RoleMapping,
  role: RoleRef,
): Outcome<readonly Qualification[], RoleResolutionFailure> {
  if (!governanceModelEquals(mapping.model, role.model)) return fail({ reason: 'model-mismatch' })
  const entry = mapping.roles.find(candidate => candidate.role === role.role)
  if (entry === undefined) return fail({ reason: 'unknown-role' })
  return succeed(entry.qualifications)
}
