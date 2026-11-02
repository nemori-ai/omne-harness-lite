// The ports this member needs from its neighbours, declared in this member's own words. The real
// Session service satisfies `SessionIngressFaces` structurally; the definition mapping is a
// function the assembly injects (the `definition-mappings` member owns the mapping data).
import type {
  Adoption,
  SavedModelSelection,
  SessionHistory,
  SessionManagement,
  SessionWork,
} from '@omne-harness/session-contract'

/** The subset of the Session faces that the public session operations reach. */
export type SessionIngressFaces<P> = Readonly<{
  management: Pick<SessionManagement<P>, 'create'>
  work: Pick<SessionWork<P>, 'accept' | 'queryOperation' | 'cancelRun' | 'stopCall'>
  history: Pick<SessionHistory<P>, 'begin' | 'next'>
}>

/**
 * What the deployment mapping resolves a public definition name into: the parts of a
 * `SessionCreation` that the public message does not carry. `modes` take the tenant default whose
 * source is `tenantDefaults`.
 */
export type ResolvedDefinition = Readonly<{
  candidate: Adoption
  execution: Adoption
  entryContract: Adoption
  requiredIdentities: readonly Readonly<{ capability: string; name: string }>[]
  tenantDefaults: Adoption
  initialModelSelection?: SavedModelSelection
}>

/** Resolves a definition name. `undefined` means the name is outside the deployment set. */
export type DefinitionResolver = (definition: string) => ResolvedDefinition | undefined
