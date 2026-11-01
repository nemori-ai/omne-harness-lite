import type { RuntimeContextAuthority, ScopeBindingSource } from './authority.js'

/**
 * The two original ports a trusted assembly hands to one Runtime Context instance. It is a
 * construction argument only: it adds no permission, no lifecycle and no third port.
 */
export type RuntimeContextTrust<P> = Readonly<{
  authority: RuntimeContextAuthority<P>
  bindings: ScopeBindingSource
}>
