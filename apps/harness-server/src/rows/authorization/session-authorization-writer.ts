import type { Context } from '@deepseek-ai/cordis'
import { deriveSessionOperation, type SessionId } from '@omne-harness/session-contract'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import type { AuthorizationWriter } from './answer-effects.ts'

/** The session log's one writer takes the authorization; the decision derives the operation. */
export function sessionAuthorizationWriter(ctx: Context): AuthorizationWriter {
  // What a person decided enters the session as the person's input does: through intake.
  const intake = ctx.intercept(sessionKey, { caller: 'intake' })
  return {
    async express({ principal, tenant, session, card, expression }) {
      const service = intake.get(sessionKey, false)
      if (service === undefined) return 'unavailable'
      const id = session as SessionId
      const operation = deriveSessionOperation({
        kind: 'authorization',
        session: id,
        card,
        decision: expression.source,
      })
      try {
        const result = await service.management.change({
          principal,
          tenant,
          session: id,
          operation,
          declaration: { kind: 'authorization-expression', expression, authorization: card },
        })
        if ('ok' in result) return 'written'
        const { kind } = result.failure
        return kind === 'denied' || kind === 'invalid' ? 'refused' : 'unavailable'
      } catch {
        return 'unavailable'
      }
    },
  }
}
