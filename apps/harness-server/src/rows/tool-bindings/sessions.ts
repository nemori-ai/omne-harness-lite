import type { Context } from '@deepseek-ai/cordis'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { writeJsonText } from '@omne-harness/json-text'
import type {
  SessionDirectory,
  SessionFailure,
  SessionHistory,
  SessionId,
  SessionListItem,
  SessionListPage,
} from '@omne-harness/session-contract'
import { sessionKey, sessionSearchKey } from '@omne-harness/session-cordis-contract/cordis'
import type { HistorySearch, HistorySearchFailure, SearchQuery } from '@omne-harness/session-search'
import {
  attachSessions,
  type BoundSessions,
  type SessionsFailure,
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
})
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

/** The reads of one call: the call's principal and tenant, never anything the model named. */
export function createBoundSessions(parent: Parent, ports: SessionsBindingPorts): BoundSessions {
  const { principal, tenant } = parent
  // Only a verified session work principal of this tenant reads; the access check then decides.
  const admitted = async () =>
    (await domainCallerOf(ports.verifier(), principal, tenant)) !== undefined
  const access = { principal, tenant }
  return {
    async list({ archived, title, cursor, limit }) {
      const directory = ports.directory()
      if (directory === undefined) return absent('the session directory')
      if (!(await admitted())) return { failure: { kind: 'denied' } }
      const asked = { ...access, after: cursor, limit }
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
      for (const archived of [false, true]) {
        let after: string | null = null
        for (let pages = 0; pages < SHOW_PAGES; pages++) {
          const asked: Readonly<{
            principal: unknown
            tenant: typeof tenant
            after: string | null
            limit: number
          }> = {
            ...access,
            after,
            limit: SHOW_PAGE,
          }
          const page: Awaited<ReturnType<SessionDirectory<unknown>['list']>> = archived
            ? await directory.listArchived({
                ...asked,
                from: null,
                to: null,
                by: null,
                titleContains: null,
              })
            : await directory.list(asked)
          if ('failure' in page) return { failure: failureOf(page.failure) }
          const found = page.ok.items.find(item => item.session === session)
          if (found !== undefined) return { ok: summaryOf(found) }
          if (page.ok.next === null) break
          after = page.ok.next
          if (pages === SHOW_PAGES - 1) return { failure: { kind: 'limited' } }
        }
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
