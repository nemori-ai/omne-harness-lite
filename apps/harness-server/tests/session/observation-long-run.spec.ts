// @module-tag slow
import { describe, expect, it } from 'vitest'
import type { SessionObservationFrame } from '@omne-harness/session-observation'
import type { GatewayScript } from '../fixtures/model-gateway.ts'
import { onReleaseTree, pollUntil, sse } from '../support/release-tree.ts'
import { loginAccess } from '../model/public-stream-support.ts'
import { emptySession, openObservation, sendInput } from './observation-support.ts'

const STEPS = 3
const PARALLEL = 8

/** A turn that binds STEPS × PARALLEL tool calls, more than one locate page holds, then holds its next model request open. */
function longTurn(): Readonly<{ script: GatewayScript; requests(): number }> {
  let requests = 0
  let sequence = 0
  const script: GatewayScript = ({ body }) => {
    requests += 1
    const serving = {
      model: (JSON.parse(body) as { model?: string }).model ?? 'm',
      provider: 'OpenAI',
    }
    if (requests > STEPS)
      return {
        status: 200,
        contentType: 'text/event-stream',
        body: sse([{ ...serving, choices: [{ delta: { content: 'Still' } }] }]).replace(
          'data: [DONE]\n\n',
          '',
        ),
        rest: { after: new Promise<void>(() => undefined), body: '' },
      }
    const calls = Array.from({ length: PARALLEL }, (_, index) => ({
      index,
      id: `call_${String((sequence += 1))}`,
      type: 'function',
      function: {
        name: 'Shell',
        arguments: JSON.stringify({
          command: 'execute',
          intent: 'one of many',
          params: { script: `echo step ${String(requests)} call ${String(index)}` },
        }),
      },
    }))
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        { ...serving, choices: [{ delta: { tool_calls: calls } }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      ]),
    }
  }
  return { script, requests: () => requests }
}

describe('a fresh observation of a Run that bound many calls', () => {
  it('names the Run in its first state frame; stopping that Run ends it, and the next observation says none', async () => {
    const turn = longTurn()
    const options = {
      script: turn.script,
      permission: 'bypass-permissions',
      observationLocatePages: 1,
    } as const
    await onReleaseTree(options, async tree => {
      const access = await loginAccess(tree)
      const session = await emptySession(tree)
      await sendInput(tree, session, 'run many steps')
      await pollUntil(
        'the request after the last step to be held',
        () => Promise.resolve(turn.requests()),
        count => count > STEPS,
      )
      const firstState = async (): Promise<Extract<SessionObservationFrame, { kind: 'state' }>> => {
        const controller = new AbortController()
        const opened = await openObservation(tree, access, session, controller.signal)
        if (opened.kind !== 'opened') throw new Error(`open answered ${opened.kind}`)
        const step = await opened.frames.next()
        controller.abort()
        if (step.done === true || step.value.kind !== 'state')
          throw new Error(`the first frame is ${JSON.stringify(step)}`)
        return step.value
      }
      const { run } = await firstState()
      expect(run).not.toBeNull()
      const stopped = await tree.cli(['cancel-run', '--session', session, '--run', String(run)])
      expect(stopped.status, stopped.stderr).toBe(0)
      await pollUntil(
        'the Run to end',
        async () => (await tree.cli(['read-session-diagnostics', '--session', session])).stdout,
        text => /^Run /mu.test(text) && !/not ended/u.test(text),
      )
      expect((await firstState()).run).toBeNull()
    })
  })
})
