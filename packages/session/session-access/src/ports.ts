import type {
  AnswerOf,
  BodyOf,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  Adoption,
  DurableEvidence,
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

/** An item of either list; in the list of sessions not archived its archive fields are null. */
export type SessionListEntry = Extract<
  AnswerOf<SessionProtocol['operations']['list-archived-sessions']>,
  { outcome: 'succeeded' }
>['body']['sessions'][number]

export type SessionListPage = Readonly<{
  items: readonly SessionListEntry[]
  next: string | null
  completeness: 'complete' | 'partial'
}>

type ListingInput = Readonly<{
  principal: Principal
  tenant: TenantId
  after: string | null
  limit: number
}>
type ArchivedBody = BodyOf<SessionProtocol['operations']['list-archived-sessions']>
/** The archived list's filters as the protocol reads them; the times are instants, not text. */
export type ArchiveFilters = Readonly<{
  [K in 'from' | 'to' | 'by' | 'titleContains']-?: Exclude<ArchivedBody[K], undefined>
}>
type ListingAnswer = Promise<
  | { readonly ok: SessionListPage }
  | { readonly refused: 'invalid' | 'denied' | 'basis-unavailable' }
>

export interface SessionListing {
  list(input: ListingInput): ListingAnswer
  listArchived(input: ListingInput & ArchiveFilters): ListingAnswer
}

export type SessionAccessFaces = Readonly<{
  management: Pick<SessionManagement<Principal>, 'create' | 'interrupt' | 'change'>
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

/** What a model route resolves to for a session's selection: Model answers it, the release adapts. */
export type ModelTargetCheck =
  | Readonly<{
      kind: 'selectable'
      credential: 'available' | 'missing' | 'unknown'
      basis: DurableEvidence
    }>
  | Readonly<{
      kind: 'refused'
      reason: 'unknown-name' | 'withdrawn' | 'excluded' | 'modality' | 'locked' | 'scope'
    }>
  | Readonly<{ kind: 'unavailable' }>

export interface ModelTargets {
  check(
    input: Readonly<{ principal: Principal; tenant: TenantId; route: string }>,
  ): Promise<ModelTargetCheck>
}
