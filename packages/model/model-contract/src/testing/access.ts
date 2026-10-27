// The test control plane that the public doubles share: a rule table keyed by the minted tenant
// text and the principal. It is not a production access check; it answers only what the test set.
import { tenantCodec, type Access } from '@omne-harness/legal-identity'
import { ScriptedModelError } from './error.ts'

/** What the control plane says about one access: the default for an unlisted access is `deny`. */
export type ScriptedAccessDecision = 'allow' | 'deny' | 'unavailable'

export type AccessRules<P> = Readonly<{
  /** Sets the decision for this tenant and principal; a tenant that is not minted is a misuse. */
  set(access: Access<P>, decision: ScriptedAccessDecision): void
  /** The decision for this access; an unminted tenant or an unlisted access is `deny`. */
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
      const encoded = tenantCodec.encode(access.tenant)
      if (!encoded.ok)
        throw new ScriptedModelError('invalid-script', 'the access tenant is not a legal identity')
      const found = find(encoded.value, access.principal)
      if (found !== undefined) found.decision = decision
      else rules.push({ tenant: encoded.value, principal: access.principal, decision })
    },
    decide(access) {
      const encoded = tenantCodec.encode(access.tenant)
      if (!encoded.ok) return 'deny'
      return find(encoded.value, access.principal)?.decision ?? 'deny'
    },
  }
}
