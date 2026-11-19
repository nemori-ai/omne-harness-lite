import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { EntryId, SessionId, SessionRevision } from '@omne-harness/session-contract'
import type { IndexDocument } from './extract.ts'
import type { JudgeSpec, Verdict } from './query.ts'

export type LoggedSession = Readonly<{
  session: SessionId
  tail: SessionRevision
  archived: boolean
}>

/** Log heads of a tenant only move on: two reads with one stamp read the same sessions. */
export type LogStamp = Readonly<{ sessions: number; total: string; archived: number }>

/** One searchable entry judged against a query where the log lies; `at`: its commit's time, if recorded. */
export type Judged = Readonly<{
  position: EntryId
  revision: SessionRevision
  at: number | null
  match: Verdict | null
}>

export type Extracted = Readonly<{
  position: EntryId
  revision: SessionRevision
  at: number | null
  documents: readonly IndexDocument[]
}>

/** Whole commits in log order, up to `through`; `bytes` is the stored size of what was read. */
export type LogPage<T> = Readonly<{
  entries: readonly T[]
  through: SessionRevision
  exhausted: boolean
  bytes: number
}>

export type LogPoint = Readonly<{ session: SessionId; position: EntryId }>

export type LogRange = Readonly<{
  tenant: TenantId
  session: SessionId
  after: SessionRevision
  maxBytes: number
}>

// How the search reads the log. The log stays the authority and the index only names candidates;
// entries are judged and turned into rows where their bytes are read, and only the outcome travels.
export interface HistoryLogReader {
  stamp(tenant: TenantId): Promise<Outcome<LogStamp, 'unavailable'>>
  sessions(tenant: TenantId): Promise<Outcome<readonly LoggedSession[], 'unavailable'>>
  /** Whole commits of a session after a revision, each entry judged against the spec. */
  judge(
    input: LogRange & Readonly<{ spec: JudgeSpec }>,
  ): Promise<Outcome<LogPage<Judged>, 'unavailable'>>
  judgeAt(
    input: Readonly<{ tenant: TenantId; points: readonly LogPoint[]; spec: JudgeSpec }>,
  ): Promise<Outcome<readonly (Judged | null)[], 'unavailable'>>
  extract(input: LogRange): Promise<Outcome<LogPage<Extracted>, 'unavailable'>>
}
