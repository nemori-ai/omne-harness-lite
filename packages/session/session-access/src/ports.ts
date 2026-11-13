// The ports this member asks for, in its own words. The application assembly adapts them: identity
// answers the two principal ports, the Session provider the faces, the deployment mapping the
// definitions. The handlers take each port at every call.
import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  Adoption,
  SavedModelSelection,
  SessionHistory,
  SessionManagement,
  SessionWork,
} from '@omne-harness/session-contract'

/**
 * Issues the principal of this login for this target tenant. The rule belongs to identity: the
 * account of the target tenant must be the account of the login.
 */
export interface TargetTenantPrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
}

/** The facts of an issued principal that the derived identities of Session need. */
export type PrincipalFact = Readonly<{
  /** The tenant the principal acts for. */
  tenant: TenantId
  /** The account text of the login the principal was issued for. */
  account: string
  /** The login text of the login the principal was issued for. */
  login: string
}>

/**
 * Reads the facts of a principal that the pipeline or `TargetTenantPrincipals` issued.
 * `undefined` means the principal is not one issued for a login.
 */
export interface PrincipalFacts {
  describe(principal: Principal): PrincipalFact | undefined
}

/** The Session faces the seven operations reach. The real Session service satisfies it structurally. */
export type SessionAccessFaces = Readonly<{
  management: Pick<SessionManagement<Principal>, 'create'>
  work: Pick<SessionWork<Principal>, 'accept' | 'queryOperation' | 'cancelRun' | 'stopCall'>
  history: Pick<SessionHistory<Principal>, 'begin' | 'next'>
}>

/**
 * What the deployment mapping resolves a definition name into: the parts of a session creation
 * that the message does not carry. `modes` take the tenant default whose source is `tenantDefaults`.
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

/** The deployment values the handlers read. */
export type SessionAccessSettings = Readonly<{
  /** The definition `create-session` uses when the message names none. Absent: such a call is `invalid`. */
  defaultDefinition?: string
  /** The bound of `pageBytes` on a first `read-history` page. */
  maxPageBytes: number
  /** The entry kinds `read-history` gives. */
  historyKinds: readonly string[]
}>
