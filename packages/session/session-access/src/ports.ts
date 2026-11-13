// The ports this member asks for, in its own words. The application assembly adapts them: identity
// answers the two principal ports, the Session provider the faces, the deployment mapping the
// definitions. The handlers take each port at every call.
import type { AnswerOf, LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  Adoption,
  SavedModelSelection,
  SessionHistory,
  SessionManagement,
  SessionWork,
} from '@omne-harness/session-contract'
import type { SessionProtocol } from '@omne-harness/session-protocol'

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

/** One row of a session list, as `list-sessions` writes it: the times are already instants. */
export type SessionListEntry = Extract<
  AnswerOf<SessionProtocol['operations']['list-sessions']>,
  { outcome: 'succeeded' }
>['body']['sessions'][number]

/** One page of a session list. */
export type SessionListPage = Readonly<{
  items: readonly SessionListEntry[]
  /** The cursor of the next page; `null` when the list is read through. */
  next: string | null
  completeness: 'complete' | 'partial'
}>

/**
 * Lists the sessions of a tenant for a principal acting for it. `invalid` is a cursor it does not
 * recognise; `denied` is a principal that may not list this tenant, and it does not tell a tenant
 * with no sessions apart from one the principal may not see.
 */
export interface SessionListing {
  list(
    input: Readonly<{
      principal: Principal
      tenant: TenantId
      after: string | null
      limit: number
      includeArchived: boolean
    }>,
  ): Promise<
    | { readonly ok: SessionListPage }
    | { readonly refused: 'invalid' | 'denied' | 'basis-unavailable' }
  >
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
  /** The rows of a `list-sessions` page when the message gives no `limit`. */
  defaultListLimit: number
  /** The bound of `limit` on `list-sessions`. A larger `limit` is `invalid`. */
  maxListLimit: number
}>
