// @module-tag slow
// Slow: runs the release tree in process with a local model gateway and waits for a Run to end.
import { describe, expect, it } from 'vitest'
import type { GatewayAnswer } from '../../fixtures/model-gateway.ts'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import { onReleaseTree, pollUntil, sse, type ReleaseTree } from '../../support/release-tree.ts'
import {
  diagnosticsBodyOf,
  modelCallsOf,
  structuredCauseOf,
  untilRunEnded,
} from '../session-diagnostics/support.ts'

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

async function sessionCall(tree: ReleaseTree, operation: string, body: object) {
  const response = await fetch(
    `http://127.0.0.1:${String(tree.port)}/api/session/v1/${operation}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${savedLoginProof(tree.home)}`,
        'content-type': 'application/json',
        'omne-message-id': `m-in-call-retry-${operation}`,
      },
      body: JSON.stringify({ tenant: savedTenant(tree.home), ...body }),
    },
  )
  return JSON.parse(await response.text()) as { outcome: string; body?: Record<string, unknown> }
}

async function runsOf(tree: ReleaseTree, session: string) {
  const read = await tree.cli(['read-session-diagnostics', '--session', session, '--json'])
  return diagnosticsBodyOf(read)?.runs ?? []
}

const failed503 = expect.objectContaining({
  firstContent: 'none-proven',
  outcome: { kind: 'failed', cause: 'upstream-unavailable', upstreamStatus: '503' },
})

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
            failed503,
            expect.objectContaining({ outcome: expect.objectContaining({ kind: 'completed' }) }),
          ])
          expect(modelCallsOf(run)).toHaveLength(1)
        },
      )
      expect(exitCode).toBe(0)
    },
  )

  it(
    'a supplier that keeps answering 503: one call with two dispatches fails the Run with the cause, and a retry by the person starts the next Run',
    { timeout: 240_000 },
    async () => {
      let open = false
      let requests = 0
      const exitCode = await onReleaseTree(
        {
          script: ({ body }) => {
            requests += 1
            return open ? answered(body) : unavailable503
          },
        },
        async tree => {
          const session = await tree.startSession('please answer')
          const { run } = await untilRunEnded(tree.cli, session, RUN_END_TIMEOUT_MS)

          expect(run['terminal'], JSON.stringify(run)).toMatchObject({ outcome: 'failed' })
          expect(structuredCauseOf(run)).toEqual({
            kind: 'no-reply',
            cause: 'upstream-unavailable',
            upstreamStatus: '503',
          })
          expect(run['calls'], JSON.stringify(run)).toEqual({ registered: '1', projected: '1' })
          expect(modelCallsOf(run)).toHaveLength(1)
          expect(modelCallsOf(run)[0]?.['dispatches']).toEqual([failed503, failed503])
          expect(requests).toBe(2)

          const waiting = await pollUntil(
            'the session waits for a person',
            async () => (await sessionCall(tree, 'read-waiting', { session })).body?.['waiting'],
            value => value !== null && value !== undefined,
          )
          open = true
          const retried = await sessionCall(tree, 'retry-run', {
            session,
            controlId: 'retry-1',
            run: (waiting as { run: string }).run,
          })
          expect(retried, JSON.stringify(retried)).toMatchObject({ outcome: 'succeeded' })

          const runs = await pollUntil(
            'the next Run to end',
            () => runsOf(tree, session),
            all => all.length === 2 && all.every(item => item['terminal'] !== null),
          )
          const next = runs.find(item => item['run'] !== run['run'])
          expect(next?.['terminal'], JSON.stringify(next)).toMatchObject({ outcome: 'completed' })
          expect(requests).toBe(3)
        },
      )
      expect(exitCode).toBe(0)
    },
  )
})
