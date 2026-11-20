import { describe, expect, it } from 'vitest'
import {
  dispatchReportWait,
  reportWaitAnswer,
  reportWaitRequest,
} from '@omne-harness/dispatch-tool'
import { writeJsonText } from '@omne-harness/json-text'
import { DISPATCH_CLOSED_RESULT, dispatchExecutor } from '../src/dispatching.ts'
import { attachAgents } from '../src/port.ts'
import type { ArgumentsOf } from '../src/protocol.ts'
import { CONTEXT, dispatchOf, done, refused, world } from './world.ts'

type World = ReturnType<typeof world>
const ARGS: ArgumentsOf<'dispatch'> = {
  command: 'dispatch',
  params: { mode: 'delegate', agent: 'helper', instruction: 'work 1', expectation: 'three lines' },
}
function segment(w: World) {
  attachAgents({ context: w.context, limits: {}, finish: async () => undefined } as never, w.bound)
  return w.context as never
}
const answered = (dispatch: Parameters<typeof reportWaitAnswer>[0]) => ({
  kind: 'answer' as const,
  value: JSON.parse(writeJsonText(reportWaitAnswer(dispatch))) as unknown,
})

describe('the dispatch command: the first segment', () => {
  it('asks for the dispatch under the reference of the call and suspends on the report wait', async () => {
    const accepted = dispatchOf()
    const w = world({ dispatch: async () => done(accepted) })
    const first = await dispatchExecutor.initial(ARGS, null, segment(w))
    if (!('ok' in first) || first.ok.kind !== 'suspended') throw new Error(JSON.stringify(first))
    expect(first.ok.wait).toEqual({
      kind: 'ask',
      key: 'report',
      contract: dispatchReportWait,
      request: reportWaitRequest(accepted.id),
    })
    expect(first.ok.closedResult).toBe(DISPATCH_CLOSED_RESULT)
    expect(JSON.parse(new TextDecoder().decode(first.ok.state))).toEqual({ dispatch: accepted.id })
    expect(w.made('dispatch')).toEqual([
      [
        CONTEXT,
        {
          mode: 'delegate',
          agent: 'helper',
          instruction: 'work 1',
          expectation: 'three lines',
          call: 'call-1',
        },
      ],
    ])
  })

  it('suspends the same way on a dispatch that is recalled', async () => {
    const w = world({ dispatch: async () => done(dispatchOf({ state: 'reported' }), true) })
    const first = await dispatchExecutor.initial(ARGS, null, segment(w))
    expect(first).toMatchObject({ ok: { kind: 'suspended' } })
  })

  it.each([
    ['unknown-agent', 'invalid'],
    ['agent-not-master', 'unsupported'],
    ['too-deep', 'unsupported'],
    ['too-many-open', 'capacity'],
    ['context-unavailable', 'unsupported'],
    ['dispatcher-archived', 'unsupported'],
    ['conflict', 'conflict'],
    ['not-permitted', 'unsupported'],
    ['invalid-request', 'invalid'],
  ] as const)('fails with the reason %s and does not suspend', async (reason, kind) => {
    const w = world({ dispatch: async () => refused(reason) })
    const first = await dispatchExecutor.initial(ARGS, null, segment(w))
    expect(first).toMatchObject({ failure: { kind } })
    expect('failure' in first && first.failure.reason.startsWith(`${reason}: `)).toBe(true)
  })

  it('answers that the result is not known, and that the basis is unavailable, as the registry does', async () => {
    const unknown = world({ dispatch: async () => ({ kind: 'unknown' }) })
    expect(await dispatchExecutor.initial(ARGS, null, segment(unknown))).toMatchObject({
      failure: { kind: 'unknown', operation: 'Agents.dispatch' },
    })
    const absent = world({ dispatch: async () => ({ kind: 'basis-unavailable' }) })
    expect(await dispatchExecutor.initial(ARGS, null, segment(absent))).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    const unattached = world()
    expect(await dispatchExecutor.initial(ARGS, null, unattached.context as never)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })
})

describe('the dispatch command: the segment after the wait', () => {
  const state = new TextEncoder().encode(JSON.stringify({ dispatch: dispatchOf().id }))
  const resume = (response: unknown) =>
    dispatchExecutor.resume({ checkpoint: state, response: response as never }, null, {} as never)

  it('completes with the report as the result of the call', async () => {
    const reported = dispatchOf({
      state: 'reported',
      report: { text: 'all done', origin: 'report' },
      expectation: 'three lines',
    })
    const result = await resume(answered(reported))
    if (!('ok' in result) || result.ok.kind !== 'completed') throw new Error(JSON.stringify(result))
    const [head, ...rest] = result.ok.value.split('\n')
    expect(head).toBe('done Agents dispatch')
    expect(JSON.parse(rest.join('\n'))).toEqual({
      dispatch: reported.id,
      session: reported.session,
      state: 'reported',
      report: 'all done',
      reportIs: 'what the dispatched agent handed back',
      expectation: 'three lines',
    })
  })

  it('says when the report is the last reply of the run, and when it was cut', async () => {
    const long = 'a'.repeat(450_000)
    const reported = dispatchOf({
      state: 'reported',
      report: { text: long, origin: 'final-reply' },
    })
    const result = await resume(answered(reported))
    if (!('ok' in result) || result.ok.kind !== 'completed') throw new Error(JSON.stringify(result))
    const value = JSON.parse(result.ok.value.split('\n').slice(1).join('\n')) as Record<
      string,
      string
    >
    expect(value['reportIs']).toBe('the last reply of the run: the agent handed back no report')
    expect(value['truncated']).toContain('show')
    expect(long.startsWith(value['report'] as string)).toBe(true)
  })

  it('completes a handoff with the session that now has the work', async () => {
    const handed = dispatchOf({ mode: 'handoff', state: 'handed-off' })
    const result = await resume(answered(handed))
    if (!('ok' in result) || result.ok.kind !== 'completed') throw new Error(JSON.stringify(result))
    expect(JSON.parse(result.ok.value.split('\n').slice(1).join('\n'))).toEqual({
      dispatch: handed.id,
      session: handed.session,
      state: 'handed-off',
      note: 'The work is now in that session, which a person attends. There is no report and it cannot be withdrawn.',
    })
  })

  it.each([
    [
      dispatchOf({ state: 'failed', failure: { cause: 'run-failed', detail: 'it broke' } }),
      'run-failed: it broke',
    ],
    [
      dispatchOf({
        state: 'failed',
        failure: { cause: 'session-not-created', detail: 'archived' },
      }),
      'session-not-created: archived',
    ],
    [dispatchOf({ state: 'withdrawn', stop: 'requested' }), 'withdrawn'],
  ])('fails with the end of a dispatch that has no report', async (dispatch, part) => {
    const result = await resume(answered(dispatch))
    expect(result).toMatchObject({ failure: { kind: 'unsupported' } })
    expect('failure' in result && result.failure.reason).toContain(part)
    expect('failure' in result && result.failure.reason).toContain(dispatch.id)
  })

  it.each([
    ['no answer', { kind: 'no-answer' }],
    ['a declined decision', { kind: 'declined' }],
    ['an answer of another shape', { kind: 'answer', value: { state: 'reported' } }],
    [
      'an answer for another dispatch',
      answered(
        dispatchOf({
          id: `dsp_${'9'.repeat(64)}` as never,
          state: 'reported',
          report: { text: 'x', origin: 'report' },
        }),
      ),
    ],
  ])('does not take %s for the outcome of its dispatch', async (_name, response) => {
    expect(await resume(response)).toMatchObject({ failure: { kind: 'invalid' } })
  })

  it('does not take a checkpoint it did not write', async () => {
    const reported = dispatchOf({ state: 'reported', report: { text: 'x', origin: 'report' } })
    const result = await dispatchExecutor.resume(
      { checkpoint: new TextEncoder().encode('not json'), response: answered(reported) as never },
      null,
      {} as never,
    )
    expect(result).toMatchObject({ failure: { kind: 'invalid' } })
  })
})
