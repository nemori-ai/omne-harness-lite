import type { Context } from '@deepseek-ai/cordis'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { writeJsonText } from '@omne-harness/json-text'
import type {
  SessionDirectory,
  SessionFailure,
  SessionHistory,
  SessionId,
  SessionListFilter,
  SessionListItem,
  SessionListPage,
} from '@omne-harness/session-contract'
import { sessionKey, sessionSearchKey } from '@omne-harness/session-cordis-contract/cordis'
import type { HistorySearch, HistorySearchFailure, SearchQuery } from '@omne-harness/session-search'
import {
  attachSessions,
  type BoundSessions,
  type SessionsFailure,
  type SessionsListInput,
  type SessionSummary,
} from '@omne-harness/session-tools'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { LOCAL_HISTORY_KINDS } from '../../local/operator-defaults.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { domainCallerOf } from './domain-caller.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>
export type SessionsBindingPorts = Readonly<{
  verifier(): PrincipalVerifier | undefined
  directory(): SessionDirectory<unknown> | undefined
  history(): SessionHistory<unknown> | undefined
  search(): HistorySearch<unknown> | undefined
}>

/** `show` finds one session by walking the two lists; past this many pages it stops and says so. */
const SHOW_PAGES = 20
const SHOW_PAGE = 100
const absent = (what: string) => ({
  failure: { kind: 'unavailable', diagnostic: `${what} is not available` } as const,
})

function failureOf(failure: SessionFailure | HistorySearchFailure): SessionsFailure {
  switch (failure.kind) {
    case 'denied':
      return { kind: 'denied' }
    case 'not-found':
      return { kind: 'not-found' }
    case 'invalid':
      return { kind: 'invalid', field: failure.field, reason: failure.reason }
    case 'limited':
      return { kind: 'limited' }
    case 'unavailable':
      return { kind: 'unavailable', diagnostic: failure.diagnostic }
    default:
      return { kind: 'unavailable', diagnostic: `the session answered ${failure.kind}` }
  }
}

const summaryOf = (item: SessionListItem): SessionSummary => ({
  session: item.session,
  title: item.title,
  state: item.lifecycle,
  createdAt: item.createdAt,
  lastActivityAt: item.lastActivityAt,
  archivedAt: item.archivedAt,
  archivedBy: item.archivedBy,
  relation: item.relation.kind,
  parent: item.relation.kind === 'child' ? item.relation.parent : null,
  origin: item.relation.kind === 'handoff' ? item.relation.origin : null,
  depth: item.depth,
  attendance: item.attendance,
  definition: item.definition,
})
/** What the list narrows by, as the directory reads it: what was not given narrows nothing. */
function filterOf(input: SessionsListInput): SessionListFilter {
  const { relation, parent, attendance, definition } = input
  return {
    ...(relation === null ? {} : { kind: relation }),
    ...(parent === null ? {} : { parent: parent as SessionId }),
    ...(attendance === null ? {} : { attendance }),
    ...(definition === null ? {} : { definition }),
  }
}
const pageOf = (page: SessionListPage) => ({
  items: page.items.map(summaryOf),
  next: page.next,
  complete: page.completeness === 'complete',
})
const millisOf = (instant: string | null) => (instant === null ? null : Date.parse(instant))
const isoOf = (millis: number | null) =>
  millis === null || Number.isNaN(new Date(millis).getTime())
    ? null
    : new Date(millis).toISOString()

type Listing = (after: string | null) => ReturnType<SessionDirectory<unknown>['list']>

/** One list walked for one session: found, not in it, or walked as far as allowed. */
async function findIn(
  list: Listing,
  session: string,
): Promise<
  Readonly<{ found: SessionListItem }> | Readonly<{ failure: SessionsFailure }> | 'absent'
> {
  let after: string | null = null
  for (let pages = 0; pages < SHOW_PAGES; pages++) {
    const page = await list(after)
    if ('failure' in page) return { failure: failureOf(page.failure) }
    const found = page.ok.items.find(item => item.session === session)
    if (found !== undefined) return { found }
    if (page.ok.next === null) return 'absent'
    after = page.ok.next
  }
  return { failure: { kind: 'limited' } }
}

