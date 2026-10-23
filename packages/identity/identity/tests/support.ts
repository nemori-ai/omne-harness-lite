// Fixtures of the identity tests: parsed tenants and a tenant standing double. The double keeps a
// membership table in memory; it is a test stand-in, not a provider of durable identity facts.
import {
  accountCodec,
  organizationCodec,
  tenant,
  tenantCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  DEFAULT_TEAM_MODEL,
  DEFAULT_TEAM_ROLE_MAPPING,
  qualificationsOf,
  type RoleRef,
  type TenantStandingReading,
  type TenantStandingSource,
} from '@omne-harness/identity'

export const ORGANIZATION_TEXT = 'org_abcdefghjkmnpqrstvwxyz2345'
export const ADMIN_ACCOUNT_TEXT = 'acc_abcdefghjkmnpqrstvwxyz2345'
export const MEMBER_ACCOUNT_TEXT = 'acc_abcdefghjkmnpqrstvwxyz2346'

export function parsedTenant(organization: string, account: string): TenantId {
  const org = organizationCodec.parse(organization)
  const acc = accountCodec.parse(account)
  if (!org.ok || !acc.ok) throw new Error('fixture did not parse')
  return tenant(org.value, acc.value)
}

export function tenantKey(value: TenantId): string {
  const text = tenantCodec.encode(value)
  if (!text.ok) throw new Error('fixture tenant is not minted')
  return text.value
}

export type StandingTable = Readonly<{
  source: TenantStandingSource
  /** Sets or replaces the role of the tenant's account in the tenant's organization. */
  join(value: TenantId, role: string): void
  /** Removes the membership: the next reading is not-member. */
  leave(value: TenantId): void
  /** Makes every later reading unavailable. */
  fail(diagnostic: string): void
}>

/** An in-memory standing table that resolves roles through the default team mapping. */
export function standingTable(): StandingTable {
  const roles = new Map<string, string>()
  let revision = 0
  let outage: string | null = null
  const reading = (value: TenantId): TenantStandingReading => {
    if (outage !== null) return { kind: 'unavailable', diagnostic: outage }
    const key = tenantKey(value)
    const evidence = { record: `membership:${key}`, revision: String(revision) }
    const roleName = roles.get(key)
    if (roleName === undefined) return { kind: 'not-member', evidence }
    const role: RoleRef = { model: DEFAULT_TEAM_MODEL, role: roleName }
    const qualifications = qualificationsOf(DEFAULT_TEAM_ROLE_MAPPING, role)
    if ('failure' in qualifications) throw new Error(`fixture role ${roleName} is not mapped`)
    return { kind: 'member', role, qualifications: qualifications.ok, evidence }
  }
  return {
    source: { read: input => Promise.resolve(reading(input.tenant)) },
    join: (value, role) => {
      roles.set(tenantKey(value), role)
      revision += 1
    },
    leave: value => {
      roles.delete(tenantKey(value))
      revision += 1
    },
    fail: diagnostic => {
      outage = diagnostic
    },
  }
}
