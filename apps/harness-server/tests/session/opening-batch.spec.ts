// @module-tag slow
import { describe, expect, it } from 'vitest'
import type { GatewayScript } from '../fixtures/model-gateway.ts'
import { onReleaseTree, pollUntil, sse } from '../support/release-tree.ts'
import { emptySession, sendInput } from './observation-support.ts'

type Seen = Readonly<{ marks: readonly string[]; answered: 'ok' | '401' }>

const MARKS = ['MARK_A', 'MARK_B', 'MARK_C'] as const

/** A model that fails the first request that carries B without C, and answers every other one. */
function failingOnce(): Readonly<{ script: GatewayScript; seen: Seen[] }> {
  const seen: Seen[] = []
  let failed = false
  const script: GatewayScript = ({ body }) => {
    const marks = MARKS.filter(mark => body.includes(mark))
    const failing = !failed && marks.includes('MARK_B') && !marks.includes('MARK_C')
    if (failing) failed = true
    seen.push({ marks, answered: failing ? '401' : 'ok' })
    if (failing)
      return {
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'invalid key', code: 401 } }),
      }
    const serving = {
      model: (JSON.parse(body) as { model?: string }).model ?? 'm',
      provider: 'OpenAI',
    }
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        { ...serving, choices: [{ delta: { content: `reply ${String(seen.length)}` } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]),
    }
  }
  return { script, seen }
}

describe('a Run starts from every input that waits', () => {
  it('after a failed Run, the next Run hands the returned input and the new one to the model in one request', async () => {
    const model = failingOnce()
    await onReleaseTree({ script: model.script }, async tree => {
      const session = await emptySession(tree)
      const runs = async (): Promise<readonly string[]> =>
        (await tree.cli(['read-session-diagnostics', '--session', session])).stdout
          .split('\n')
          .filter(line => line.startsWith('Run '))
      const settled = (count: number) =>
        pollUntil(
          `${String(count)} ended Runs`,
          runs,
          lines => lines.length >= count && !lines.some(line => line.includes('not ended')),
        )

      await sendInput(tree, session, 'MARK_A first')
      await settled(1)
      await sendInput(tree, session, 'MARK_B second, its Run fails')
      const afterFailure = await settled(2)
      expect(afterFailure.filter(line => line.endsWith('failed'))).toHaveLength(1)

      const before = model.seen.length
      await sendInput(tree, session, 'MARK_C third')
      await settled(3)

      expect(model.seen.slice(before)).toEqual([
        { marks: ['MARK_A', 'MARK_B', 'MARK_C'], answered: 'ok' },
      ])
    })
  })
})
