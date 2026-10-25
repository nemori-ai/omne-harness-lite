import type { Access, ContextTarget } from './refs.js'
import type { AssemblyPolicies } from './ports.js'
import type { ContextSources } from './sources.js'
/** What one operation call works with: this access, the bound target, its sources and policies. */
export type OperationContext<P> = Readonly<{
  access: Access<P>
  target: ContextTarget
  sources: ContextSources<P>
  policies: AssemblyPolicies
}>
