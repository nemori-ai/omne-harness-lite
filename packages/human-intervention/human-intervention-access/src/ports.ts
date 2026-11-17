import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import type {
  HumanInterventionCommands,
  HumanInterventionQueries,
  OperationRef,
  SubmitReply,
} from '@omne-harness/human-intervention'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { AccountId, TenantId } from '@omne-harness/legal-identity'

export type HitlFaces = Readonly<{
  queries: Pick<
    HumanInterventionQueries<ActingForTenantPrincipal>,
    'listPool' | 'getCard' | 'getOperation'
  >
  commands: Pick<HumanInterventionCommands<ActingForTenantPrincipal>, 'submitReply'>
  bindSubmitReply(
    command: SubmitReply,
  ): Readonly<{ operationRef: OperationRef; inputDigest: string }>
}>

export type HitlEntryIssue =
  | Readonly<{ kind: 'issued'; principal: ActingForTenantPrincipal }>
  | Readonly<{ kind: 'refused' }>

export interface HitlEntryPrincipals {
  issue(input: Readonly<{ account: AccountId; tenant: TenantId }>): Promise<HitlEntryIssue>
}

export interface LoginTenants {
  admits(login: LoginIdentity, tenant: string): Promise<'admitted' | 'denied' | 'basis-unavailable'>
}

export type HitlAccessSettings = Readonly<{ locationRef: string }>

export type CardChangeListener = Readonly<{ changed(): void; closed(): void }>

export interface CardChanges {
  subscribe(tenant: string, listener: CardChangeListener): () => void
}
