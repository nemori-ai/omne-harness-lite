import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  EnvironmentBinding,
  OriginalAcquisition,
  Placement,
} from '@omne-harness/execution-environment-contract'

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

/** Copies a scope chain into owned data before the first await. A cycle ends the copy. */
export function copyScope(scope: ScopeRef, seen = new Set<object>()): ScopeRef {
  seen.add(scope)
  const parent = scope.parent
  if (parent === undefined || seen.has(parent)) return Object.freeze({ ref: scope.ref })
  return Object.freeze({ ref: scope.ref, parent: copyScope(parent, seen) })
}

function scopeChain(scope: ScopeRef | undefined): readonly string[] {
  const refs: string[] = []
  const seen = new Set<object>()
  for (let s = scope; s && !seen.has(s); s = s.parent) {
    seen.add(s)
    refs.push(s.ref)
  }
  return refs
}

/** The tenant text of a minted tenant, or undefined. Records and routes key on it. */
export function tenantText(tenant: TenantId): string | undefined {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? encoded.value : undefined
}

function bindingFacts(binding: EnvironmentBinding): readonly unknown[] {
  switch (binding.kind) {
    case 'host_machine':
      return [binding.kind]
    case 'stateless_sandbox':
      return [binding.kind, binding.origin, scopeChain(binding.scope)]
    case 'session_sandbox':
      return [binding.kind, scopeChain(binding.scope)]
    case 'tenant_sandbox':
      return [binding.kind, tenantText(binding.tenant) ?? null]
    default: {
      const exhaustive: never = binding
      return exhaustive
    }
  }
}

/**
 * The fingerprint of an original acquisition without its tenant, which the slot key already names:
 * quota domain, origin, the full scope chain, the binding, the provider identity, the continuity,
 * the facility and isolation sets, and the ordered allowed bindings.
 */
export function fingerprint(original: OriginalAcquisition): string {
  const p = original.placement
  return JSON.stringify([
    p.quotaDomain,
    original.origin,
    scopeChain(original.scope),
    bindingFacts(p.binding),
    [p.provider.name, p.provider.generation, p.provider.version],
    p.continuity,
    [...new Set(p.requirement.facilities)].sort(),
    [...new Set(p.requirement.isolation)].sort(),
    p.requirement.allowedBindings.map(bindingFacts),
  ])
}

/** Copies the data of a placement before the first await; tenant values keep their minted identity. */
export function copyPlacement(placement: Placement): Placement {
  const copyBinding = (binding: EnvironmentBinding): EnvironmentBinding => {
    switch (binding.kind) {
      case 'host_machine':
        return Object.freeze({ kind: binding.kind })
      case 'stateless_sandbox':
        return Object.freeze({
          kind: binding.kind,
          origin: binding.origin,
          scope: copyScope(binding.scope),
        })
      case 'session_sandbox':
        return Object.freeze({ kind: binding.kind, scope: copyScope(binding.scope) })
      case 'tenant_sandbox':
        return Object.freeze({ kind: binding.kind, tenant: binding.tenant })
      default: {
        const exhaustive: never = binding
        return exhaustive
      }
    }
  }
  return Object.freeze({
    kind: 'placement',
    requirement: Object.freeze({
      allowedBindings: Object.freeze(placement.requirement.allowedBindings.map(copyBinding)),
      facilities: Object.freeze([...placement.requirement.facilities]),
      isolation: Object.freeze([...placement.requirement.isolation]),
    }),
    binding: copyBinding(placement.binding),
    provider: Object.freeze({ ...placement.provider }),
    continuity: Object.freeze({ ...placement.continuity }),
    quotaDomain: placement.quotaDomain,
  })
}

/** Copies an original acquisition description before the first await. */
export function copyOriginal(original: OriginalAcquisition): OriginalAcquisition {
  return Object.freeze({
    tenant: original.tenant,
    acquisition: original.acquisition,
    origin: original.origin,
    scope: copyScope(original.scope),
    placement: copyPlacement(original.placement),
  })
}
