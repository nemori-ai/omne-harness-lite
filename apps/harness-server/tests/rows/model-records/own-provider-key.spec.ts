// @module-tag slow
import { describe, expect, it } from 'vitest'
import type { GatewayScript } from '../../fixtures/model-gateway.ts'
import { TEST_DEPLOYMENT_KEY, TEST_OPENAI_DEPLOYMENT_KEY, bodyOf } from '../../r9/support.ts'
import { setModelSwitches } from '../../support/model-switches.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  sse,
  type ReleaseTree,
} from '../../support/release-tree.ts'

// The same model name at two providers: OpenAI serves it directly, OpenRouter under its own name.
const DIRECT = 'gpt-6-luna'
const VIA_OPENROUTER = 'openai/gpt-6.1-sol'

type Received = Readonly<{ model: string; rawBody: string }>
function recording() {
  const received: Received[] = []
  const script: GatewayScript = request => {
    const { model } = JSON.parse(request.body) as { model: string }
    received.push({ model, rawBody: request.rawBody })
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        { model, provider: 'OpenAI', choices: [{ delta: { content: 'ok' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]),
    }
  }
  return { received, script }
}

async function turn(tree: ReleaseTree, session: string, text: string, runs: number) {
  const sent = await tree.cli(['send-input', '--session', session, '--text', text])
  expect(sent.status, sent.stderr).toBe(0)
  await pollUntil(
    `run ${String(runs)} to end`,
    () => historyOf(tree, session),
    found => found.filter(each => each.kind === 'run.terminal').length >= runs,
  )
}

describe('the key of a provider goes only to that provider (C9, I-5)', () => {
  it(
    'a turn at OpenAI carries the OpenAI key and a turn at OpenRouter the OpenRouter key, never the other',
    { tags: ['slow'], timeout: 480_000 },
    async () => {
      const { received, script } = recording()
      const exitCode = await onReleaseTree({ script, model: VIA_OPENROUTER }, async tree => {
        // The release starts the direct models off; the tenant turns the chat one on.
        await setModelSwitches(tree, { [DIRECT]: true }, 'llm', 'openai')
        const created = await tree.cli([
          'create-session',
          '--definition',
          'coding',
          '--model',
          DIRECT,
        ])
        expect(created.status, created.stderr).toBe(0)
        const session = String(bodyOf(created)['session'])
        await turn(tree, session, 'first', 1)
        const selected = await tree.cli([
          'select-model',
          '--session',
          session,
          '--model',
          VIA_OPENROUTER,
        ])
        expect(selected.status, selected.stderr).toBe(0)
        await turn(tree, session, 'second', 2)
        expect(received.map(request => request.model)).toEqual([DIRECT, VIA_OPENROUTER])
        expect(tree.modelAuthorizations()).toEqual([
          `Bearer ${TEST_OPENAI_DEPLOYMENT_KEY}`,
          `Bearer ${TEST_DEPLOYMENT_KEY}`,
        ])
        for (const request of received) {
          expect(request.rawBody).not.toContain(TEST_DEPLOYMENT_KEY)
          expect(request.rawBody).not.toContain(TEST_OPENAI_DEPLOYMENT_KEY)
        }
      })
      expect(exitCode).toBe(0)
    },
  )
})
