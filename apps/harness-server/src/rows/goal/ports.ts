import type {
  GoalAction,
  GoalAuthority,
  GoalCalls,
  GoalCards,
  GoalSessions,
} from '@omne-harness/goal'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import { verifySessionWork } from '../tool-runtime/session-work.ts'
import type { GoalHolder } from './holder.ts'

const UNAVAILABLE = { kind: 'unavailable' } as const

/** The session port as it is mounted now. While the adapter row is not started every read is unavailable and no reminder is sent. */
export function lateSessions(holder: GoalHolder): GoalSessions {
  return {
    facts: (...input) => holder.sessions?.facts(...input) ?? Promise.resolve(UNAVAILABLE),
    wake: (...input) => holder.sessions?.wake(...input) ?? Promise.resolve('unknown'),
  }
}

/** The cards as they are mounted now: unreadable while no row that knows the cards is started, so no card writes a goal. */
export function lateCards(holder: GoalHolder): GoalCards {
  return {
    answered: (...input) => holder.cards?.answered(...input) ?? Promise.resolve(UNAVAILABLE),
  }
}

/** The check of cited calls as it is mounted now: no basis while the row that knows Session is not started. */
export function lateCalls(holder: GoalHolder): GoalCalls {
  return { cited: (...input) => holder.calls?.cited(...input) ?? Promise.resolve(UNAVAILABLE) }
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
      const work = await verifySessionWork(ports.verifier(), caller.subject, tenant.value)
      if (work.kind === 'unavailable') return 'unavailable'
      const own = work.kind === 'session' && work.session === session
      return own && OF_THE_AGENT.has(action) ? 'permitted' : 'denied'
    },
  }
}
