import { tenantCodec, type Access } from '@omne-harness/legal-identity'
import { tenantText } from './values.ts'

export type ScriptedAccessDecision = 'allow' | 'deny' | 'unavailable'

export type AccessRules<P> = Readonly<{
  set(access: Access<P>, decision: ScriptedAccessDecision): void
  decide(access: Access<P>): ScriptedAccessDecision
}>

export function createAccessRules<P>(
  samePrincipal: (left: P, right: P) => boolean = Object.is,
): AccessRules<P> {
  const rules: { tenant: string; principal: P; decision: ScriptedAccessDecision }[] = []
  function find(tenant: string, principal: P) {
    return rules.find(rule => rule.tenant === tenant && samePrincipal(rule.principal, principal))
  }
  return {
    set(access, decision) {
      const tenant = tenantText(access.tenant)
      const found = find(tenant, access.principal)
      if (found !== undefined) found.decision = decision
      else rules.push({ tenant, principal: access.principal, decision })
    },
    decide(access) {
      const encoded = tenantCodec.encode(access.tenant)
      if (!encoded.ok) return 'deny'
      return find(encoded.value, access.principal)?.decision ?? 'deny'
    },
  }
}
