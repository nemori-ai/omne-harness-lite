import type {
  GoalAction,
  GoalAuthority,
  GoalCalls,
  GoalDecisions,
  GoalHistory,
  GoalSessions,
} from '@omne-harness/goal'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import { verifySessionWork } from '../tool-runtime/session-work.ts'
import { checkedPrincipal } from './check-subject.ts'
import type { GoalHolder } from './holder.ts'

const UNAVAILABLE = { kind: 'unavailable' } as const

/** The session port as it is mounted now. While the adapter row is not started every read is unavailable and no reminder is sent. */
export function lateSessions(holder: GoalHolder): GoalSessions {
  return {
    facts: (...input) => holder.sessions?.facts(...input) ?? Promise.resolve(UNAVAILABLE),
    wake: (...input) => holder.sessions?.wake(...input) ?? Promise.resolve('unknown'),
  }
}

/** The check of cited calls as it is mounted now: no basis while the row that knows Session is not started. */
export function lateCalls(holder: GoalHolder): GoalCalls {
  return { cited: (...input) => holder.calls?.cited(...input) ?? Promise.resolve(UNAVAILABLE) }
}

export function lateHistory(holder: GoalHolder): GoalHistory {
  return {
    calls: (...input) => holder.history?.calls(...input) ?? Promise.resolve(UNAVAILABLE),
    said: (...input) => holder.history?.said(...input) ?? Promise.resolve(UNAVAILABLE),
  }
}

export function lateDecisions(holder: GoalHolder): GoalDecisions {
  return { ask: input => holder.decisions?.ask(input) ?? Promise.resolve(null) }
}

/** What the agent of a session may ask of its own goal. Nothing here changes the goal without an answered card. */
const OF_THE_AGENT: ReadonlySet<GoalAction> = new Set(['read', 'propose', 'confirm', 'track'])

export type AuthorityPorts = Readonly<{ verifier(): PrincipalVerifier | undefined }>

/** A caller acts as a session when it is the verified work principal of that session in that tenant.
 * The owner's own ways in are mounted by the rows that know the owner; until then nobody else is permitted. */
export function createGoalAuthority(ports: AuthorityPorts): GoalAuthority {
  return {
    async decide(caller, session, action) {
      const tenant = tenantCodec.parse(caller.tenant)
      if (!tenant.ok) return 'denied'
      const checked = checkedPrincipal(caller.subject)
      const principal = checked ?? caller.subject
      const work = await verifySessionWork(ports.verifier(), principal, tenant.value)
      if (work.kind === 'unavailable') return 'unavailable'
      const own = work.kind === 'session' && work.session === session
      const asked = checked === undefined ? OF_THE_AGENT.has(action) : action === 'observe'
      return own && asked ? 'permitted' : 'denied'
    },
  }
}
