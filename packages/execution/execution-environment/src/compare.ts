import { tenantEquals } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { EnvironmentBinding } from '@omne-harness/execution-environment-contract'

export function sameScope(left: ScopeRef | undefined, right: ScopeRef | undefined): boolean {
  return left?.ref === right?.ref
}

/**
 * Whether two bindings name the same layer and owner. `left` is the trusted side; `right` may come
 * from a caller and is only read field by field, so a malformed value compares unequal.
 */
export function sameBinding(left: EnvironmentBinding, right: EnvironmentBinding): boolean {
  switch (left.kind) {
    case 'host_machine':
      return right.kind === 'host_machine'
    case 'stateless_sandbox':
      return (
        right.kind === 'stateless_sandbox' &&
        left.origin === right.origin &&
        sameScope(left.scope, right.scope)
      )
    case 'session_sandbox':
      return right.kind === 'session_sandbox' && sameScope(left.scope, right.scope)
    case 'tenant_sandbox':
      return right.kind === 'tenant_sandbox' && tenantEquals(left.tenant, right.tenant)
    default: {
      const exhaustive: never = left
      return exhaustive
    }
  }
}

/** Compares two key lists as sets: order and repetition do not matter. */
export function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  return leftSet.size === rightSet.size && [...leftSet].every(key => rightSet.has(key))
}
