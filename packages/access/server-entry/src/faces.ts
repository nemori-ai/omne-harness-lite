import type {
  HumanInterventionCommands,
  HumanInterventionQueries,
  OperationRef,
  SubmitReply,
} from '@omne-harness/human-intervention'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { AccountId, TenantId } from '@omne-harness/legal-identity'
import type {
  Adoption,
  SavedModelSelection,
  SessionHistory,
  SessionManagement,
  SessionWork,
} from '@omne-harness/session-contract'

export type SessionIngressFaces<P> = Readonly<{
  management: Pick<SessionManagement<P>, 'create'>
  work: Pick<SessionWork<P>, 'accept' | 'queryOperation' | 'cancelRun' | 'stopCall'>
  history: Pick<SessionHistory<P>, 'begin' | 'next'>
}>

export type ResolvedDefinition = Readonly<{
  candidate: Adoption
  execution: Adoption
  entryContract: Adoption
  requiredIdentities: readonly Readonly<{ capability: string; name: string }>[]
  tenantDefaults: Adoption
  initialModelSelection?: SavedModelSelection
}>

export type DefinitionResolver = (definition: string) => ResolvedDefinition | undefined

export type HitlIngressFaces<P> = Readonly<{
  queries: Pick<HumanInterventionQueries<P>, 'listPool' | 'getCard' | 'getOperation'>
  commands: Pick<HumanInterventionCommands<P>, 'submitReply'>
  bindSubmitReply(
    command: SubmitReply,
  ): Readonly<{ operationRef: OperationRef; inputDigest: string }>
}>

export type HitlEntryIssue =
  | Readonly<{ kind: 'issued'; principal: ActingForTenantPrincipal }>
  | Readonly<{ kind: 'refused' }>

export type HitlEntryPrincipals = Readonly<{
  issue(input: Readonly<{ account: AccountId; tenant: TenantId }>): Promise<HitlEntryIssue>
}>
