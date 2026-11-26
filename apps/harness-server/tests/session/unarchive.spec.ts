// @module-tag slow
import { describe, expect, it } from 'vitest'
import type { GatewayScript } from '../fixtures/model-gateway.ts'
import { onReleaseTree, pollUntil, sse } from '../support/release-tree.ts'
import { emptySession, sendInput } from './observation-support.ts'

function answering(): Readonly<{ script: GatewayScript; bodies: string[] }> {
  const bodies: string[] = []
  const script: GatewayScript = ({ body }) => {
    bodies.push(body)
    const serving = {
      model: (JSON.parse(body) as { model?: string }).model ?? 'm',
      provider: 'OpenAI',
    }
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        { ...serving, choices: [{ delta: { content: `reply ${String(bodies.length)}` } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]),
    }
  }
  return { script, bodies }
}

describe('a session that was archived and unarchived', () => {
  it('works as one that never was: its next Run completes, and the model is told the session modes', async () => {
    const model = answering()
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

      await sendInput(tree, session, 'MARK_BEFORE the archive')
      await settled(1)
      expect((await tree.cli(['archive-session', '--session', session])).status).toBe(0)
      expect((await tree.cli(['unarchive-session', '--session', session])).status).toBe(0)

      const before = model.bodies.length
      await sendInput(tree, session, 'MARK_AFTER the unarchive')
      const ended = await settled(2)
      expect(ended.filter(line => line.endsWith('completed'))).toHaveLength(2)
      const [request] = model.bodies.slice(before)
      expect(model.bodies.slice(before)).toHaveLength(1)
      expect(request).toContain('MARK_AFTER')
      expect(request).toContain('session.modes')
    })
  }, 90_000)
})
