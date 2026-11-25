import type { Context } from '@deepseek-ai/cordis'
import type { SessionCalls } from '@omne-harness/goal-session'
import { writeJsonText } from '@omne-harness/json-text'
import type { EntryId, SessionFailure, SessionWorkPrincipals } from '@omne-harness/session-contract'
import { sessionKey, type SessionService } from '@omne-harness/session-cordis-contract/cordis'

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
const HEAD_PAGE_BYTES = 65_536
const RESULT_PAGE_BYTES = 262_144

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
    async resultsAfter({ after, cursor, ...at }) {
      const found = await historyOf(at)
      if (found === undefined) return UNAVAILABLE
      const reading = { ...found.access, kinds: RESULT_KINDS, pageBytes: RESULT_PAGE_BYTES }
      const first = () =>
        after === null
          ? found.history.begin({ ...reading, from: null, direction: 'forward' })
          : found.history.since({ ...reading, after: after as EntryId })
      const page = await (cursor === null
        ? first()
        : found.history.next({ ...found.access, cursor }))
      if (!('ok' in page)) return UNAVAILABLE
      const { next, exhausted } = page.ok
      const entries = page.ok.entries.map(entry => ({
        id: entry.id,
        kind: entry.kind,
        payload: JSON.parse(writeJsonText(entry.payload)) as unknown,
      }))
      return { kind: 'read', value: { entries, next: exhausted ? null : next } }
    },
  }
}
