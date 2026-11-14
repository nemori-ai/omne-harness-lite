import {
  accountCodec,
  organizationCodec,
  systemScope,
  tenant,
  tenantScope,
  type ActingScope,
} from '@omne-harness/legal-identity'

function parsed<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('test identity text did not parse')
  return result.value
}

const BODY = '0123456789abcdefghjkmnpqrs'

export function aTenantScope(): ActingScope {
  return tenantScope(
    tenant(
      parsed(organizationCodec.parse(`org_${BODY}`)),
      parsed(accountCodec.parse(`acc_${BODY}`)),
    ),
  )
}

export function theSystemScope(): ActingScope {
  return systemScope()
}
