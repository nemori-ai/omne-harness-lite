import type {
  CalendarCallContext,
  CalendarId,
  CalendarProbeInput,
  CalendarProbeObservation,
  CalendarRefreshInput,
  CalendarSeedPack,
  CalendarSourceStanding,
  Instant,
} from '@omne-harness/calendar-contract'
import type {
  CalendarDispositionCommand,
  CalendarOperationQuery,
  CalendarPendingReaction,
  CalendarPersistence,
  CalendarReadResult,
  CalendarRepository,
} from '../persistence.ts'
import type { SupplyIndependenceRegistration } from '../supply/types.ts'

export type CalendarSupplyAuthorityResult =
  | Readonly<{ kind: 'allowed'; authorityGuardRefs: readonly string[] }>
  | Readonly<{ kind: 'denied' | 'unavailable'; reason: string }>
export interface CalendarSupplyAuthority {
  check(
    input: Readonly<{
      context: CalendarCallContext
      action: 'probe' | 'refresh' | 'importSeed' | 'queryPublication' | 'health' | 'reaction'
      calendarId: CalendarId | null
    }>,
  ): Promise<CalendarSupplyAuthorityResult>
}
export type CalendarSourceMaterial = Readonly<{
  sourceId: string
  content: Uint8Array
  mediaType: string
  acquiredAt: Instant
  knowledgeAsOf: Instant
  lineageRef: string
  authorityRef: string
}>
export type CalendarSourceAcquisition =
  | Readonly<{ kind: 'acquired'; material: CalendarSourceMaterial }>
  | Readonly<{ kind: 'unavailable'; reason: string }>
export interface CalendarSourceAdapter {
  readonly sourceId: string
  probe(
    input: Readonly<{ previous: CalendarProbeObservation | null; observedAt: Instant }>,
    options?: Readonly<{ signal?: AbortSignal }>,
  ): Promise<CalendarProbeObservation>
  acquire(
    input: Readonly<{ acquiredAt: Instant }>,
    options?: Readonly<{ signal?: AbortSignal }>,
  ): Promise<CalendarSourceAcquisition>
}
export type CalendarStoredMaterial = Readonly<{
  reference: string
  rawHash: string
  material: CalendarSourceMaterial
}>
export interface CalendarSourceMaterialStore {
  preserve(material: CalendarSourceMaterial): Promise<CalendarReadResult<CalendarStoredMaterial>>
  read(
    input: Readonly<{ reference: string }>,
  ): Promise<CalendarReadResult<CalendarStoredMaterial | null>>
  readSeed(
    input: Readonly<{ packRef: string; packHash: string }>,
  ): Promise<CalendarReadResult<CalendarSeedPack>>
}
export type CalendarJournalScope = Readonly<{ systemScopeRef: string; calendarId: CalendarId }>
export type CalendarPreparedRun = Readonly<{
  command: CalendarDispositionCommand
  preparedAt: Instant
}>
export type CalendarJournalResult<T> =
  | Readonly<{ kind: 'ok'; value: T }>
  | Readonly<{ kind: 'conflict' | 'unavailable' | 'unknown'; reason: string }>
export type CalendarRunCompletion = Readonly<{
  operationRef: string
  completedAt: Instant
  disposition: 'published' | 'noChange' | 'withheld' | 'rejected'
}>
export type CalendarJournalHealth = Readonly<{
  sources: readonly CalendarSourceStanding[]
  consecutiveFailures: number
  lastSuccess: Instant | null
  pendingRuns: readonly CalendarPreparedRun[]
}>
export interface CalendarSupplyJournal {
  findRun(
    input: Readonly<{ systemScopeRef: string; operationRef: string }>,
  ): Promise<CalendarJournalResult<CalendarPreparedRun | null>>
  readRun(query: CalendarOperationQuery): Promise<CalendarJournalResult<CalendarPreparedRun | null>>
  /** Atomically keeps the first prepared command for address+fingerprint; a different fingerprint conflicts. */
  prepareRun(run: CalendarPreparedRun): Promise<CalendarJournalResult<CalendarPreparedRun>>
  /** Exactly once per original run; published/noChange advance success, withheld/rejected increment failures. */
  completeRun(
    input: CalendarOperationQuery & CalendarRunCompletion,
  ): Promise<CalendarJournalResult<null>>
  readProbe(
    input: CalendarJournalScope & Readonly<{ operationKey: string; fingerprint: string }>,
  ): Promise<CalendarJournalResult<CalendarSourceStanding | null>>
  /** Atomically records observation, due date and source counters; replay never increments counters. */
  recordProbe(
    input: CalendarJournalScope &
      Readonly<{
        operationKey: string
        fingerprint: string
        policyVersion: string
        observation: CalendarProbeObservation
        nextDue: Instant
      }>,
  ): Promise<CalendarJournalResult<CalendarSourceStanding>>
  health(scope: CalendarJournalScope): Promise<CalendarJournalResult<CalendarJournalHealth>>
  due(
    input: Readonly<{ systemScopeRef: string; at: Instant; limit: number }>,
  ): Promise<CalendarJournalResult<readonly CalendarProbeInput[]>>
  pending(
    input: Readonly<{ systemScopeRef: string; limit: number }>,
  ): Promise<CalendarJournalResult<readonly CalendarPreparedRun[]>>
}
export interface CalendarReactionSink {
  handoff(
    input: CalendarPendingReaction,
  ): Promise<
    | Readonly<{ kind: 'accepted'; handoffRef: string }>
    | Readonly<{ kind: 'unavailable'; reason: string }>
  >
}
export interface CalendarSupplyDependencies {
  readonly repository: CalendarRepository
  readonly persistence: CalendarPersistence
  readonly authority: CalendarSupplyAuthority
  readonly materials: CalendarSourceMaterialStore
  readonly journal: CalendarSupplyJournal
  readonly sourceAdapters: readonly CalendarSourceAdapter[]
  readonly independenceRegistry: readonly SupplyIndependenceRegistration[]
  readonly reactionSink?: CalendarReactionSink
  readonly clock?: Readonly<{ now(): Instant }>
  readonly ids?: Readonly<{ versionId(): string }>
}
export type CalendarRefreshRequest = Readonly<{
  context: CalendarCallContext
  input: CalendarRefreshInput
}>
