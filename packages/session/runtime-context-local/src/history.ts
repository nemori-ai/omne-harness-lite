import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { positiveInteger, type LogEntry } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { decode } from './codec.ts'
import type { ContextEvent } from './journal-types.ts'
import { object, sameScope } from './values.ts'

/** The application may classify our records without reading provider-private JSON. */
export function inspectContextLogEntry(suppliedScope: SessionScope, input: LogEntry):
  { readonly event: ContextEvent } | { readonly invalid: true } | { readonly unrelated: true } {
  const source = copyJsonValue(suppliedScope)
  if ('failed' in source || !object(source.ok) || Object.keys(source.ok).length !== 2) return { invalid: true }
  const tenantScope = parseTenantId(source.ok.tenant), session = parseOpaqueIdentifier(source.ok.session, 'SessionRef')
  if (!('ok' in tenantScope) || !('ok' in session)) return { invalid: true }
  const scope = { tenant: tenantScope.ok, session: session.ok }
  const copied = copyJsonValue(input)
  if ('failed' in copied || !object(copied.ok)) return { invalid: true }
  const row = copied.ok
  const payload = row.payload
  const claims = (typeof row.dedupeKey === 'string' && row.dedupeKey.startsWith('context:')) ||
    (Array.isArray(row.readKeys) && row.readKeys.includes('runtime-context')) ||
    (object(payload) && typeof payload.codec === 'string' &&
      (payload.codec === 'runtime-context' || payload.codec.startsWith('runtime-context/')))
  if (!claims) return { unrelated: true }
  const event = decode('Event', payload)
  const tenant = parseTenantId(row.tenant)
  if (!event || !sameScope(event.scope, scope) || row.session !== scope.session ||
      !('ok' in tenant) || !tenantIdEquals(tenant.ok, scope.tenant) ||
      !positiveInteger(row.position) || row.run !== undefined || row.attempt !== undefined ||
      row.dedupeKey !== `context:${event.revision}` || !Array.isArray(row.readKeys) ||
      row.readKeys.length !== 1 || row.readKeys[0] !== 'runtime-context' ||
      Object.keys(row).some(key => !['tenant', 'session', 'position', 'dedupeKey', 'readKeys', 'payload'].includes(key)))
    return { invalid: true }
  return { event }
}
