import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { EntryId, SessionId, SessionRevision } from '@omne-harness/session-contract'
import type { IndexDocument } from './extract.ts'
import type { GramPlan } from './plan.ts'

/** The history index of one tenant. A generation is one build of it; a search reads one. */
export type IndexState =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'ready'; generation: number }>
  | Readonly<{
      kind: 'rebuilding'
      generation: number | null
      building: number
      progress: Progress
    }>
  | Readonly<{ kind: 'broken'; diagnostic: string }>

export type Progress = Readonly<{ indexed: number; total: number }>

/** The number of an index document, as decimal text: commit time, then a serial. Newer is larger. */
export type DocId = string

export type CandidateRow = Readonly<{ doc: DocId; session: SessionId; position: EntryId }>

/** How far a session is indexed, and the last commit time the index recorded in it (0: none). */
export type Cover = Readonly<{ through: SessionRevision; at: number }>

export type Candidates = Readonly<{
  /** The cover of each indexed session, read before the rows in one read transaction. */
  covered: ReadonlyMap<SessionId, Cover>
  rows: readonly CandidateRow[]
}>

export type CandidateRequest = Readonly<{
  tenant: TenantId
  generation: number
  plan: GramPlan
  sessions: readonly SessionId[] | null
  /** Applied exactly, by the time each row was appended with; the plan may let more through. */
  window: Readonly<{ from: number | null; to: number | null }>
  before: DocId | null
  limit: number
}>

export type AppendRequest = Readonly<{
  tenant: TenantId
  generation: number
  session: SessionId
  through: SessionRevision
  at: number
  documents: readonly IndexedEntry[]
}>

export type IndexedEntry = Readonly<{
  position: EntryId
  revision: SessionRevision
  at: number
  document: IndexDocument
}>

export type IndexFailure = 'generation-gone' | 'unavailable'

export interface HistoryIndex {
  state(tenant: TenantId): Promise<IndexState>
  candidates(input: CandidateRequest): Promise<Outcome<Candidates, IndexFailure>>
  covers(
    tenant: TenantId,
    generation: number,
  ): Promise<Outcome<ReadonlyMap<SessionId, Cover>, IndexFailure>>
  /** Rows and the cover in one commit. What lies at or behind the cover is not written again. */
  append(input: AppendRequest): Promise<Outcome<null, IndexFailure>>
  beginRebuild(
    tenant: TenantId,
    total: number,
  ): Promise<Outcome<{ generation: number }, 'unavailable'>>
  adopt(tenant: TenantId, generation: number): Promise<Outcome<null, IndexFailure>>
  compact(tenant: TenantId, pages: number): Promise<void>
}
