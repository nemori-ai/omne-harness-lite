import type { RuntimeContextAuthority, ScopeBindingSource } from './authority.js'

export type RuntimeContextTrust<P> = Readonly<{
  authority: RuntimeContextAuthority<P>
  bindings: ScopeBindingSource
}>
