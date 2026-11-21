import {
  reportTextSchema,
  type Dispatch,
  type DispatchEvent,
  type Dispatching,
  type Outcome,
  type TenantId,
  type TransitionRefusal,
} from '@omne-harness/dispatch-contract'
import { DENIED, INVALID, UNAVAILABLE, UNKNOWN, done, type Environment } from './answers.ts'
import type { StoreAnswer } from './store.ts'
import type { EventResult } from './transactions.ts'

/** One event of an agent, answered in the words of its operation. */
async function applied<R extends string>(
  env: Environment,
  tenant: TenantId,
  answer: StoreAnswer<EventResult>,
  absent: R,
): Promise<Outcome<Dispatch, R | TransitionRefusal>> {
  if (answer.kind === 'unknown') return UNKNOWN
  if (answer.kind === 'rolled-back') return UNAVAILABLE
  const result = answer.value
  if (result.kind === 'absent') return { kind: 'refused', reason: absent }
  if (result.kind === 'refused') return { kind: 'refused', reason: result.reason }
  return done(await env.afterSteps(tenant, result.dispatch), result.kind !== 'changed')
}

export function createOutcomes(env: Environment): Pick<Dispatching, 'withdraw' | 'report'> {
  const { store, clock } = env
  return {
    async withdraw(ctx, id) {
      const blocked = await env.permit(ctx, 'withdraw')
      if (blocked !== null) return blocked
      const known = await store.dispatch(ctx.tenant, id)
      if (known.kind !== 'read') return UNAVAILABLE
      if (known.value === null) return { kind: 'refused', reason: 'no-such-dispatch' }
      if (known.value.dispatcher !== ctx.session) return DENIED
      const event: DispatchEvent = { kind: 'withdraw' }
      const answer = await store.apply(ctx.tenant, { of: { id }, event, at: clock.now() })
      return applied(env, ctx.tenant, answer, 'no-such-dispatch')
    },
    async report(ctx, input) {
      const text = reportTextSchema.safeParse(input)
      if (!text.success) return INVALID
      const blocked = await env.permit(ctx, 'report')
      if (blocked !== null) return blocked
      const event: DispatchEvent = { kind: 'report', text: text.data }
      const of = { session: ctx.session }
      const answer = await store.apply(ctx.tenant, { of, event, at: clock.now() })
      return applied(env, ctx.tenant, answer, 'not-dispatched')
    },
  }
}
