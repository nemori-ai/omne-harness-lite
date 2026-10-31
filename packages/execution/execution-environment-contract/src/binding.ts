import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { OriginRef } from './identity.ts'

/** Binding layer: the lifetime class of an environment plus its owner. */
export type EnvironmentBinding =
  | { readonly kind: 'host_machine' }
  | { readonly kind: 'stateless_sandbox'; readonly scope: ScopeRef; readonly origin: OriginRef }
  | { readonly kind: 'session_sandbox'; readonly scope: ScopeRef }
  | { readonly kind: 'tenant_sandbox'; readonly tenant: TenantId }

export type BindingKind = EnvironmentBinding['kind']

/** Whether the environment can be used continuously at this moment. It is not a lifetime. */
export type EnvironmentContinuity =
  | { readonly kind: 'not_guaranteed' }
  | { readonly kind: 'continuous'; readonly data: string; readonly revision: string }
  | { readonly kind: 'lost'; readonly previous: string }

export const bindingKinds: readonly BindingKind[] = Object.freeze([
  'host_machine',
  'stateless_sandbox',
  'session_sandbox',
  'tenant_sandbox',
])

/** The scope that owns a binding, when the binding layer has one. */
export function bindingScope(binding: EnvironmentBinding): ScopeRef | undefined {
  switch (binding.kind) {
    case 'stateless_sandbox':
    case 'session_sandbox':
      return binding.scope
    case 'host_machine':
    case 'tenant_sandbox':
      return undefined
    default: {
      const exhaustive: never = binding
      return exhaustive
    }
  }
}
