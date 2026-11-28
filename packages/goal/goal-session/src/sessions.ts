import type { GoalSessions, PortRead, SendAnswer, SessionFacts } from '@omne-harness/goal'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  sourceRequestIdentities,
  standingOf,
  type SessionFailure,
  type SessionId,
} from '@omne-harness/session-contract'
import { continueText, impliedText, reminderInput, resumeText, startText } from './inputs.ts'
import { NO_ENTRY } from './calls.ts'
import type { Called, SessionCalls } from './ports.ts'
import { GOAL_SOURCES } from './sources.ts'

const UNAVAILABLE = { kind: 'unavailable' } as const
const read = <T>(value: T): PortRead<T> => ({ kind: 'read', value })
/** A session that takes no input any more, or that this tenant has none of: the reminder is owed to nobody. */
const GONE = new Set<SessionFailure['kind']>(['archived', 'frozen', 'denied', 'not-found'])
const textOf = (wake: Parameters<GoalSessions['wake']>[1]): string => {
  if (wake.kind === 'continue')
    return wake.implied ? impliedText(wake.open) : continueText(wake.open)
  return wake.kind === 'start' ? startText(wake.rendered) : resumeText(wake.rendered)
}

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
      const at = { tenant: legal, session: session as SessionId }
      const drives = await calls.drives({ ...at, work: work.value }).catch(() => UNAVAILABLE)
      if (drives.kind !== 'read') return UNAVAILABLE
      const opened = drives.value ? await calls.opened(at).catch(() => UNAVAILABLE) : read(null)
      if (opened.kind !== 'read') return UNAVAILABLE
      const where = await calls.where(at).catch(() => UNAVAILABLE)
      if (where.kind !== 'read') return UNAVAILABLE
      const { attendance } = standingOf(work.value)
      const moment = head.value ?? NO_ENTRY
      return read({ attendance, moment, drive: opened.value, where: where.value })
    },

    async running(tenant, session) {
      const legal = legalTenantOf(tenant)
      if (legal === undefined) return UNAVAILABLE
      const work = await calls
        .work({ tenant: legal, session: session as SessionId })
        .catch(() => UNAVAILABLE)
      if (work.kind !== 'read') return UNAVAILABLE
      return read(work.value?.run.kind === 'active')
    },

    async asked(tenant, session) {
      const legal = legalTenantOf(tenant)
      if (legal === undefined) return read(null)
      return calls.asked({ tenant: legal, session: session as SessionId }).catch(() => UNAVAILABLE)
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
      const value = reminderInput(wake.kind, identities.input, textOf(wake))
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
