const IDENTITY_SPECS = [
  { name: 'AccountId', form: 'atomic', prefix: 'acc_' },
  { name: 'OrganizationId', form: 'atomic', prefix: 'org_' },
  { name: 'LoginStateId', form: 'atomic', prefix: 'lgn_' },
  { name: 'TenantId', form: 'pair' },
  { name: 'ScopeLayerIdentity', form: 'layer' },
] as const

type IdentitySpec = (typeof IDENTITY_SPECS)[number]
type IdentityTypeName = IdentitySpec['name']
type AtomicSpec = Extract<IdentitySpec, { readonly form: 'atomic' }>
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

export interface IdentityTextError {
  readonly kind: 'identity-text-error'
  readonly code:
    'type' | 'lexicon' | 'whitespace' | 'case' | 'extra-member' | 'missing-member' | 'family'
}

export type IdentityTextResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: IdentityTextError }

/** Rejected input is a failure result. Neither function throws, trims, or folds case. */
export interface IdentityTextCodec<T> {
  parse(text: string): IdentityTextResult<T>
  encode(value: T): IdentityTextResult<string>
}

const ATOMIC_BODY = /^[0-9abcdefghjkmnpqrstvwxyz]{26}$/
const EDGE_WHITESPACE = /^[ \t\n]|[ \t\n]$/
const UPPERCASE = /[A-Z]/

// A type assertion can build any of these shapes, so membership here is the only proof of a parse.
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

function parseAtomic<N extends AtomicName>(
  text: string,
  spec: { readonly name: N; readonly prefix: string },
): IdentityTextResult<AtomicIdentity<N>> {
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

const [ACCOUNT_SPEC, ORGANIZATION_SPEC, LOGIN_STATE_SPEC] = IDENTITY_SPECS
const ACCOUNT_CODEC = atomicCodec(ACCOUNT_SPEC)
const ORGANIZATION_CODEC = atomicCodec(ORGANIZATION_SPEC)
const LOGIN_STATE_CODEC = atomicCodec(LOGIN_STATE_SPEC)

export function accountCodec(): IdentityTextCodec<AccountId> {
  return ACCOUNT_CODEC
}

export function organizationCodec(): IdentityTextCodec<OrganizationId> {
  return ORGANIZATION_CODEC
}

export function loginStateCodec(): IdentityTextCodec<LoginStateId> {
  return LOGIN_STATE_CODEC
}

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
