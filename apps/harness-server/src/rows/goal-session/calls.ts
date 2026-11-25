import type { Context } from '@deepseek-ai/cordis'
import type { SessionCalls } from '@omne-harness/goal-session'
import type { SessionFailure, SessionWorkPrincipals } from '@omne-harness/session-contract'
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

export type SessionCallPorts = Readonly<{
  /** The system principal of goals: it sends the reminders a goal owes its session. */
  system: unknown
  workPrincipals(): SessionWorkPrincipals<unknown> | undefined
}>

/** The calls of Session as this release makes them: the system principal through the intake caller class,
 * the work principal of the session itself through the maintainer class. */
export function sessionCallsOf(ctx: Context, ports: SessionCallPorts): SessionCalls {
  const faceOf = (caller: 'intake' | 'maintainer') => {
    const scope = ctx.intercept(sessionKey, { caller })
    return () => scope.get(sessionKey, false) as SessionService | undefined
  }
  const [intake, maintainer] = [faceOf('intake'), faceOf('maintainer')]
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
  }
}
