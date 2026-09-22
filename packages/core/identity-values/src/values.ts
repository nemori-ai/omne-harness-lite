import { type OpaqueIdentifier, parseOpaqueIdentifier } from './opaque.ts'
import { type Parsed, invalidInput, isOk, ok } from './parsed.ts'

// ---- 不透明标识（S-1 / S-2 / S-3 / S-9） ----

export type AccountId = OpaqueIdentifier<'AccountId'>
export type OrganizationId = OpaqueIdentifier<'OrganizationId'>
export type LoginStateId = OpaqueIdentifier<'LoginStateId'>
/** 登录标识是账号的一项属性，不是它的标识（S-2）；品牌不同，与 AccountId 不相容。 */
export type LoginIdentifier = OpaqueIdentifier<'LoginIdentifier'>

export const parseAccountId = (value: unknown): Parsed<AccountId> =>
  parseOpaqueIdentifier(value, 'AccountId')
export const parseOrganizationId = (value: unknown): Parsed<OrganizationId> =>
  parseOpaqueIdentifier(value, 'OrganizationId')
export const parseLoginStateId = (value: unknown): Parsed<LoginStateId> =>
  parseOpaqueIdentifier(value, 'LoginStateId')
export const parseLoginIdentifier = (value: unknown): Parsed<LoginIdentifier> =>
  parseOpaqueIdentifier(value, 'LoginIdentifier')

// ---- 封闭枚举（S-4 / S-8 / S-32） ----

export const ORGANIZATION_KINDS = ['personal', 'team'] as const
export type OrganizationKind = (typeof ORGANIZATION_KINDS)[number]

export const TENANT_ROLES = ['superAdministrator', 'member'] as const
export type TenantRole = (typeof TENANT_ROLES)[number]

function parseEnum<const T extends readonly string[]>(
  value: unknown,
  members: T,
  name: string,
): Parsed<T[number]> {
  if (typeof value !== 'string') return invalidInput(`${name}: not a string`)
  // S-32：未知取值一律拒绝，不映射到「最接近」的已知值。
  return (members as readonly string[]).includes(value)
    ? ok(value as T[number])
    : invalidInput(`${name}: unknown value`)
}

export const parseOrganizationKind = (value: unknown): Parsed<OrganizationKind> =>
  parseEnum(value, ORGANIZATION_KINDS, 'OrganizationKind')
export const parseTenantRole = (value: unknown): Parsed<TenantRole> =>
  parseEnum(value, TENANT_ROLES, 'TenantRole')

// ---- TenantId（S-5 / S-6 / S-7 / S-12） ----

/**
 * 值类型，由 (OrganizationId, AccountId) 有序对确定；不含角色、不含效力、不含时间；
 * 没有生成路径也没有销毁路径。
 */
export interface TenantId {
  readonly organization: OrganizationId
  readonly account: AccountId
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key))
}

/** 两个分量均必需（S-12），不得用环境值补齐；多余成员一律拒绝（S-7）。 */
export function parseTenantId(value: unknown): Parsed<TenantId> {
  if (!isPlainObject(value)) return invalidInput('TenantId: not an object')
  if (!hasOnlyKeys(value, ['organization', 'account'])) {
    return invalidInput('TenantId: unexpected member')
  }
  const organization = parseOrganizationId(value['organization'])
  if (!isOk(organization))
    return invalidInput(`TenantId.organization: ${organization.invalidInput}`)
  const account = parseAccountId(value['account'])
  if (!isOk(account)) return invalidInput(`TenantId.account: ${account.invalidInput}`)
  return ok({ organization: organization.ok, account: account.ok })
}

/** 相等按分量（S-5），不存在第三种相等依据。 */
export function tenantIdEquals(a: TenantId, b: TenantId): boolean {
  return a.organization === b.organization && a.account === b.account
}

/**
 * S-7 的唯一规范序列化形式：两个成员、固定键序、无多余成员。
 * 这是交换表示，不是标量键——本版不给标量键（G-05）。
 */
export function toCanonicalJson(tenant: TenantId): string {
  return JSON.stringify({ organization: tenant.organization, account: tenant.account })
}

// ---- MembershipStanding / MembershipStandingResult（S-10） ----

export type MembershipStanding =
  | { readonly standing: 'effective'; readonly role: TenantRole }
  | { readonly standing: 'ineffective' }

/** 读面的操作结果：效力值，或「这一次判不出来」。恰两支；`invalidInput` 不在其中（S-33）。 */
export type MembershipStandingResult = MembershipStanding | { readonly failure: 'unavailable' }

export function parseMembershipStanding(value: unknown): Parsed<MembershipStanding> {
  if (!isPlainObject(value)) return invalidInput('MembershipStanding: not an object')
  const standing = value['standing']
  if (standing === 'effective') {
    if (!hasOnlyKeys(value, ['standing', 'role'])) {
      return invalidInput('MembershipStanding: unexpected member')
    }
    const role = parseTenantRole(value['role'])
    if (!isOk(role)) return invalidInput('MembershipStanding: effective requires a role')
    return ok({ standing: 'effective', role: role.ok })
  }
  if (standing === 'ineffective') {
    if (!hasOnlyKeys(value, ['standing'])) {
      return invalidInput('MembershipStanding: ineffective carries no role')
    }
    return ok({ standing: 'ineffective' })
  }
  return invalidInput('MembershipStanding: unknown standing')
}

export function parseMembershipStandingResult(value: unknown): Parsed<MembershipStandingResult> {
  if (isPlainObject(value) && 'failure' in value) {
    if (value['failure'] === 'unavailable' && hasOnlyKeys(value, ['failure'])) {
      return ok({ failure: 'unavailable' })
    }
    return invalidInput('MembershipStandingResult: unknown failure shape')
  }
  return parseMembershipStanding(value)
}

// ---- ScopeLayerIdentity（S-11） ----

/** 恰两个变体；`session`、`workspace`、`account`、`factoryDefault` 在类型层面不存在。 */
export type ScopeLayerIdentity =
  | { readonly layer: 'organization'; readonly organization: OrganizationId }
  | { readonly layer: 'tenant'; readonly tenant: TenantId }

export function parseScopeLayerIdentity(value: unknown): Parsed<ScopeLayerIdentity> {
  if (!isPlainObject(value)) return invalidInput('ScopeLayerIdentity: not an object')
  const layer = value['layer']
  if (layer === 'organization') {
    if (!hasOnlyKeys(value, ['layer', 'organization'])) {
      return invalidInput('ScopeLayerIdentity: unexpected member')
    }
    const organization = parseOrganizationId(value['organization'])
    if (!isOk(organization)) return invalidInput('ScopeLayerIdentity.organization invalid')
    return ok({ layer: 'organization', organization: organization.ok })
  }
  if (layer === 'tenant') {
    if (!hasOnlyKeys(value, ['layer', 'tenant'])) {
      return invalidInput('ScopeLayerIdentity: unexpected member')
    }
    const tenant = parseTenantId(value['tenant'])
    if (!isOk(tenant)) return invalidInput(`ScopeLayerIdentity.tenant: ${tenant.invalidInput}`)
    return ok({ layer: 'tenant', tenant: tenant.ok })
  }
  return invalidInput('ScopeLayerIdentity: unknown layer')
}
