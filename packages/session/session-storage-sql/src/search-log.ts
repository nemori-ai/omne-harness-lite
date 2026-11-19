import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { EntryId, SessionId, SessionRevision } from '@omne-harness/session-contract'
import {
  SEARCHABLE_KINDS,
  type Extracted,
  type HistoryLogReader,
  type Judged,
  type LogPage,
  type LogRange,
  type LoggedSession,
  type SearchCursorSeal,
} from '@omne-harness/session-search'
import type { SessionCursorSigning } from '@omne-harness/session-cordis-contract'
import { domainOf, readHandler, type HandlerOutput, type SessionStorageOptions } from './context.ts'
import { open, seal } from './cursor.ts'

export type SessionSearchLogOptions = Pick<SessionStorageOptions<unknown>, 'storage' | 'domains'>

const SESSIONS_PAGE = 20_000
const SESSIONS_PAGES = 8
const POINTS_PAGE = 256

type Unavailable = Outcome<never, 'unavailable'>
const UNAVAILABLE: Unavailable = fail('unavailable')

type Told<T> = Omit<T, 'at'> & Readonly<{ at: string | null }>

function timed<T extends Judged | Extracted>(told: Told<T>): T {
  const at = told.at === null ? Number.NaN : Date.parse(told.at)
  return { ...told, at: Number.isNaN(at) ? null : at } as unknown as T
}

/** How the history search reads the log. It asks no access question: its holder has decided. */
export function createSessionSearchLog(options: SessionSearchLogOptions): HistoryLogReader {
  const reach = { options }
  // A domain has two read threads. The search and the follower of the logs take turns at one, so
  // the other stays free for whoever accepts an input or moves a Run on.
  const lanes = new Map<string, Promise<unknown>>()
  function inTurn<T>(domain: string, run: () => Promise<T>): Promise<T> {
    const turn = (lanes.get(domain) ?? Promise.resolve()).then(run, run)
    const settled = turn.catch(() => undefined)
    lanes.set(domain, settled)
    void settled.then(() => {
      if (lanes.get(domain) === settled) lanes.delete(domain)
    })
    return turn
  }

  async function read(
    tenant: TenantId,
    handler: string,
    input: (tenantText: string) => Readonly<Record<string, never>> | object,
  ): Promise<HandlerOutput | null> {
    try {
      const domain = await domainOf(reach, tenant)
      if ('failure' in domain) return null
      const { domain: target, text } = domain.ok
      const out = await inTurn(JSON.stringify(target), () =>
        readHandler(reach, target, handler, input(text) as never),
      )
      return 'failure' in out ? null : out.ok
    } catch {
      return null
    }
  }

  // Whole commits of a session after a revision, each entry as the read thread was asked to give it.
  async function page<T extends Judged | Extracted>(
    input: LogRange,
    as: object,
  ): Promise<Outcome<LogPage<T>, 'unavailable'>> {
    const out = await read(input.tenant, 'session.search-entries', text => ({
      mode: 'range',
      tenant: text,
      session: input.session,
      after: input.after,
      kinds: [...SEARCHABLE_KINDS],
      maxBytes: input.maxBytes,
      as,
    }))
    if (out === null || out['kind'] !== 'page') return UNAVAILABLE
    return succeed({
      entries: (out['entries'] as Told<T>[]).map(timed),
      through: String(out['through']) as SessionRevision,
      exhausted: out['exhausted'] === true,
      bytes: Number(out['bytes'] ?? 0),
    })
  }

  return {
    async stamp(tenant) {
      const out = await read(tenant, 'session.search-stamp', text => ({ tenant: text }))
      if (out === null) return UNAVAILABLE
      const { sessions, total, archived } = out as Record<string, unknown>
      if (typeof sessions !== 'number' || typeof total !== 'string' || typeof archived !== 'number')
        return UNAVAILABLE
      return succeed({ sessions, total, archived })
    },

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

    judge: input => page<Judged>(input, { kind: 'judged', spec: input.spec }),
    extract: input => page<Extracted>(input, { kind: 'rows' }),

    async judgeAt(input) {
      const found: (Judged | null)[] = []
      for (let from = 0; from < input.points.length; from += POINTS_PAGE) {
        const points = input.points.slice(from, from + POINTS_PAGE)
        const out = await read(input.tenant, 'session.search-entries', text => ({
          mode: 'points',
          tenant: text,
          points: points.map(point => ({
            session: point.session,
            position: point.position as EntryId,
          })),
          as: { kind: 'judged', spec: input.spec },
        }))
        if (out === null || out['kind'] !== 'points') return UNAVAILABLE
        for (const told of out['entries'] as (Told<Judged> | null)[])
          found.push(told === null ? null : timed(told))
      }
      return succeed(found)
    },
  }
}

export type SessionSearchCursorOptions = Readonly<{
  signing: SessionCursorSigning
  now?: () => number
  ttlMs?: number
}>

/** The cursors of the history search: signed like the session's other cursors, bound to a tenant. */
export function createSearchCursorSeal(options: SessionSearchCursorOptions): SearchCursorSeal {
  const cursor = {
    signing: options.signing,
    now: options.now ?? Date.now,
    ttlMs: options.ttlMs ?? 15 * 60_000,
  }
  const bindingOf = (tenant: TenantId) => {
    const text = tenantCodec.encode(tenant)
    return text.ok ? { kind: 'history.search', tenant: text.value, session: null } : null
  }
  return {
    async seal(tenant, state) {
      const binding = bindingOf(tenant)
      if (binding === null) return null
      const sealed = await seal(cursor, binding, state)
      return 'failure' in sealed ? null : sealed.ok
    },
    async open(tenant, sealed) {
      const binding = bindingOf(tenant)
      if (binding === null) return 'invalid'
      const found = await open<unknown>(cursor, binding, sealed)
      if ('failure' in found)
        return found.failure.kind === 'unavailable' ? 'unavailable' : 'invalid'
      return found.ok
    },
  }
}
