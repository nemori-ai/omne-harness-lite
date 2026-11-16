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

export function readTenantText(text: string): TenantId | undefined {
  if (typeof text !== 'string' || !text.isWellFormed()) return undefined
  const strict = readJsonText(text, tenantTextLimits)
  if (strict.kind !== 'ok' || strict.value.kind !== 'object') return undefined
  return read(tenantCodec, text)
}

export function encodeTenantText(value: TenantId): string {
  return encode(tenantCodec, value)
}

export function readOrganizationIdText(text: string): OrganizationId | undefined {
  return read(organizationCodec, text)
}

export function encodeOrganizationIdText(value: OrganizationId): string {
  return encode(organizationCodec, value)
}

export function readAccountIdText(text: string): AccountId | undefined {
  return read(accountCodec, text)
}

export function encodeAccountIdText(value: AccountId): string {
  return encode(accountCodec, value)
}

export function readLoginStateIdText(text: string): LoginStateId | undefined {
  return read(loginStateCodec, text)
}

export function encodeLoginStateIdText(value: LoginStateId): string {
  return encode(loginStateCodec, value)
}
