// Fixtures of the authorization tests: parsed tenants, issued principals, an in-memory tenant
// standing double, and the facts of a plain allowed case. The standing double is a test stand-in,
// not a provider of durable identity facts.
import {
  accountCodec,
  organizationCodec,
  tenant,
  tenantCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  DEFAULT_TEAM_MODEL,
  DEFAULT_TEAM_ROLES,
  DEFAULT_TEAM_ROLE_MAPPING,
  inProcessPrincipalAuthority,
  qualificationsOf,
  type ActingForTenantPrincipal,
  type PrincipalAuthority,
  type RoleRef,
  type SystemPrincipal,
  type TenantStandingReading,
  type TenantStandingSource,
} from '@omne-harness/identity'
import {
  noArguments,
  type AdmissionInput,
  type AdmissionOperation,
  type AdmissionTarget,
} from '@omne-harness/authorization'

export const ORGANIZATION_TEXT = 'org_abcdefghjkmnpqrstvwxyz2345'
export const OTHER_ORGANIZATION_TEXT = 'org_abcdefghjkmnpqrstvwxyz2346'
export const ADMIN_ACCOUNT_TEXT = 'acc_abcdefghjkmnpqrstvwxyz2345'
export const MEMBER_ACCOUNT_TEXT = 'acc_abcdefghjkmnpqrstvwxyz2346'

export const READ_HISTORY: AdmissionOperation = { owner: 'session', name: 'read-history' }
export const SESSION_TARGET: AdmissionTarget = { owner: 'session', kind: 'session', key: 'ses_1' }
export const WORK = { owner: 'session', work: 'ses_1' } as const

export function parsedTenant(organization: string, account: string): TenantId {
  const org = organizationCodec.parse(organization)
  const acc = accountCodec.parse(account)
  if (!org.ok || !acc.ok) throw new Error('fixture did not parse')
  return tenant(org.value, acc.value)
}

export const adminTenant = (): TenantId => parsedTenant(ORGANIZATION_TEXT, ADMIN_ACCOUNT_TEXT)
export const memberTenant = (): TenantId => parsedTenant(ORGANIZATION_TEXT, MEMBER_ACCOUNT_TEXT)

export function tenantKey(value: TenantId): string {
  const text = tenantCodec.encode(value)
  if (!text.ok) throw new Error('fixture tenant is not minted')
  return text.value
}

export type StandingTable = Readonly<{
  source: TenantStandingSource
  join(value: TenantId, role: string): void
  leave(value: TenantId): void
  fail(diagnostic: string): void
  /** How many readings the source answered. */
  reads(): number
}>

/** An in-memory standing table that resolves roles through the default team mapping. */
export function standingTable(): StandingTable {
  const roles = new Map<string, string>()
  let revision = 0
  let reads = 0
  let outage: string | null = null
  const reading = (value: TenantId): TenantStandingReading => {
    reads += 1
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
    reads: () => reads,
  }
}

export type Issued = Readonly<{
  authority: PrincipalAuthority
  coordinator: SystemPrincipal
  /** The coordinator acting for the admin tenant. */
  actingForAdmin: ActingForTenantPrincipal
  actingFor(value: TenantId): ActingForTenantPrincipal
}>

/** One authority with an issued coordinator and the principals it acts with. */
export function issued(authority = inProcessPrincipalAuthority()): Issued {
  const coordinator = authority.issuer.issueSystem({ component: 'session-coordinator' })
  if ('failure' in coordinator) throw new Error('fixture coordinator did not issue')
  const actingFor = (value: TenantId): ActingForTenantPrincipal => {
    const principal = authority.issuer.issueActingForTenant({
      actor: coordinator.ok,
      tenant: value,
      work: WORK,
    })
    if ('failure' in principal) throw new Error('fixture acting principal did not issue')
    return principal.ok
  }
  return {
    authority,
    coordinator: coordinator.ok,
    actingForAdmin: actingFor(adminTenant()),
    actingFor,
  }
}

/** A read-history input of the coordinator acting for the given tenant, with no permit. */
export function readHistoryInput(
  principal: ActingForTenantPrincipal | SystemPrincipal,
  value: TenantId,
  overrides: Partial<AdmissionInput> = {},
): AdmissionInput {
  return {
    access: { principal, tenant: value },
    operation: READ_HISTORY,
    target: SESSION_TARGET,
    arguments: noArguments(),
    requires: [],
    permit: null,
    ...overrides,
  }
}

export const DEFAULT_ROLES = DEFAULT_TEAM_ROLES

/**
 * Waits until a paused dependency of the check is entered. If the check settles first, it never
 * reaches that dependency, so this fails at once instead of waiting for the test timeout.
 */
export async function reached(entered: Promise<void>, pending: Promise<unknown>): Promise<void> {
  let paused = false
  const settledFirst = pending.then(
    () => {
      if (!paused) throw new Error('the check settled before it entered the paused dependency')
    },
    (error: unknown) => {
      if (!paused) throw error
    },
  )
  await Promise.race([entered.then(() => void (paused = true)), settledFirst])
}
