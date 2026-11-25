import type { GoalSessions, PortRead, SendAnswer, SessionFacts } from '@omne-harness/goal'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  sourceRequestIdentities,
  standingOf,
  type SessionFailure,
  type SessionId,
} from '@omne-harness/session-contract'
import { reminderInput, resumeText, startText } from './inputs.ts'
import { NO_ENTRY } from './calls.ts'
import type { Called, SessionCalls } from './ports.ts'
import { GOAL_SOURCES } from './sources.ts'

const UNAVAILABLE = { kind: 'unavailable' } as const
const read = <T>(value: T): PortRead<T> => ({ kind: 'read', value })
/** A session that takes no input any more, or that this tenant has none of: the reminder is owed to nobody. */
const GONE = new Set<SessionFailure['kind']>(['archived', 'frozen', 'denied', 'not-found'])
const TEXTS = { start: startText, resume: resumeText } as const

function legalTenantOf(tenant: string) {
  const parsed = tenantCodec.parse(tenant)
  return parsed.ok ? parsed.value : undefined
}

/** The session of a goal as Session gives it: whether somebody attends it, and the reminders a goal sends it. */
export function createGoalSessions(calls: SessionCalls): GoalSessions {
  return {
    async facts(tenant, session): Promise<PortRead<SessionFacts | null>> {
      const legal = legalTenantOf(tenant)
      if (legal === undefined) return read(null)
      const work = await calls
        .work({ tenant: legal, session: session as SessionId })
        .catch(() => UNAVAILABLE)
      if (work.kind !== 'read') return UNAVAILABLE
      if (work.value === null) return read(null)
      const head = await calls
        .head({ tenant: legal, session: session as SessionId })
        .catch(() => UNAVAILABLE)
      if (head.kind !== 'read') return UNAVAILABLE
      const { attendance } = standingOf(work.value)
      return read({ attendance, moment: head.value ?? NO_ENTRY })
    },

    async wake(tenant, wake): Promise<SendAnswer> {
      const legal = legalTenantOf(tenant)
      if (legal === undefined) return 'refused'
      const session = wake.session as SessionId
      const identities = sourceRequestIdentities({
        tenant: legal,
        source: GOAL_SOURCES[wake.kind],
        request: wake.request,
        session,
      })
      const value = reminderInput(wake.kind, identities.input, TEXTS[wake.kind](wake.rendered))
      let answer: Called<unknown>
      try {
        answer = await calls.accept({ tenant: legal, session, operation: identities.accept, value })
      } catch {
        return 'unknown'
      }
      if (answer === 'unknown') return 'unknown'
      if ('ok' in answer) return 'sent'
      return GONE.has(answer.failure.kind) ? 'refused' : 'unknown'
    },
  }
}
