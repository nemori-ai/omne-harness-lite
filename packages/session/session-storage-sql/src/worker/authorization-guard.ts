import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { canonicalText } from '../codec.ts'
import {
  SESSION_AUTHORIZATION_GUARD,
  SessionAuthorizationGuardSchema,
} from '../permission-current.ts'
import { onceAuthorizationOf, sessionAuthorizationOf } from './authorization-context.ts'

export default {
  participant: SESSION_AUTHORIZATION_GUARD,
  protocol: '1',
  execute(facts, port) {
    const parsed = SessionAuthorizationGuardSchema.safeParse(facts)
    if (!parsed.success)
      return { kind: 'unsupported', basis: { reason: 'session-authorization-guard-input' } }
    const { tenant, session, grant } = parsed.data.request
    const scope = { tenant, session }
    const held =
      grant.kind === 'once'
        ? onceAuthorizationOf(port, scope, grant.consumer)
        : sessionAuthorizationOf(port, scope, grant.capabilityId, grant.enforcementKey)
    return held !== null && canonicalText(held.source) === canonicalText(grant.source)
      ? { kind: 'participated', response: null }
      : { kind: 'conflict', basis: { reason: 'session-authorization-changed' } }
  },
} satisfies ParticipantModule
