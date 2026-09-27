import schema from '@omne-harness-lite/messages/schema/v2' with { type: 'json' }
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  unwrap,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { StorageDefect } from '@omne-harness-lite/storage'
import type { SessionRef } from '@omne-harness-lite/messages/v3'

// Compile only the shared SessionRef definition; do not admit a current message as an ST2 prerequisite.
const validator = createSchemaRuntime([schema]).compile({ $ref: `${schema.$id}#/$defs/SessionRef` })
export function sessionValue(value: unknown): SessionRef | undefined {
  if (typeof value !== 'string' || !validator.validate(value)) return undefined
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
