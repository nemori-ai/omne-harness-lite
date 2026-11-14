import { utf8Length } from './json.ts'
import type { SqlIdentity, StorageScope } from '@omne-harness/sql-contract'

export const NAME_BYTES = 1024
export const DOMAIN_BYTES = 120

export function isName(value: unknown, limit: number = NAME_BYTES): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.isWellFormed() &&
    utf8Length(value) <= limit
  )
}

export function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function decodeScope(value: unknown): StorageScope | null {
  if (!isRecord(value)) return null
  const keys = Object.keys(value).sort()
  if (value['kind'] === 'system' && keys.length === 1) return { kind: 'system' }
  const tenant = value['tenant']
  if (value['kind'] === 'tenant' && keys.length === 2 && isName(tenant))
    return { kind: 'tenant', tenant }
  return null
}

export type DecodedIdentity = Readonly<{
  fields: Omit<SqlIdentity, 'protocolVersion'> | null
  identity: SqlIdentity | null
  protocol: unknown
}>

export function decodeIdentity(value: unknown): DecodedIdentity {
  if (!isRecord(value)) return { fields: null, identity: null, protocol: undefined }
  const scope = decodeScope(value['scope'])
  const { transactionDomain, operation, operationKey, recall } = value
  const fields =
    scope !== null &&
    isName(transactionDomain, DOMAIN_BYTES) &&
    isName(operation) &&
    isName(operationKey) &&
    (recall === undefined || recall === 'never')
      ? {
          scope,
          transactionDomain,
          operation,
          operationKey,
          ...(recall === 'never' ? { recall: 'never' as const } : {}),
        }
      : null
  const protocol = value['protocolVersion']
  const identity =
    fields !== null && protocol === '2' ? { ...fields, protocolVersion: '2' as const } : null
  return { fields, identity, protocol }
}

export function scopeKey(scope: StorageScope): string {
  return scope.kind === 'system' ? 'system' : `tenant:${scope.tenant}`
}

export function clipDiagnostic(text: string, limit: number): string {
  if (utf8Length(text) <= limit) return text
  let out = ''
  for (const point of text) {
    if (utf8Length(out + point) > limit) break
    out += point
  }
  return out
}
