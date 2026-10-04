import { createRequire } from 'node:module'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  unwrap,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { StorageDefect } from '@omne-harness-lite/storage'
import type { SessionRef } from '@omne-harness-lite/messages'

// Use only the shared SessionRef definition; current messages are not an ST2 prerequisite.
const require = createRequire(new URL('../package.json', import.meta.url))
export function sessionValue(value: unknown): SessionRef | undefined {
  if (typeof value !== 'string') return undefined
  const generated = require('./generated/exact.cjs') as {
    SessionRef(text: string): { readonly valid: boolean }
  }
  if (!generated.SessionRef(writeJsonLossless(value)).valid) return undefined
  const parsed = parseOpaqueIdentifier(value, 'SessionRef')
  return 'ok' in parsed ? parsed.ok : undefined
}
export function decodeTenant(value: string): TenantId {
  const parsed = readJsonStrict(value)
  if ('failed' in parsed) throw new StorageDefect('session tenancy contains malformed tenant JSON')
  const tenant = parseTenantId(parsed.ok)
  if (!('ok' in tenant))
    throw new StorageDefect('session tenancy contains an invalid tenant identity')
  return unwrap(tenant)
}
