import {
  decideMessage,
  messageRequestSchema,
  type Dispatching,
} from '@omne-harness/dispatch-contract'
import { INVALID, UNAVAILABLE, UNKNOWN, done, type Environment } from './answers.ts'
import { messageInputOf } from './identity.ts'

/** A message changes no dispatch: it is one input into the session of the receiver. */
export function createMessaging(env: Environment): Pick<Dispatching, 'message'> {
  const { sessions } = env
  return {
    async message(ctx, request) {
      const parsed = messageRequestSchema.safeParse(request)
      if (!parsed.success) return INVALID
      const blocked = await env.permit(ctx, 'message')
      if (blocked !== null) return blocked
      const { to, text, id } = parsed.data
      const [receiver, sender] = await Promise.all([
        sessions.row(ctx.tenant, to),
        sessions.row(ctx.tenant, ctx.session),
      ])
      if (receiver.kind !== 'read' || sender.kind !== 'read') return UNAVAILABLE
      const decision = decideMessage({
        permitted: true,
        sender: ctx.session,
        to,
        receiver: receiver.value,
      })
      if (decision.kind === 'refuse') return { kind: 'refused', reason: decision.reason }
      const input = messageInputOf(ctx.session, id)
      const from = { session: ctx.session, agent: sender.value?.agent ?? null }
      const source = 'dispatch.message' as const
      const sent = await sessions.send(ctx.tenant, { to, input, source, text, from })
      if (sent.kind === 'unknown') return UNKNOWN
      if (sent.kind === 'refused') return { kind: 'refused', reason: sent.reason }
      return done({ to, input })
    },
  }
}