/** The reads of one call: the call's principal and tenant, never anything the model named. */
export function createBoundSessions(parent: Parent, ports: SessionsBindingPorts): BoundSessions {
  const { principal, tenant } = parent
  // Only a verified session work principal of this tenant reads; the access check then decides.
  const admitted = async () =>
    (await domainCallerOf(ports.verifier(), principal, tenant)) !== undefined
  const access = { principal, tenant }
  return {
    async list(input) {
      const { archived, title, cursor, limit } = input
      const directory = ports.directory()
      if (directory === undefined) return absent('the session directory')
      if (!(await admitted())) return { failure: { kind: 'denied' } }
      const asked = { ...access, after: cursor, limit, filter: filterOf(input) }
      const page = archived
        ? await directory.listArchived({
            ...asked,
            from: null,
            to: null,
            by: null,
            titleContains: title,
          })
        : await directory.list(asked)
      return 'failure' in page ? { failure: failureOf(page.failure) } : { ok: pageOf(page.ok) }
    },
    async show(session) {
      const directory = ports.directory()
      if (directory === undefined) return absent('the session directory')
      if (!(await admitted())) return { failure: { kind: 'denied' } }
      const lists: readonly Listing[] = [
        after => directory.list({ ...access, after, limit: SHOW_PAGE }),
        after =>
          directory.listArchived({
            ...access,
            after,
            limit: SHOW_PAGE,
            from: null,
            to: null,
            by: null,
            titleContains: null,
          }),
      ]
      for (const list of lists) {
        const walked = await findIn(list, session)
        if (walked === 'absent') continue
        return 'found' in walked ? { ok: summaryOf(walked.found) } : walked
      }
      return { failure: { kind: 'not-found' } }
    },
    async read({ session, cursor, direction, pageBytes }) {
      const history = ports.history()
      if (history === undefined) return absent('the session history')
      if (!(await admitted())) return { failure: { kind: 'denied' } }
      const target = { ...access, session: session as SessionId }
      const page =
        cursor === null
          ? await history.begin({
              ...target,
              kinds: LOCAL_HISTORY_KINDS,
              from: null,
              direction,
              pageBytes,
            })
          : await history.next({ ...target, cursor })
      if ('failure' in page) return { failure: failureOf(page.failure) }
      const entries = page.ok.entries.map(entry => ({
        position: entry.id,
        kind: entry.kind,
        payload: JSON.parse(writeJsonText(entry.payload)) as unknown,
      }))
      return { ok: { entries, next: page.ok.next, exhausted: page.ok.exhausted } }
    },
    async search(input) {
      const search = ports.search()
      if (search === undefined) return absent('the history search')
      if (!(await admitted())) return { failure: { kind: 'denied' } }
      const query: SearchQuery = {
        scope:
          input.sessions === null
            ? { kind: 'tenant' }
            : { kind: 'sessions', sessions: input.sessions as readonly SessionId[] },
        archived: input.archived,
        from: millisOf(input.from),
        to: millisOf(input.to),
        kinds: input.kinds as SearchQuery['kinds'],
        modelReadable: 'only',
        content: input.content,
      }
      const found = await search.search({
        ...access,
        query,
        cursor: input.cursor,
        pageSize: input.limit,
      })
      if ('failure' in found) return { failure: failureOf(found.failure) }
      const { hits, next, complete, incomplete } = found.ok
      return {
        ok: {
          hits: hits.map(hit => ({ ...hit, at: isoOf(hit.at) })),
          next,
          complete,
          incomplete: incomplete?.reason ?? null,
        },
      }
    },
  }
}

/** Attaches the session reads, read per call through the reader caller class. */
export function bindReleaseSessions(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  const reader = ctx.intercept(sessionKey, { caller: 'reader' })
  const sessions = createBoundSessions(parent, {
    verifier: () => toolRuntimeHolder(ctx).verifier(),
    directory: () => reader.get(sessionKey, false)?.directory,
    history: () => reader.get(sessionKey, false)?.history,
    search: () => ctx.get(sessionSearchKey, false) as HistorySearch<unknown> | undefined,
  })
  return attachSessions(scope, sessions)
}
