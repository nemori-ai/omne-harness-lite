import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SessionCallControl, SessionFailure, SessionId } from '@omne-harness/session-contract'
import { SessionCallControlService } from '@omne-harness/session-cordis-contract/cordis'
import {
  resolveToolInvocationRef,
  type ToolControl,
  type ToolFailure,
  type ToolInvocationRef,
  type ToolRuntime,
} from '@omne-harness/tool-contract'
import type { SessionCoordinatorPrincipalFailure } from './agent-drive.ts'
import { provideBackgroundSources } from './background-sources.ts'
import { createToolCallStates, provideSessionCallStates } from './tool-call-states.ts'

const OWNER = 'session-adapters/tool-call-control'

export type ToolCallControlInput<P> = Readonly<{
  /** The Tool runtime of this moment, or null while it is away. */
  tools(): Pick<ToolRuntime<P, ContentBlock>, 'queries' | 'commands'> | null
  principal(
    scope: Readonly<{ tenant: TenantId; session: SessionId }>,
  ): Promise<Outcome<P, SessionCoordinatorPrincipalFailure>>
}>

const unavailable = (diagnostic: string): Outcome<never, SessionFailure> =>
  fail({ kind: 'unavailable', owner: OWNER, diagnostic })

const INTENTS: Readonly<Record<'stop' | 'withdraw', ToolControl>> = {
  stop: { kind: 'stop' },
  withdraw: { kind: 'withdraw', reach: 'all' },
}

function toolFailure(failure: ToolFailure): Outcome<never, SessionFailure> {
  switch (failure.kind) {
    case 'denied':
      return fail({ kind: 'denied', action: 'control-call' })
    case 'unsupported':
      return fail({ kind: 'unsupported' })
    case 'invalid':
      return fail({ kind: 'invalid', field: failure.field, reason: failure.reason })
    default:
      return unavailable(`Tool answered ${failure.kind}`)
  }
}

// Tool mints an operation per control, so the call state is read first: a held control of the
// same kind is the original one, and an unknown commit is read back on the next round.
export function createToolCallControl<P>(input: ToolCallControlInput<P>): SessionCallControl {
  return {
    async control({ tenant, session, producer, intent }) {
      const resolved = resolveToolInvocationRef(producer.call, tenant)
      if ('failure' in resolved)
        return resolved.failure.kind === 'malformed'
          ? fail({ kind: 'invalid', field: 'producer.call', reason: 'not a Tool invocation' })
          : fail({ kind: 'denied', action: 'control-call' })
      const runtime = input.tools()
      if (runtime === null) return unavailable('the Tool runtime is away')
      const principal = await input.principal({ tenant, session })
      if ('failure' in principal) return principal
      // The reference resolved for this tenant above, so its text is a Tool invocation reference.
      const reference = producer.call as ToolInvocationRef
      const access = { principal: principal.ok, tenant, reference }
      const looked = await runtime.queries.lookup(access)
      if ('failure' in looked) return toolFailure(looked.failure)
      if (looked.ok.kind !== 'found') return unavailable('Tool has not accepted the call')
      const { state } = looked.ok
      if (state.phase === 'settled') return succeed('ended')
      const wanted = INTENTS[intent]
      if (state.controls.some(control => control.intent.kind === wanted.kind))
        return succeed('recorded')
      const sent = await runtime.commands.control({ ...access, intent: wanted })
      switch (sent.kind) {
        case 'committed':
          return succeed('recorded')
        case 'commit-unknown':
          return unavailable('the control commit is unknown; the next round reads it back')
        case 'rejected':
          return toolFailure(sent.failure)
      }
    },
  }
}

class SessionCallControlProvider extends SessionCallControlService {
  readonly control: SessionCallControl['control']
  constructor(ctx: Context, control: SessionCallControl) {
    super(ctx)
    this.control = control.control
  }
}

/** Provides `sessionCallControl` and the two input sources of background calls. */
export function createSessionCallControlPlugin<P>(input: ToolCallControlInput<P>) {
  return {
    name: 'session-call-control',
    apply(ctx: Context) {
      new SessionCallControlProvider(ctx, createToolCallControl(input))
      provideSessionCallStates(ctx, createToolCallStates(input))
      provideBackgroundSources(ctx)
    },
  }
}
