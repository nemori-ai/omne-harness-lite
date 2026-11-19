import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { EntryId, SessionId, SessionRevision } from '@omne-harness/session-contract'
import {
  SEARCHABLE_KINDS,
  type EntryPage,
  type HistoryLogReader,
  type LoggedEntry,
  type LoggedSession,
} from '@omne-harness/session-search'
import { domainOf, readHandler, type HandlerOutput, type SessionStorageOptions } from './context.ts'
import { readEntryText } from './entry-codec.ts'

export type SessionSearchLogOptions = Pick<SessionStorageOptions<unknown>, 'storage' | 'domains'>

const SESSIONS_PAGE = 20_000
const SESSIONS_PAGES = 8
const POINTS_PAGE = 256

type Shown = Readonly<{ text: string; at: string | null }>
type Unavailable = Outcome<never, 'unavailable'>
const UNAVAILABLE: Unavailable = fail('unavailable')

function loggedOf(shown: Shown): LoggedEntry {
  const at = shown.at === null ? Number.NaN : Date.parse(shown.at)
  return {
    entry: readEntryText(shown.text, 'session.search-entries'),
    at: Number.isNaN(at) ? null : at,
  }
}

/** How the history search reads the log. It asks no access question: its holder has decided. */
export function createSessionSearchLog(options: SessionSearchLogOptions): HistoryLogReader {
  const reach = { options }

  async function read(
    tenant: TenantId,
    handler: string,
    input: (tenantText: string) => Readonly<Record<string, never>> | object,
  ): Promise<HandlerOutput | null> {
    try {
      const domain = await domainOf(reach, tenant)
      if ('failure' in domain) return null
      const out = await readHandler(
        reach,
        domain.ok.domain,
        handler,
        input(domain.ok.text) as never,
      )
      return 'failure' in out ? null : out.ok
    } catch {
      return null
    }
  }

  return {
    async sessions(tenant) {
      const sessions: LoggedSession[] = []
      let after: string | null = null
      for (let page = 0; page < SESSIONS_PAGES; page += 1) {
        const out = await read(tenant, 'session.search-sessions', text => ({
          tenant: text,
          after,
          limit: SESSIONS_PAGE,
        }))
        if (out === null) return UNAVAILABLE
        const rows = out['sessions'] as [string, string, boolean][]
        for (const [session, tail, archived] of rows)
          sessions.push({ session: session as SessionId, tail: tail as SessionRevision, archived })
        if (out['more'] !== true) return succeed(sessions)
        after = rows.at(-1)?.[0] ?? null
      }
      // More sessions than this reads in one search: said, not cut short without a word.
      return UNAVAILABLE
    },

    async entries(input): Promise<Outcome<EntryPage, 'unavailable'>> {
      const out = await read(input.tenant, 'session.search-entries', text => ({
        mode: 'range',
        tenant: text,
        session: input.session,
        after: input.after,
        kinds: [...SEARCHABLE_KINDS],
        maxBytes: input.maxBytes,
      }))
      if (out === null || out['kind'] !== 'page') return UNAVAILABLE
      try {
        return succeed({
          entries: (out['entries'] as Shown[]).map(loggedOf),
          through: String(out['through']) as SessionRevision,
          exhausted: out['exhausted'] === true,
        })
      } catch {
        return UNAVAILABLE
      }
    },

    async at(input) {
      const found: (LoggedEntry | null)[] = []
      for (let from = 0; from < input.points.length; from += POINTS_PAGE) {
        const points = input.points.slice(from, from + POINTS_PAGE)
        const out = await read(input.tenant, 'session.search-entries', text => ({
          mode: 'points',
          tenant: text,
          points: points.map(point => ({
            session: point.session,
            position: point.position as EntryId,
          })),
        }))
        if (out === null || out['kind'] !== 'points') return UNAVAILABLE
        try {
          for (const shown of out['entries'] as (Shown | null)[])
            found.push(shown === null ? null : loggedOf(shown))
        } catch {
          return UNAVAILABLE
        }
      }
      return succeed(found)
    },
  }
}
