import type {
  CalendarId,
  CalendarSnapshot,
  CalendarVersionId,
  Instant,
} from '@omne-harness/calendar-contract'

export type CalendarOperationAddress = Readonly<{
  protocol: 'omne.calendar-schedule/1'
  systemScopeRef: string
  operation: 'refresh' | 'importSeed'
  calendarId: CalendarId
  operationKey: string
}>

export type CalendarSourceEvidence = Readonly<{
  sourceId: string
  role: 'truth' | 'oracle' | 'exceptionFeed' | 'horizonProbe'
  lineageRef: string
  authorityRef: string
  acquiredAt: Instant
  knowledgeAsOf: Instant
  rawHash: string
  rawReference: string
}>

export type CalendarCandidate = Readonly<{
  snapshot: Omit<CalendarSnapshot, 'publicationGeneration'> | null
  semanticBoundary: string
  sources: readonly CalendarSourceEvidence[]
  differences: readonly string[]
  reasons: readonly string[]
}>

export type CalendarDisposition =
  | Readonly<{ kind: 'publish'; snapshot: Omit<CalendarSnapshot, 'publicationGeneration'> }>
  | Readonly<{ kind: 'noChange' | 'withheld' | 'rejected' }>

export type CalendarDispositionCommand = Readonly<{
  address: CalendarOperationAddress
  expectedFingerprint: string
  expectedGeneration: number
  authorityGuardRefs: readonly string[]
  policyHash: string
  candidate: CalendarCandidate
  disposition: CalendarDisposition
}>

export type CalendarPublishedReference = Readonly<{
  versionId: CalendarVersionId
  publicationGeneration: number
}>

export type CalendarPublicationReceipt = Readonly<{
  operationRef: string
  address: CalendarOperationAddress
  fingerprint: string
  candidateRef: string
  disposition: 'published' | 'noChange' | 'withheld' | 'rejected'
  current: CalendarPublishedReference | null
  outboxId: string | null
}>

export type CalendarPersistenceFailure = Readonly<{
  kind: 'rejected'
  reason:
    | 'invalid'
    | 'operationKeyConflict'
    | 'generationConflict'
    | 'versionConflict'
    | 'contentHashConflict'
    | 'staleSeed'
    | 'authorityRejected'
    | 'providerUnavailable'
  message: string
}>

export type CalendarCommitResult =
  | Readonly<{ kind: 'recorded'; receipt: CalendarPublicationReceipt; replayed: boolean }>
  | Readonly<{ kind: 'unknown'; operationRef: string }>
  | CalendarPersistenceFailure

export type CalendarOperationQuery = Readonly<{
  address: CalendarOperationAddress
  expectedFingerprint: string
}>

export type CalendarOperationObservation =
  | CalendarCommitResult
  | Readonly<{ kind: 'notCommitted'; operationRef: string }>

export type CalendarReadResult<T> =
  | Readonly<{ kind: 'ok'; value: T }>
  | Readonly<{ kind: 'unavailable'; reason: string }>
  | Readonly<{ kind: 'invalid'; message: string }>

export type CalendarPageRequest = Readonly<{ after: string | null; limit: number }>
export type CalendarPage<T> = Readonly<{ items: readonly T[]; nextCursor: string | null }>
export type CalendarDirectoryEntry = Readonly<{
  calendarId: CalendarId
  semanticBoundary: string
  timezone: string
  current: CalendarPublishedReference
}>
export type CalendarVersionEntry = Readonly<{
  calendarId: CalendarId
  versionId: CalendarVersionId
  publicationGeneration: number
  coverageStart: CalendarSnapshot['coverageStart']
  coverageEnd: CalendarSnapshot['coverageEnd']
  knowledgeAsOf: Instant
  synthesizedAt: Instant
  contentHash: string
  provenanceRefs: readonly string[]
}>
export type CalendarCandidateRecord = Readonly<{
  candidateRef: string
  command: CalendarDispositionCommand
  receipt: CalendarPublicationReceipt
}>
export type CalendarPendingReaction = Readonly<{
  id: string
  operationRef: string
  calendarId: CalendarId
  versionId: CalendarVersionId
  publicationGeneration: number
}>
export type CalendarReactionAcknowledgement = Readonly<{
  acknowledgementKey: string
  id: string
  operationRef: string
  handoffRef: string
  authorityGuardRefs: readonly string[]
}>
export type CalendarAcknowledgementResult =
  | Readonly<{ kind: 'acknowledged' }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{
      kind: 'rejected'
      reason: 'notFound' | 'invalid' | 'authorityRejected' | 'providerUnavailable'
    }>

export interface CalendarRepository {
  listCalendars(
    input: CalendarPageRequest,
  ): Promise<CalendarReadResult<CalendarPage<CalendarDirectoryEntry>>>
  listVersions(
    input: CalendarPageRequest & { readonly calendarId: CalendarId },
  ): Promise<CalendarReadResult<CalendarPage<CalendarVersionEntry>>>
  getSnapshot(
    input: Readonly<{
      calendarId: CalendarId
      version:
        | { readonly kind: 'current' }
        | { readonly kind: 'pinned'; readonly versionId: CalendarVersionId }
    }>,
  ): Promise<CalendarReadResult<CalendarSnapshot | null>>
  getCandidate(
    input: Readonly<{ candidateRef: string }>,
  ): Promise<CalendarReadResult<CalendarCandidateRecord | null>>
  listCandidates(
    input: CalendarPageRequest & { readonly calendarId: CalendarId },
  ): Promise<CalendarReadResult<CalendarPage<CalendarCandidateRecord>>>
  listPendingReactions(
    input: CalendarPageRequest,
  ): Promise<CalendarReadResult<CalendarPage<CalendarPendingReaction>>>
}

export interface CalendarPersistence {
  commitDisposition(input: CalendarDispositionCommand): Promise<CalendarCommitResult>
  observeOperation(input: CalendarOperationQuery): Promise<CalendarOperationObservation>
  acknowledgeReaction(
    input: CalendarReactionAcknowledgement,
  ): Promise<CalendarAcknowledgementResult>
}
