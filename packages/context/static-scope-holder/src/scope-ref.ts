import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { decodeScopeRef, type ScopeRef } from '@omne-harness/runtime-context-contract'

function prefixOf(kind: string): string {
  return `static-scope:${kind}:`
}

export function staticScopeOf(kind: string, tenant: TenantId): ScopeRef {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new TypeError('a static scope requires a minted tenant')
  const decoded = decodeScopeRef({ ref: prefixOf(kind) + text.value })
  if (!('ok' in decoded)) throw new TypeError('a static scope requires a kind')
  return decoded.ok
}

export function staticScopeTenant(kind: string, scope: ScopeRef): TenantId | undefined {
  const prefix = prefixOf(kind)
  if (!scope.ref.startsWith(prefix)) return undefined
  const parsed = tenantCodec.parse(scope.ref.slice(prefix.length))
  if (!parsed.ok) return undefined
  return staticScopeOf(kind, parsed.value).ref === scope.ref ? parsed.value : undefined
}
