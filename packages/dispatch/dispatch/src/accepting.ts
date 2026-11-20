import {
  decideAccept,
  dispatchRequestSchema,
  type AcceptFacts,
  type CallContext,
  type Dispatch,
  type DispatchRequest,
  type Dispatching,
} from '@omne-harness/dispatch-contract'
import { INVALID, UNAVAILABLE, UNKNOWN, done, type Environment } from './answers.ts'
import { dispatchIdOf } from './identity.ts'

async function factsOf(
  env: Environment,
  ctx: CallContext,
  request: DispatchRequest,
): Promise<AcceptFacts | null> {
  const { tenant, session } = ctx
  const [row, type, open] = await Promise.all([
    env.sessions.row(tenant, session),
    env.definitions.typeOf(tenant, request.agent),
    env.store.openOf(tenant, session),
  ])
  if (row.kind !== 'read' || type.kind !== 'read' || open.kind !== 'read') return null
  const contextCopy =
    request.mode !== 'spawn' || (await env.copies.available(tenant, session, request.call))
  return {
    mode: request.mode,
    permitted: true,
    dispatcher: row.value ?? { depth: 0, archived: true },
    agentType: type.value,
    open: open.value,
    maxOpen: env.limits.maxOpen,
    contextCopy,
  }
}

function candidate(env: Environment, ctx: CallContext, request: DispatchRequest): Dispatch {
  const id = dispatchIdOf(ctx.tenant, ctx.session, request.call)
  const now = env.clock.now()
  return Object.freeze({
    id,
    tenant: ctx.tenant,
    dispatcher: ctx.session,
    call: request.call,
    mode: request.mode,
    agent: request.agent,
    instruction: request.instruction,
    expectation: request.expectation ?? null,
    session: env.sessions.sessionOf(ctx.tenant, id),
    state: 'accepted',
    report: null,
    failure: null,
    stop: null,
    delivery: null,
    acceptedAt: now,
    changedAt: now,
  })
}

/** A request is judged only when its dispatch is not registered yet: asking again recalls it, whatever holds now. */
export function createAccepting(env: Environment): Pick<Dispatching, 'dispatch'> {
  return {
    async dispatch(ctx, input) {
      const parsed = dispatchRequestSchema.safeParse(input)
      if (!parsed.success) return INVALID
      const blocked = await env.permit(ctx, 'dispatch')
      if (blocked !== null) return blocked
      const request = parsed.data
      const asked = candidate(env, ctx, request)
      const known = await env.store.dispatch(ctx.tenant, asked.id)
      if (known.kind !== 'read') return UNAVAILABLE
      if (known.value === null) {
        const facts = await factsOf(env, ctx, request).catch(() => null)
        if (facts === null) return UNAVAILABLE
        const decision = decideAccept(facts)
        if (decision.kind === 'refuse') return { kind: 'refused', reason: decision.reason }
      }
      const { maxOpen } = env.limits
      const answer = await env.store.accept(ctx.tenant, { dispatch: asked, maxOpen })
      if (answer.kind === 'unknown') return UNKNOWN
      if (answer.kind === 'rolled-back') return UNAVAILABLE
      const result = answer.value
      if (result.kind === 'conflict') return { kind: 'refused', reason: 'conflict' }
      if (result.kind === 'too-many-open') return { kind: 'refused', reason: 'too-many-open' }
      const dispatch = await env.afterSteps(ctx.tenant, result.dispatch)
      return done(dispatch, result.kind === 'recalled')
    },
  }
}
