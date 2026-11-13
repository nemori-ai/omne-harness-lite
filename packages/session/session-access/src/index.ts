// The access plugin of `session/v1`: the contribution (seven handlers and the frame source of
// `observe-session`) and the ports it asks the assembly for. The Cordis binding is `./cordis`.
export { createSessionContribution, type SessionContributionInput } from './contribution.ts'
export type {
  DefinitionResolver,
  PrincipalFact,
  PrincipalFacts,
  ResolvedDefinition,
  SessionAccessFaces,
  SessionAccessSettings,
  TargetTenantPrincipals,
} from './ports.ts'
