const ACCOUNT_SPEC = { name: 'AccountId', prefix: 'acc_' } as const
const ORGANIZATION_SPEC = { name: 'OrganizationId', prefix: 'org_' } as const
const LOGIN_STATE_SPEC = { name: 'LoginStateId', prefix: 'lgn_' } as const

const IDENTITY_SPECS = [
  ACCOUNT_SPEC,
  ORGANIZATION_SPEC,
  LOGIN_STATE_SPEC,
  { name: 'TenantId' },
  { name: 'ScopeLayerIdentity' },
] as const

type IdentitySpec = (typeof IDENTITY_SPECS)[number]
type IdentityTypeName = IdentitySpec['name']
type AtomicSpec = Extract<IdentitySpec, { readonly prefix: string }>
type AtomicName = AtomicSpec['name']

/** Identity type names for static checks. Login identifiers are account attributes, not identity types. */
export const IDENTITY_TYPE_NAMES = Object.freeze(IDENTITY_SPECS.map(spec => spec.name))

interface AtomicIdentity<N extends AtomicName> {
  readonly name: N
  readonly text: string
}

export type AccountId = AtomicIdentity<'AccountId'>
export type OrganizationId = AtomicIdentity<'OrganizationId'>
export type LoginStateId = AtomicIdentity<'LoginStateId'>

export interface TenantId {
  readonly name: 'TenantId'
  readonly organization: OrganizationId
  readonly account: AccountId
}

export type ScopeLayerIdentity =
  | {
      readonly name: 'ScopeLayerIdentity'
      readonly layer: 'organization'
      readonly organization: OrganizationId
    }
  | { readonly name: 'ScopeLayerIdentity'; readonly layer: 'tenant'; readonly tenant: TenantId }

export interface IdentityTextError {
  readonly kind: 'identity-text-error'
  readonly code:
    | 'type'
    | 'lexicon'
    | 'whitespace'
    | 'case'
    | 'extra-member'
    | 'missing-member'
    | 'family'
}

export type IdentityTextResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: IdentityTextError }

/** Rejected input is a failure result. Neither function throws, trims, or folds case. */
export interface IdentityTextCodec<T> {
  readonly parse: (text: string) => IdentityTextResult<T>
  readonly encode: (value: T) => IdentityTextResult<string>
}

const ATOMIC_BODY = /^[0-9abcdefghjkmnpqrstvwxyz]{26}$/
const EDGE_WHITESPACE = /^[ \t\n]|[ \t\n]$/
const UPPERCASE = /[A-Z]/

const TENANT_MEMBERS = ['organization', 'account'] as const

// A type assertion can build any of these shapes, so membership here is the only proof that
// parse or tenant() built the value.
const minted = new WeakSet<object>()

function mint<T extends object>(value: T): T {
  minted.add(Object.freeze(value))
  return value
}

function isMinted(value: { readonly name: IdentityTypeName }, name: IdentityTypeName): boolean {
  return minted.has(value) && value.name === name
}

function success<T>(value: T): IdentityTextResult<T> {
  return { ok: true, value }
}

function failure(code: IdentityTextError['code']): IdentityTextResult<never> {
  return { ok: false, error: { kind: 'identity-text-error', code } }
}

function parseJsonText<T>(
  text: unknown,
  parseValue: (value: unknown) => IdentityTextResult<T>,
): IdentityTextResult<T> {
  if (typeof text !== 'string') return failure('type')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return failure('type')
  }
  return parseValue(value)
}

