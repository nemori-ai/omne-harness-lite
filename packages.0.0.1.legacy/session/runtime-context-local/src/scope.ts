import { parseTenantId, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { own, object } from './values.ts'
export function checkedScope(scope: SessionScope): SessionScope | undefined {
  try {
    const value = own(scope)
    if (!object(value) || Object.keys(value).some(key => key !== 'tenant' && key !== 'session'))
      return undefined
    const tenant = parseTenantId(value.tenant),
      session = parseOpaqueIdentifier(value.session, 'SessionRef')
    return 'ok' in tenant && 'ok' in session
      ? Object.freeze({ tenant: Object.freeze(tenant.ok), session: session.ok })
      : undefined
  } catch {
    return undefined
  }
}
