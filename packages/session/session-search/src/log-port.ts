import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  EntryId,
  HistoryEntry,
  SessionId,
  SessionRevision,
} from '@omne-harness/session-contract'

/** One session of a tenant: the revision its log stands at, and whether it is archived. */
export type LoggedSession = Readonly<{
  session: SessionId
  tail: SessionRevision
  archived: boolean
}>

/** A log entry with the time of the commit that wrote it, in epoch milliseconds, if recorded. */
export type LoggedEntry = Readonly<{ entry: HistoryEntry; at: number | null }>

export type EntryPage = Readonly<{
  /** The searchable entries of whole commits, in log order. */
  entries: readonly LoggedEntry[]
  /** Every commit up to this revision is in this page or the pages before it. */
  through: SessionRevision
  exhausted: boolean
}>

export type LogPoint = Readonly<{ session: SessionId; position: EntryId }>

/** How the search reads the log: the log stays the authority, the index only names candidates. */
export interface HistoryLogReader {
  sessions(tenant: TenantId): Promise<Outcome<readonly LoggedSession[], 'unavailable'>>
  entries(
    input: Readonly<{
      tenant: TenantId
      session: SessionId
      after: SessionRevision
      maxBytes: number
    }>,
  ): Promise<Outcome<EntryPage, 'unavailable'>>
  /** One answer for each point, in order; null for a point that is not in the log. */
  at(
    input: Readonly<{ tenant: TenantId; points: readonly LogPoint[] }>,
  ): Promise<Outcome<readonly (LoggedEntry | null)[], 'unavailable'>>
}
