import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'

/** Another tenant's session and one that does not exist answer alike: the tool cannot tell them apart. */
export type SessionsFailure =
  | Readonly<{ kind: 'not-found' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'limited' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export type SessionsReply<T> = Promise<Readonly<{ ok: T }> | Readonly<{ failure: SessionsFailure }>>

export type SessionRelation = 'main' | 'child' | 'handoff'
export type SessionAttendance = 'attended' | 'unattended'
export type SessionSummary = Readonly<{
  session: string
  title: string | null
  state: string
  createdAt: string | null
  lastActivityAt: string | null
  archivedAt: string | null
  archivedBy: string | null
  relation: SessionRelation
  /** The parent of a child session, and the session a handed-over one came from. */
  parent: string | null
  origin: string | null
  depth: number
  attendance: SessionAttendance
  definition: string
}>
export type SessionsListPage = Readonly<{
  items: readonly SessionSummary[]
  next: string | null
  complete: boolean
}>
export type SessionsEntry = Readonly<{ position: string; kind: string; payload: unknown }>
export type SessionsHistoryPage = Readonly<{
  entries: readonly SessionsEntry[]
  next: string | null
  exhausted: boolean
  /** On a page of the conversation a forked session started from: the session those entries are of. */
  from?: string
}>
export type SessionsHit = Readonly<{
  session: string
  position: string
  kind: string
  at: string | null
  snippet: Readonly<{ before: string; match: string; after: string }>
}>
export type SessionsSearchPage = Readonly<{
  hits: readonly SessionsHit[]
  next: string | null
  complete: boolean
  incomplete: string | null
}>

export type SessionsListInput = Readonly<{
  archived: boolean
  title: string | null
  relation: SessionRelation | null
  parent: string | null
  attendance: SessionAttendance | null
  definition: string | null
  cursor: string | null
  limit: number
}>
export type SessionsReadInput = Readonly<{
  session: string
  cursor: string | null
  direction: 'forward' | 'backward'
  pageBytes: number
  /** First the conversation a forked session started from. */
  inherited?: true
  after?: string
}>
export type SessionsSearchInput = Readonly<{
  content:
    | Readonly<{ kind: 'literals'; all: readonly string[]; caseSensitive: boolean }>
    | Readonly<{ kind: 'regex'; pattern: string; caseSensitive: boolean }>
  sessions: readonly string[] | null
  archived: 'unarchived' | 'archived' | 'all'
  from: string | null
  to: string | null
  kinds: readonly string[]
  cursor: string | null
  limit: number
}>

/** The same reads a person makes, bound to one call's principal and tenant; nothing here writes. */
export type BoundSessions = Readonly<{
  list(input: SessionsListInput): SessionsReply<SessionsListPage>
  show(session: string): SessionsReply<SessionSummary>
  read(input: SessionsReadInput): SessionsReply<SessionsHistoryPage>
  search(input: SessionsSearchInput): SessionsReply<SessionsSearchPage>
}>

const attachments = new WeakMap<ToolExecutionContext, BoundSessions>()
export function sessionsOf(context: ToolExecutionContext): BoundSessions | undefined {
  return attachments.get(context)
}

/** Attach after other context-producing attachments. Finish removes the reads before delegation. */
export function attachSessions(
  scope: ToolExecutionScope,
  sessions: BoundSessions,
): ToolExecutionScope {
  const context = scope.context
  attachments.set(context, sessions)
  let finished: ReturnType<ToolExecutionScope['finish']> | undefined
  return {
    context,
    limits: scope.limits,
    finish(exit) {
      if (finished !== undefined) return finished
      attachments.delete(context)
      finished = Promise.resolve().then(() => scope.finish(exit))
      return finished
    },
  }
}
