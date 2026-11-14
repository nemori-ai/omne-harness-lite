import type { Access, ContextTarget } from './refs.js'
import type { AssemblyPolicies } from './ports.js'
import type { ContextSources } from './sources.js'
export type OperationContext<P> = Readonly<{
  access: Access<P>
  target: ContextTarget
  sources: ContextSources<P>
  policies: AssemblyPolicies
}>
