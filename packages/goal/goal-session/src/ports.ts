import type { PortRead } from '@omne-harness/goal'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  RoutedInput,
  SessionFailure,
  SessionId,
  SessionOperationId,
  WorkSnapshot,
} from '@omne-harness/session-contract'

export type Ordinary = Extract<RoutedInput, { kind: 'ordinary' }>
/** The answer of a call of Session. `unknown`: it is not known whether the call was committed. */
export type Called<T> = Readonly<{ ok: T }> | Readonly<{ failure: SessionFailure }> | 'unknown'
type At = Readonly<{ tenant: TenantId; session: SessionId }>

/** The calls of Session a goal makes. `accept` is made as the system principal of goals;
 * `work` as the work principal of the session it reads, which the assembly issues. */
export type SessionCalls = Readonly<{
  accept(
    input: At & Readonly<{ operation: SessionOperationId; value: Ordinary }>,
  ): Promise<Called<unknown>>
  work(input: At): Promise<PortRead<WorkSnapshot | null>>
  /** The latest entry of the session's history, or null when it has none yet. Read as the session itself. */
  head(input: At): Promise<PortRead<string | null>>
  drives(input: At & Readonly<{ work: WorkSnapshot }>): Promise<PortRead<boolean>>
  /** The input that opened the round in progress: its words, and its place in the history. Null when the history shows none. */
  opened(input: At): Promise<PortRead<Readonly<{ since: string; text: string }> | null>>
  /** One page of the tool results of the session after an entry, oldest first; `after` null reads from its beginning; `next` null: the end. */
  resultsAfter(
    input: At & Readonly<{ after: string | null; cursor: string | null }>,
  ): Promise<PortRead<HistoryResults>>
  callsAfter(
    input: At & Readonly<{ after: string | null; cursor: string | null }>,
  ): Promise<PortRead<HistoryResults>>
}>
export type HistoryResults = Readonly<{ entries: readonly unknown[]; next: string | null }>
