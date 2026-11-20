import { dispatchIdSchema, type DispatchId } from '@omne-harness/dispatch-contract'
import {
  dispatchReportWait,
  reportWaitRequest,
  type ReportWaitResponse,
} from '@omne-harness/dispatch-tool'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  describedAdoption,
  type CheckpointedToolExecutor,
  type ToolSegmentContext,
} from '@omne-harness/tool-contract/provider'
import { z } from 'zod'
import { agentsOf } from './port.ts'
import type { AgentsArguments } from './protocol.ts'
import { NOW_UNAVAILABLE, completed, reachFrom, refused, unavailable, unknown } from './results.ts'

/** What the call ends with when its wait is closed before the outcome came. */
export const DISPATCH_CLOSED_RESULT =
  'The dispatch is still in progress: this call stopped waiting, the dispatched work did not stop. Its report will come to this session later as a reminder. Read it with the command show, or take it back with withdraw.'

const STATE_MAX_BYTES = 256
const stateSchema = z.strictObject({ dispatch: dispatchIdSchema })
const stateAdoption = describedAdoption({
  owner: '@omne-harness/dispatch-tools',
  name: 'dispatch-state',
  revision: '1',
  changes: 'The dispatch a suspended dispatch call waits for.',
})
const responseSchema = z.strictObject({
  dispatch: dispatchIdSchema,
  state: z.enum(['reported', 'failed', 'withdrawn', 'handed-off']),
  session: z.string(),
  report: z
    .strictObject({
      text: z.string(),
      origin: z.enum(['report', 'final-reply']),
      truncated: z.boolean(),
    })
    .nullable(),
  failure: z.strictObject({ cause: z.string(), detail: z.string() }).nullable(),
  expectation: z.string().nullable(),
}) satisfies z.ZodType<ReportWaitResponse>

const encoder = new TextEncoder()
const ORIGINS = {
  report: 'what the dispatched agent handed back',
  'final-reply': 'the last reply of the run: the agent handed back no report',
} as const
const CUT =
  'The report is longer than a result carries and was cut here. Read all of it with the command show.'
const HANDED =
  'The work is now in that session, which a person attends. There is no report and it cannot be withdrawn.'

function stateOf(checkpoint: Uint8Array): DispatchId | undefined {
  try {
    const text = new TextDecoder().decode(checkpoint)
    return stateSchema.parse(JSON.parse(text)).dispatch
  } catch {
    return undefined
  }
}

/** The outcome of a dispatch as the result of the call that made it. A dispatch without a report fails the call. */
function resultOf(outcome: z.output<typeof responseSchema>) {
  const { dispatch, session, state, report, failure } = outcome
  if (state === 'handed-off')
    return completed('dispatch', { dispatch, session, state, note: HANDED })
  if (state === 'reported' && report !== null)
    return completed('dispatch', {
      dispatch,
      session,
      state,
      report: report.text,
      reportIs: ORIGINS[report.origin],
      ...(report.truncated ? { truncated: CUT } : {}),
      expectation: outcome.expectation,
    })
  const end = failure === null ? state : `${failure.cause}: ${failure.detail}`
  return fail({
    kind: 'unsupported' as const,
    reason: `the dispatch ${dispatch} ended without a report: ${end}. Its session ${session} still exists; read it with the tool Sessions, or dispatch the work again.`,
  })
}

type Args = Extract<AgentsArguments, { command: 'dispatch' }>

/** The dispatch command runs in two segments: it asks for the dispatch and suspends, then turns the outcome into its result. */
export const dispatchExecutor: CheckpointedToolExecutor<Args, string, null> = {
  checkpoint: {
    schema: {
      id: '@omne-harness/dispatch-tools/dispatch-state',
      revision: '1',
      digest: stateAdoption.digest,
    },
    codec: stateAdoption,
    maxBytes: STATE_MAX_BYTES,
  },
  async initial(args, _environment, context: ToolSegmentContext) {
    const ready = await reachFrom('dispatch', agentsOf(context))
    if (!('reached' in ready)) return ready
    const { reached, bound } = ready
    const { mode, agent, instruction, expectation } = args.params
    const request = { mode, agent, instruction, expectation: expectation ?? null, call: bound.call }
    const asked = await reached.dispatching
      .dispatch(reached.context, request)
      .catch(() => ({ kind: 'unknown' }) as const)
    if (asked.kind === 'refused') return refused(asked.reason)
    if (asked.kind === 'unknown') return unknown('dispatch')
    if (asked.kind !== 'done') return unavailable('dispatch', NOW_UNAVAILABLE)
    const { id } = asked.value
    return succeed({
      kind: 'suspended',
      state: encoder.encode(JSON.stringify({ dispatch: id })),
      closedResult: DISPATCH_CLOSED_RESULT,
      wait: {
        kind: 'ask',
        key: 'report',
        contract: dispatchReportWait,
        request: reportWaitRequest(id),
      },
    })
  },
  async resume({ checkpoint, response }) {
    const waited = stateOf(checkpoint)
    if (waited === undefined)
      return fail({
        kind: 'invalid',
        reason: 'the kept state of the dispatch call is not readable',
      })
    const outcome =
      response.kind === 'answer' ? responseSchema.safeParse(response.value) : undefined
    if (outcome?.success !== true || outcome.data.dispatch !== waited)
      return fail({
        kind: 'invalid',
        reason: 'the answer of the wait is not the outcome of the dispatch of this call',
      })
    const result = resultOf(outcome.data)
    return 'failure' in result ? result : succeed({ kind: 'completed', value: result.ok })
  },
}
