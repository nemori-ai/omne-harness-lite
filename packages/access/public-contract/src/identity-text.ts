import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  accountCodec,
  loginStateCodec,
  organizationCodec,
  tenantCodec,
  type AccountId,
  type IdentityTextCodec,
  type LoginStateId,
  type OrganizationId,
  type TenantId,
} from '@omne-harness/legal-identity'

export type { AccountId, LoginStateId, OrganizationId, TenantId }

const encodeError = 'value is not an identity minted by the identity package'

// A tenant text is a JSON text inside a JSON string. It holds two short ids, so the budgets are
// small and fixed. They match the shape limits that the message codecs apply to the same text.
const tenantTextLimits: JsonLimits = {
  maxBytes: 1024,
  maxDepth: 1,
  maxItems: 3,
  maxMembers: 2,
  maxStringLength: 256,
  maxNumberLength: 1,
}

function read<T>(codec: IdentityTextCodec<T>, text: unknown): T | undefined {
  if (typeof text !== 'string') return undefined
  const parsed = codec.parse(text)
  return parsed.ok ? parsed.value : undefined
}

function encode<T>(codec: IdentityTextCodec<T>, value: T): string {
  const encoded = codec.encode(value)
  if (!encoded.ok) throw new TypeError(encodeError)
  return encoded.value
}

/**
 * The tenant that a tenant text names, or `undefined`. The text must be well-formed, strict JSON
 * (no duplicate key) with exactly the `organization` and `account` members, the same rule the
 * message codecs apply to `actingTenant` and `tenantId`.
 */
export function readTenantText(text: string): TenantId | undefined {
  if (typeof text !== 'string' || !text.isWellFormed()) return undefined
  const strict = readJsonText(text, tenantTextLimits)
  if (strict.kind !== 'ok' || strict.value.kind !== 'object') return undefined
  return read(tenantCodec, text)
}

/** The wire text of a tenant. Throws `TypeError` for a value the identity package did not mint. */
export function encodeTenantText(value: TenantId): string {
  return encode(tenantCodec, value)
}

/** The organization that an `org_` text names, or `undefined`. */
export function readOrganizationIdText(text: string): OrganizationId | undefined {
  return read(organizationCodec, text)
}

/** The wire text of an organization. Throws `TypeError` for a value the identity package did not mint. */
export function encodeOrganizationIdText(value: OrganizationId): string {
  return encode(organizationCodec, value)
}

/** The account that an `acc_` text names, or `undefined`. */
export function readAccountIdText(text: string): AccountId | undefined {
  return read(accountCodec, text)
}

/** The wire text of an account. Throws `TypeError` for a value the identity package did not mint. */
export function encodeAccountIdText(value: AccountId): string {
  return encode(accountCodec, value)
}

/** The login that an `lgn_` text names, or `undefined`. */
export function readLoginStateIdText(text: string): LoginStateId | undefined {
  return read(loginStateCodec, text)
}

/** The wire text of a login. Throws `TypeError` for a value the identity package did not mint. */
export function encodeLoginStateIdText(value: LoginStateId): string {
  return encode(loginStateCodec, value)
}
