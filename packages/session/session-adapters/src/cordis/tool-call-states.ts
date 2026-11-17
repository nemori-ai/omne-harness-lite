import type { Context } from '@deepseek-ai/cordis'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  BackgroundCallState,
  SessionCallStates,
  SessionFailure,
} from '@omne-harness/session-contract'
import { SessionCallStatesService } from '@omne-harness/session-cordis-contract/cordis'
import {
  resolveToolInvocationRef,
  type ToolInvocationRef,
  type ToolState,
} from '@omne-harness/tool-contract'
import type { ToolCallControlInput } from './tool-call-control.ts'

const OWNER = 'session-adapters/tool-call-states'
const LAST_PART_BYTES = 1024
const LAST_LINE_CHARS = 160

const unavailable = (diagnostic: string): Outcome<never, SessionFailure> =>
  fail({ kind: 'unavailable', owner: OWNER, diagnostic })

function phaseOf(state: ToolState): BackgroundCallState['phase'] {
  if (state.phase === 'settled') return 'settled'
  return state.phase === 'running' || state.phase === 'suspended' ? 'running' : 'queued'
}

function stopOf(state: ToolState): BackgroundCallState['stop'] {
  const control = state.controls.findLast(
    item => item.intent.kind === 'stop' || item.intent.kind === 'withdraw',
  )
  if (control === undefined) return null
  if (control.progress.kind === 'stopped') return 'stopped'
  return control.progress.kind === 'accepted' ? 'accepted' : 'pending'
}

/** The last line of output text, cut to a bound; blank lines do not count. */
export function lastLineOf(text: string): string | null {
  const line = text
    .split(/\r?\n/u)
    .map(item => item.trim())
    .findLast(item => item !== '')
  if (line === undefined) return null
  const points = [...line]
  return points.length > LAST_LINE_CHARS
    ? `${points.slice(0, LAST_LINE_CHARS - 1).join('')}…`
    : line
}

// Reads the state of one call from Tool each time it is asked; Session keeps none of it.
export function createToolCallStates<P>(input: ToolCallControlInput<P>): SessionCallStates {
  return {
    async read({ tenant, session, producer }) {
      const resolved = resolveToolInvocationRef(producer.call, tenant)
      if ('failure' in resolved)
        return fail({ kind: 'invalid', field: 'producer.call', reason: 'not a Tool invocation' })
      const runtime = input.tools()
      if (runtime === null) return unavailable('the Tool runtime is away')
      const principal = await input.principal({ tenant, session })
      if ('failure' in principal) return principal
      const access = {
        principal: principal.ok,
        tenant,
        reference: producer.call as ToolInvocationRef,
      }
      const looked = await runtime.queries.lookup(access)
      if ('failure' in looked) return unavailable(`Tool answered ${looked.failure.kind}`)
      if (looked.ok.kind !== 'found') return unavailable('Tool has not accepted the call')
      const output = await runtime.queries.readOutput({
        ...access,
        after: null,
        maxBytes: LAST_PART_BYTES,
      })
      const lastLine =
        'ok' in output && output.ok.kind !== 'none' ? lastLineOf(output.ok.text) : null
      return succeed({ phase: phaseOf(looked.ok.state), stop: stopOf(looked.ok.state), lastLine })
    },
  }
}

class SessionCallStatesProvider extends SessionCallStatesService {
  readonly read: SessionCallStates['read']
  constructor(ctx: Context, states: SessionCallStates) {
    super(ctx)
    this.read = states.read
  }
}

export function provideSessionCallStates(ctx: Context, states: SessionCallStates): void {
  new SessionCallStatesProvider(ctx, states)
}
