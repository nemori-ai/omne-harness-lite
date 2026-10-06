import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'

export function ownScope(value: unknown): SessionScope | undefined {
  const copied = copyJsonValue(value)
  if (
    'failed' in copied ||
    copied.ok === null ||
    typeof copied.ok !== 'object' ||
    Array.isArray(copied.ok)
  )
    return undefined
  const scope = copied.ok as Record<string, unknown>
  if (
    Object.keys(scope).length !== 2 ||
    !Object.hasOwn(scope, 'tenant') ||
    !Object.hasOwn(scope, 'session')
  )
    return undefined
  const tenant = parseTenantId(scope.tenant),
    session = parseOpaqueIdentifier(scope.session, 'SessionRef')
  return 'ok' in tenant && 'ok' in session
    ? Object.freeze({ tenant: Object.freeze(tenant.ok), session: session.ok })
    : undefined
}
