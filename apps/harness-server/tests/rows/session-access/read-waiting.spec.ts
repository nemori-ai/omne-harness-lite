// @module-tag slow
// Slow: runs the release tree in process with a local model gateway and waits for a Run to fail.
import { describe, expect, it } from 'vitest'
import type { GatewayScript } from '../../fixtures/model-gateway.ts'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import { onReleaseTree, pollUntil, type ReleaseTree } from '../../support/release-tree.ts'

type Answer = Readonly<{ status: number; outcome: string; body: Record<string, unknown> }>

type Waiting = Readonly<{
  run: string
  pending: number
  cause: Readonly<{ kind: string; detail: string | null }> | null
}>

let sequence = 0

async function call(tree: ReleaseTree, operation: string, body: object): Promise<Answer> {
  sequence += 1
  const response = await fetch(
    `http://127.0.0.1:${String(tree.port)}/api/session/v1/${operation}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${savedLoginProof(tree.home)}`,
        'content-type': 'application/json',
        'omne-message-id': `m-read-waiting-${String(sequence)}`,
      },
      body: JSON.stringify(body),
    },
  )
  const parsed = JSON.parse(await response.text()) as {
    outcome: string
    body?: Record<string, unknown>
  }
  return { status: response.status, outcome: parsed.outcome, body: parsed.body ?? {} }
}

async function readWaiting(tree: ReleaseTree, session: string): Promise<Waiting | null> {
  const answer = await call(tree, 'read-waiting', { tenant: savedTenant(tree.home), session })
  expect(answer.status, JSON.stringify(answer)).toBe(200)
  expect(answer.outcome, JSON.stringify(answer)).toBe('succeeded')
  return answer.body['waiting'] as Waiting | null
}

const sse = (events: readonly unknown[]): string =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

function failingUntilOpened(): { script: GatewayScript; open(): void } {
  let failing = true
  return {
    open: () => {
      failing = false
    },
    script: ({ body }) =>
      failing
        ? {
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: { message: 'the input is rejected', code: 400 } }),
          }
        : {
            status: 200,
            contentType: 'text/event-stream',
            body: sse([
              {
                model: (JSON.parse(body) as { model?: string }).model ?? 'm',
                provider: 'OpenAI',
                choices: [{ delta: { content: 'answered after the retry' } }],
              },
              { choices: [{ delta: {}, finish_reason: 'stop' }] },
            ]),
          },
  }
}

describe('read-waiting on the release tree', () => {
  it(
    'after a Run fails reads the waiting Run, the one pending input and the cause kind; after a retry reads nothing',
    { timeout: 180_000 },
    async () => {
      const gateway = failingUntilOpened()
      const exitCode = await onReleaseTree({ script: gateway.script }, async tree => {
        const session = await tree.startSession('please answer')
        const waiting = await pollUntil(
          'the session waits for a person',
          () => readWaiting(tree, session),
          value => value !== null,
        )
        expect(waiting).toMatchObject({ pending: 1, cause: { kind: 'no-reply' } })
        expect(waiting?.run).toMatch(/.+/)
        gateway.open()
        const retried = await call(tree, 'retry-run', {
          tenant: savedTenant(tree.home),
          session,
          controlId: 'retry-1',
          run: waiting?.run,
        })
        expect(retried, JSON.stringify(retried)).toMatchObject({
          status: 200,
          outcome: 'succeeded',
          body: { recovered: false },
        })
        expect(await readWaiting(tree, session)).toBeNull()
      })
      expect(exitCode).toBe(0)
    },
  )
})
