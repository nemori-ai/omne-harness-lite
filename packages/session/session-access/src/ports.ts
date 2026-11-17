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
import type { QueuedRequest } from './request-queue.ts'

export interface TargetTenantPrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
  resume(
    tenant: string,
    login: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
}

export type JournalRecord =
  | (Readonly<{ kind: 'enqueued' }> & QueuedRequest)
  | Readonly<{ kind: 'left'; tenant: string; session: string; acceptId: string }>

export interface RequestJournal {
  readonly pending: readonly QueuedRequest[]
  append(record: JournalRecord): Promise<boolean>
  close(): Promise<void>
}

export type PrincipalFact = Readonly<{
  tenant: TenantId
  account: string
  login: string
}>

export interface PrincipalFacts {
  describe(principal: Principal): PrincipalFact | undefined
}

export type SessionListEntry = Extract<
  AnswerOf<SessionProtocol['operations']['list-sessions']>,
  { outcome: 'succeeded' }
>['body']['sessions'][number]

export type SessionListPage = Readonly<{
  items: readonly SessionListEntry[]
  next: string | null
  completeness: 'complete' | 'partial'
}>

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

export type SessionAccessFaces = Readonly<{
  management: Pick<SessionManagement<Principal>, 'create'>
  work: Pick<
    SessionWork<Principal>,
    | 'accept'
    | 'queryOperation'
    | 'cancelRun'
    | 'stopCall'
    | 'retryRun'
    | 'readWaiting'
    | 'control'
    | 'readBackgroundCalls'
  >
  history: Pick<SessionHistory<Principal>, 'begin' | 'next'>
}>

export type RunFailureCause = Readonly<{ kind: string; detail: string | null }>

export type RunFailureReading =
  | Readonly<{ kind: 'cause'; cause: RunFailureCause }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unavailable' }>

export interface RunFailureCauses {
  read(
    input: Readonly<{ principal: Principal; tenant: TenantId; execution: string }>,
  ): Promise<RunFailureReading>
}

export type ResolvedDefinition = Readonly<{
  candidate: Adoption
  execution: Adoption
  entryContract: Adoption
  requiredIdentities: readonly Readonly<{ capability: string; name: string }>[]
  tenantDefaults: Adoption
  initialModelSelection?: SavedModelSelection
}>

export type DefinitionResolver = (definition: string) => ResolvedDefinition | undefined

export type SessionAccessSettings = Readonly<{
  defaultDefinition?: string | undefined
  maxPageBytes: number
  historyKinds: readonly string[]
  defaultListLimit: number
  maxListLimit: number
  requestQueueLimit: number
  requestRetryDelaysMs: readonly number[]
}>