function isJsonObject(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readMembers<K extends string>(
  value: unknown,
  keys: readonly K[],
): IdentityTextResult<{ readonly [P in K]: unknown }> {
  if (!isJsonObject(value)) return failure('type')
  if (!keys.every(key => Object.hasOwn(value, key))) return failure('missing-member')
  if (Object.keys(value).length !== keys.length) return failure('extra-member')
  return success(value as { readonly [P in K]: unknown })
}

function parseAtomic<N extends AtomicName>(
  text: unknown,
  spec: { readonly name: N; readonly prefix: string },
): IdentityTextResult<AtomicIdentity<N>> {
  if (typeof text !== 'string') return failure('type')
  if (text === '') return failure('lexicon')
  if (EDGE_WHITESPACE.test(text)) return failure('whitespace')
  if (UPPERCASE.test(text)) return failure('case')
  if (!text.startsWith(spec.prefix)) return failure('family')
  if (!ATOMIC_BODY.test(text.slice(spec.prefix.length))) return failure('lexicon')
  return success(mint({ name: spec.name, text }))
}

function atomicCodec<N extends AtomicName>(spec: {
  readonly name: N
  readonly prefix: string
}): IdentityTextCodec<AtomicIdentity<N>> {
  return Object.freeze({
    parse: (text: string) => parseAtomic(text, spec),
    encode: (value: AtomicIdentity<N>) =>
      isMinted(value, spec.name) ? success(value.text) : failure('type'),
  })
}

function atomicEquals<N extends AtomicName>(
  left: AtomicIdentity<N>,
  right: AtomicIdentity<N>,
  name: N,
): boolean {
  return isMinted(left, name) && isMinted(right, name) && left.text === right.text
}

export const accountCodec: IdentityTextCodec<AccountId> = atomicCodec(ACCOUNT_SPEC)

export const organizationCodec: IdentityTextCodec<OrganizationId> = atomicCodec(ORGANIZATION_SPEC)

export const loginStateCodec: IdentityTextCodec<LoginStateId> = atomicCodec(LOGIN_STATE_SPEC)

/** False unless both values came from parse. */
export function accountEquals(left: AccountId, right: AccountId): boolean {
  return atomicEquals(left, right, 'AccountId')
}

/** False unless both values came from parse. */
export function organizationEquals(left: OrganizationId, right: OrganizationId): boolean {
  return atomicEquals(left, right, 'OrganizationId')
}

/** False unless both values came from parse. */
export function loginStateEquals(left: LoginStateId, right: LoginStateId): boolean {
  return atomicEquals(left, right, 'LoginStateId')
}

function mintTenant(organization: OrganizationId, account: AccountId): TenantId {
  return mint<TenantId>({ name: 'TenantId', organization, account })
}

/** Throws TypeError unless both halves came from parse. */
export function tenant(organization: OrganizationId, account: AccountId): TenantId {
  if (!isMinted(organization, 'OrganizationId') || !isMinted(account, 'AccountId'))
    throw new TypeError(
      'tenant() accepts only an OrganizationId and an AccountId returned by parse',
    )
  return mintTenant(organization, account)
}

function parseTenantValue(value: unknown): IdentityTextResult<TenantId> {
  const members = readMembers(value, TENANT_MEMBERS)
  if (!members.ok) return members
  const organization = parseAtomic(members.value.organization, ORGANIZATION_SPEC)
  if (!organization.ok) return organization
  const account = parseAtomic(members.value.account, ACCOUNT_SPEC)
  if (!account.ok) return account
  return success(mintTenant(organization.value, account.value))
}

function tenantMembers(value: TenantId) {
  return { organization: value.organization.text, account: value.account.text }
}

/** Tenant text is a JSON object with exactly the `organization` and `account` members. */
export const tenantCodec: IdentityTextCodec<TenantId> = Object.freeze({
  parse: (text: string) => parseJsonText(text, parseTenantValue),
  encode: (value: TenantId) =>
    isMinted(value, 'TenantId') ? success(JSON.stringify(tenantMembers(value))) : failure('type'),
})

/** False unless both values came from parse or tenant(). */
export function tenantEquals(left: TenantId, right: TenantId): boolean {
  return (
    isMinted(left, 'TenantId') &&
    isMinted(right, 'TenantId') &&
    organizationEquals(left.organization, right.organization) &&
    accountEquals(left.account, right.account)
  )
}

function parseScopeLayerValue(value: unknown): IdentityTextResult<ScopeLayerIdentity> {
  if (!isJsonObject(value)) return failure('type')
  if (!Object.hasOwn(value, 'layer')) return failure('missing-member')
  const layer = value['layer']
  if (layer === 'organization') {
    const members = readMembers(value, ['layer', 'organization'])
    if (!members.ok) return members
    const organization = parseAtomic(members.value.organization, ORGANIZATION_SPEC)
    if (!organization.ok) return organization
    return success(
      mint<ScopeLayerIdentity>({
        name: 'ScopeLayerIdentity',
        layer,
        organization: organization.value,
      }),
    )
  }
  if (layer === 'tenant') {
    const members = readMembers(value, ['layer', 'tenant'])
    if (!members.ok) return members
    const pair = parseTenantValue(members.value.tenant)
    if (!pair.ok) return pair
    return success(
      mint<ScopeLayerIdentity>({ name: 'ScopeLayerIdentity', layer, tenant: pair.value }),
    )
  }
  return failure('family')
}

function scopeLayerMembers(value: ScopeLayerIdentity) {
  return value.layer === 'organization'
    ? { layer: value.layer, organization: value.organization.text }
    : { layer: value.layer, tenant: tenantMembers(value.tenant) }
}

/**
 * Scope layer text is a JSON object whose `layer` is `organization` or `tenant`, plus one member
 * named after that layer. Every other layer name is `family`.
 */
export const scopeLayerCodec: IdentityTextCodec<ScopeLayerIdentity> = Object.freeze({
  parse: (text: string) => parseJsonText(text, parseScopeLayerValue),
  encode: (value: ScopeLayerIdentity) =>
    isMinted(value, 'ScopeLayerIdentity')
      ? success(JSON.stringify(scopeLayerMembers(value)))
      : failure('type'),
})

/** False unless both values came from parse. */
export function scopeLayerEquals(left: ScopeLayerIdentity, right: ScopeLayerIdentity): boolean {
  if (!isMinted(left, 'ScopeLayerIdentity') || !isMinted(right, 'ScopeLayerIdentity')) return false
  if (left.layer === 'organization')
    return (
      right.layer === 'organization' && organizationEquals(left.organization, right.organization)
    )
  return right.layer === 'tenant' && tenantEquals(left.tenant, right.tenant)
}

// ---------------------------------------------------------------------------------------------
// Acting scope and access. These are the shared shapes that consumers use to say whose facts an
// action belongs to. They are not identity type names: IDENTITY_TYPE_NAMES stays as it is.

/**
 * Whose facts an action belongs to: one tenant, or the system itself for no tenant. There is no
 * form with an empty or default tenant. A value comes only from `tenantScope`, `systemScope` or
 * `actingScopeCodec.parse`.
 */
export type ActingScope =
  | { readonly kind: 'tenant'; readonly tenant: TenantId }
  | { readonly kind: 'system' }

const SYSTEM_SCOPE: ActingScope = mint<ActingScope>({ kind: 'system' })

function isMintedScope(value: ActingScope): boolean {
  return minted.has(value) && (value.kind === 'tenant' || value.kind === 'system')
}

/** The scope of an action done for one tenant. Throws TypeError unless `tenant` came from parse or tenant(). */
export function tenantScope(tenant: TenantId): ActingScope {
  if (!isMinted(tenant, 'TenantId'))
    throw new TypeError('tenantScope() accepts only a TenantId returned by parse or tenant()')
  return mint<ActingScope>({ kind: 'tenant', tenant })
}

/** The scope of an action the system does for no tenant. */
export function systemScope(): ActingScope {
  return SYSTEM_SCOPE
}

function parseActingScopeValue(value: unknown): IdentityTextResult<ActingScope> {
  if (!isJsonObject(value)) return failure('type')
  if (!Object.hasOwn(value, 'kind')) return failure('missing-member')
  const kind = value['kind']
  if (kind === 'system') {
    const members = readMembers(value, ['kind'])
    return members.ok ? success(SYSTEM_SCOPE) : members
  }
  if (kind === 'tenant') {
    const members = readMembers(value, ['kind', 'tenant'])
    if (!members.ok) return members
    const pair = parseTenantValue(members.value.tenant)
    if (!pair.ok) return pair
    return success(mint<ActingScope>({ kind, tenant: pair.value }))
  }
  return failure('family')
}

function actingScopeMembers(value: ActingScope) {
  return value.kind === 'system'
    ? { kind: value.kind }
    : { kind: value.kind, tenant: tenantMembers(value.tenant) }
}

/**
 * Acting scope text is `{"kind":"system"}` or `{"kind":"tenant","tenant":<tenant text>}`. Every
 * other kind is `family`. A tenant member follows the tenant text rules.
 */
export const actingScopeCodec: IdentityTextCodec<ActingScope> = Object.freeze({
  parse: (text: string) => parseJsonText(text, parseActingScopeValue),
  encode: (value: ActingScope) =>
    isMintedScope(value) ? success(JSON.stringify(actingScopeMembers(value))) : failure('type'),
})

/** False unless both values came from tenantScope, systemScope or parse. */
export function actingScopeEquals(left: ActingScope, right: ActingScope): boolean {
  if (!isMintedScope(left) || !isMintedScope(right)) return false
  if (left.kind === 'system') return right.kind === 'system'
  return right.kind === 'tenant' && tenantEquals(left.tenant, right.tenant)
}

/**
 * The access basis of one call: the principal and the explicit tenant the call acts in. This is
 * the one definition that the contract members re-export. The tenant is never inferred from a
 * connection, a process, an assembly or a credential; the caller passes it. `P` is the principal
 * type that the assembly chose; this package does not know what a principal is.
 */
export type Access<P> = Readonly<{ principal: P; tenant: TenantId }>

/**
 * Builds an access basis. Throws TypeError unless `tenant` came from parse or tenant(). The
 * principal is kept as given: whether it is trustworthy is the verifier's question, not this one.
 */
export function access<P>(principal: P, tenant: TenantId): Access<P> {
  if (!isMinted(tenant, 'TenantId'))
    throw new TypeError('access() accepts only a TenantId returned by parse or tenant()')
  return Object.freeze({ principal, tenant })
}
