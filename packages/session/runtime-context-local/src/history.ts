import { copyJsonValue, type JsonObject } from '@omne-harness-lite/content-blocks'
import { parseTenantId, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { checkLogPayload, positiveInteger, type LogEntry } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { decodeEvent } from './codec.ts'
import type { ContextEvent } from './journal-types.ts'
import { object, sameScope } from './values.ts'
import { checkedScope } from './scope.ts'

function claimsContext(row: JsonObject): boolean {
  const payload = row.payload
  return (
    (typeof row.dedupeKey === 'string' && row.dedupeKey.startsWith('context:')) ||
    (Array.isArray(row.readKeys) && row.readKeys.includes('runtime-context')) ||
    (object(payload) && payload.owner === 'runtime-context')
  )
}
function validEnvelope(row: JsonObject, revision: string): boolean {
  return (
    positiveInteger(row.position) &&
    row.run === undefined &&
    row.attempt === undefined &&
    row.dedupeKey === `context:${revision}` &&
    Array.isArray(row.readKeys) &&
    row.readKeys.length === 1 &&
    row.readKeys[0] === 'runtime-context' &&
    Object.keys(row).every(key =>
      ['tenant', 'session', 'position', 'dedupeKey', 'readKeys', 'payload'].includes(key),
    )
  )
}
/** The application may classify our records without reading provider-private JSON. */
export function inspectContextLogEntry(
  suppliedScope: SessionScope,
  input: LogEntry,
): { readonly event: ContextEvent } | { readonly invalid: true } | { readonly unrelated: true } {
  const scope = checkedScope(suppliedScope),
    copied = copyJsonValue(input)
  if (!scope || 'failed' in copied || !object(copied.ok)) return { invalid: true }
  const row = copied.ok
  if (!claimsContext(row)) return { unrelated: true }
  const payload = ownedContextPayload(row.payload)
  const event = decodeEvent(payload),
    tenant = parseTenantId(row.tenant)
  if (
    !event ||
    !sameScope(event.scope, scope) ||
    row.session !== scope.session ||
    !('ok' in tenant) ||
    !tenantIdEquals(tenant.ok, scope.tenant) ||
    !validEnvelope(row, event.revision)
  )
    return { invalid: true }
  return { event }
}

function ownedContextPayload(
  value: unknown,
): import('@omne-harness-lite/content-blocks').JsonValue | null {
  const outer = checkLogPayload(value)
  if (!('kind' in outer) || outer.kind !== 'fact') return null
  return outer.payload.owner === 'runtime-context' && outer.payload.version === '1'
    ? outer.payload.value
    : null
}
