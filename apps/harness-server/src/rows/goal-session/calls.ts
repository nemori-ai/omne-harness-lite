import type { Context } from '@deepseek-ai/cordis'
import type { SessionCalls } from '@omne-harness/goal-session'
import { writeJsonText } from '@omne-harness/json-text'
import type { EntryId, SessionFailure, SessionWorkPrincipals } from '@omne-harness/session-contract'
import { sessionKey, type SessionService } from '@omne-harness/session-cordis-contract/cordis'
import { definitionMappingsKey } from '../agent-adoptions/definition-mappings.ts'
import { defaultModesOf } from '../session-conditions/index.ts'
import { drivesItself, openedIn, ROUND_KINDS, type RoundEntry } from './drive.ts'

const OWNER = 'harness-server/goal-session'
const ABSENT: { failure: SessionFailure } = {
  failure: {
    kind: 'unavailable',
    owner: OWNER,
    diagnostic: 'the Session service is not available',
  },
}
const UNAVAILABLE = { kind: 'unavailable' } as const
const HEAD_KINDS = ['message.user', 'message.assistant', 'message.tool', 'message.system_reminder']
const RESULT_KINDS = ['message.tool']
const CALL_KINDS = ['message.assistant', 'message.tool']
const HEAD_PAGE_BYTES = 65_536
const RESULT_PAGE_BYTES = 262_144
/** How many pages back the beginning of the round in progress is looked for. */
const ROUND_PAGES = 8

export type SessionCallPorts = Readonly<{
  /** The system principal of goals: it sends the reminders a goal owes its session. */
  system: unknown
  workPrincipals(): SessionWorkPrincipals<unknown> | undefined
}>

/** The calls of Session as this release makes them: the system principal through the intake caller class,
 * the work principal of the session itself through the maintainer class. */
export function sessionCallsOf(ctx: Context, ports: SessionCallPorts): SessionCalls {
  const faceOf = (caller: 'intake' | 'maintainer' | 'reader') => {
    const scope = ctx.intercept(sessionKey, { caller })
    return () => scope.get(sessionKey, false) as SessionService | undefined
  }
  const [intake, maintainer, reader] = [faceOf('intake'), faceOf('maintainer'), faceOf('reader')]
  /** The history of a session, read as the session itself. Undefined: not readable now. */
  async function historyOf({ tenant, session }: Parameters<SessionCalls['head']>[0]) {
    const issued = await ports
      .workPrincipals()
      ?.forSession({ actor: 'maintainer', tenant, session })
    const service = reader()
    if (issued === undefined || service === undefined || !('ok' in issued)) return undefined
    return { history: service.history, access: { principal: issued.ok, tenant, session } }
  }
  type After = Parameters<SessionCalls['resultsAfter']>[0]
  /** One page of the entries of these kinds after an entry, oldest first. */
  async function pageAfter(
    kinds: readonly string[],
    { after, cursor, ...at }: After,
  ): ReturnType<SessionCalls['resultsAfter']> {
    const found = await historyOf(at)
    if (found === undefined) return UNAVAILABLE
    const reading = { ...found.access, kinds, pageBytes: RESULT_PAGE_BYTES }
    const first = () =>
      after === null
        ? found.history.begin({ ...reading, from: null, direction: 'forward' })
        : found.history.since({ ...reading, after: after as EntryId })
    const page = await (cursor === null ? first() : found.history.next({ ...found.access, cursor }))
    if (!('ok' in page)) return UNAVAILABLE
    const { next, exhausted } = page.ok
    const entries = page.ok.entries.map(entry => ({
      id: entry.id,
      kind: entry.kind,
      payload: JSON.parse(writeJsonText(entry.payload)) as unknown,
    }))
    return { kind: 'read', value: { entries, next: exhausted ? null : next } }
  }

  return {
    async accept({ tenant, session, operation, value }) {
      const service = intake()
      if (service === undefined) return ABSENT
      return service.work.accept({ principal: ports.system, tenant, session, operation, value })
    },
    async work({ tenant, session }) {
      const issued = await ports
        .workPrincipals()
        ?.forSession({ actor: 'maintainer', tenant, session })
      const service = maintainer()
      if (issued === undefined || service === undefined) return UNAVAILABLE
      if (!('ok' in issued))
        return issued.failure.kind === 'denied' ? { kind: 'read', value: null } : UNAVAILABLE
      const read = await service.work.readWork({ principal: issued.ok, tenant, session })
      return 'ok' in read ? { kind: 'read', value: read.ok } : UNAVAILABLE
    },
    async head(at) {
      const found = await historyOf(at)
      if (found === undefined) return UNAVAILABLE
      const page = await found.history.begin({
        ...found.access,
        kinds: HEAD_KINDS,
        from: null,
        direction: 'backward',
        pageBytes: HEAD_PAGE_BYTES,
      })
      return 'ok' in page ? { kind: 'read', value: page.ok.entries[0]?.id ?? null } : UNAVAILABLE
    },
    async drives(input) {
      const mappings = ctx.get(definitionMappingsKey)
      const defaults =
        mappings === undefined
          ? undefined
          : defaultModesOf(mappings, name => mappings.modesFor(name))
      return drivesItself(input, defaults)
    },
    async opened(at) {
      const found = await historyOf(at)
      if (found === undefined) return UNAVAILABLE
      const reading = { ...found.access, kinds: ROUND_KINDS, pageBytes: HEAD_PAGE_BYTES }
      const entries: RoundEntry[] = []
      let page = await found.history.begin({ ...reading, from: null, direction: 'backward' })
      for (let read = 0; read < ROUND_PAGES; read += 1) {
        if (!('ok' in page)) return UNAVAILABLE
        for (const { id, kind, payload } of page.ok.entries)
          entries.push({ id, kind, payload: JSON.parse(writeJsonText(payload)) as unknown })
        const opened = openedIn(entries)
        if (opened !== 'more') return { kind: 'read', value: opened }
        const { next, exhausted } = page.ok
        if (exhausted || next === null) break
        page = await found.history.next({ ...found.access, cursor: next })
      }
      return { kind: 'read', value: null }
    },
    resultsAfter: input => pageAfter(RESULT_KINDS, input),
    callsAfter: input => pageAfter(CALL_KINDS, input),
  }
}
