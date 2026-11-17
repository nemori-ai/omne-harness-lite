// @module-tag slow
// Slow: runs the release tree in process with a local model gateway and waits for a Run to end.
import { describe, expect, it } from 'vitest'
import type { GatewayAnswer } from '../../fixtures/model-gateway.ts'
import { onReleaseTree, sse } from '../../support/release-tree.ts'
import { modelCallsOf, untilRunEnded } from '../session-diagnostics/support.ts'

const RUN_END_TIMEOUT_MS = 90_000

const unavailable503: GatewayAnswer = {
  status: 503,
  contentType: 'application/json',
  body: JSON.stringify({ error: { message: 'local test gateway: try again', code: 503 } }),
}

function answered(body: string): GatewayAnswer {
  return {
    status: 200,
    contentType: 'text/event-stream',
    body: sse([
      {
        model: (JSON.parse(body) as { model?: string }).model ?? 'm',
        provider: 'OpenAI',
        choices: [{ delta: { content: 'answered on the second dispatch' } }],
      },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ]),
  }
}

describe('the in-call retry on the release tree', () => {
  it(
    'a supplier that answers 503 once and then normally: the Run gets its reply from one call with two dispatches',
    { timeout: 180_000 },
    async () => {
      const exitCode = await onReleaseTree(
        { script: ({ index, body }) => (index === 0 ? unavailable503 : answered(body)) },
        async tree => {
          const session = await tree.startSession('please answer')
          const { run } = await untilRunEnded(tree.cli, session, RUN_END_TIMEOUT_MS)

          expect(run['terminal'], JSON.stringify(run)).toMatchObject({ outcome: 'completed' })
          expect(run['calls'], JSON.stringify(run)).toEqual({ registered: '1', projected: '1' })
          const [call] = modelCallsOf(run)
          expect(call?.['call']).toMatchObject({ kind: 'found', phase: 'settled' })
          expect(call?.['dispatches'], JSON.stringify(call)).toEqual([
            expect.objectContaining({
              firstContent: 'none-proven',
              outcome: { kind: 'failed', cause: 'upstream-unavailable', upstreamStatus: '503' },
            }),
            expect.objectContaining({ outcome: expect.objectContaining({ kind: 'completed' }) }),
          ])
        },
      )
      expect(exitCode).toBe(0)
    },
  )
})
