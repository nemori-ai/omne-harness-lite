import type {
  GoalAction,
  GoalAuthority,
  GoalCalls,
  GoalDecisions,
  GoalHistory,
  GoalSessions,
} from '@omne-harness/goal'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { SCHEDULE_COMPONENT } from '../authorization/grants.ts'
import { classify } from '../authorization/principals.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'
import { checkedPrincipal } from './check-subject.ts'
import type { GoalHolder } from './holder.ts'

const UNAVAILABLE = { kind: 'unavailable' } as const

/** The session port as it is mounted now. While the adapter row is not started every read is unavailable and no reminder is sent. */
export function lateSessions(holder: GoalHolder): GoalSessions {
  return {
    facts: (...input) => holder.sessions?.facts(...input) ?? Promise.resolve(UNAVAILABLE),
    asked: (...input) => holder.sessions?.asked(...input) ?? Promise.resolve(UNAVAILABLE),
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

/** What only a person does to the goal of a session of their tenant. Whether somebody attends that session is the goal's own rule, not asked here. */
const OF_THE_PERSON: ReadonlySet<GoalAction> = new Set([
  'read',
  'set',
  'revise',
  'pause',
  'resume',
  'cancel',
  'settle-by-exit',
])

const OF_THE_CREATOR: ReadonlySet<GoalAction> = new Set(['read', 'set', 'cancel', 'abort'])

type Standing = 'unavailable' | 'none' | 'person' | 'creator' | Readonly<{ session: string }>

/** Who a subject is to the goals of a tenant, once verified: the work of one session, a person come in by login, schedule as the creator of the sessions of its Jobs, or nobody. */
async function standingOf(
  verifier: PrincipalVerifier | undefined,
  subject: unknown,
  tenant: TenantId,
): Promise<Standing> {
  if (verifier === undefined) return 'unavailable'
  const checked = await Promise.resolve()
    .then(() => verifier.verify(subject as never))
    .catch(() => ({ kind: 'unavailable' as const }))
  if (checked.kind === 'unavailable') return 'unavailable'
  if (checked.kind !== 'verified') return 'none'
  const work = sessionWorkOf(checked.principal, tenant)
  if (work !== undefined) return { session: work.session }
  const who = classify(checked.principal)
  if (who?.column === 'system')
    return who.principal.component === SCHEDULE_COMPONENT ? 'creator' : 'none'
  return who?.column === 'login' && tenantEquals(who.principal.tenant, tenant) ? 'person' : 'none'
}

export function createGoalAuthority(ports: AuthorityPorts): GoalAuthority {
  return {
    async decide(caller, session, action) {
      const tenant = tenantCodec.parse(caller.tenant)
      if (!tenant.ok) return 'denied'
      const checked = checkedPrincipal(caller.subject)
      const standing = await standingOf(ports.verifier(), checked ?? caller.subject, tenant.value)
      if (standing === 'unavailable') return 'unavailable'
      return allowed(standing, checked !== undefined, session, action) ? 'permitted' : 'denied'
    },
  }
}

/** What each standing may ask: a person what only a person does; the creator of a session nobody attends to set, read, cancel and abort; the work of a session what its agent does through its tool; the check of that work only to observe. */
function allowed(
  standing: Exclude<Standing, 'unavailable'>,
  checking: boolean,
  session: string,
  action: GoalAction,
): boolean {
  if (standing === 'none') return false
  if (standing === 'person') return !checking && OF_THE_PERSON.has(action)
  if (standing === 'creator') return !checking && OF_THE_CREATOR.has(action)
  if (standing.session !== session) return false
  return checking ? action === 'observe' : OF_THE_AGENT.has(action)
}
