// @module-tag slow
import { describe, expect, it } from 'vitest'
import { createScriptedEngine } from '@omne-harness/media-contract/testing'
import { mediaEnginesKey } from '@omne-harness/media-cordis-contract/cordis'
import { interfacePath } from '../../fixtures/gateway-wire.ts'
import type { GatewayScript } from '../../fixtures/model-gateway.ts'
import { bodyOf, savedTenant } from '../../r9/support.ts'
import { tenantOf } from '../../support/protocol-clients.ts'
import {
  executionFailures,
  historyOf,
  onReleaseTree,
  pollUntil,
  sse,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { mediaClientOf } from '../media-access/support.ts'
import { send, treeOf, uploaded, words, type Reference } from '../media-intake/support.ts'
import { setModelSwitches } from '../../support/model-switches.ts'
import { selectModel } from '../session-access/words-only-route.ts'

const READS_WORDS = 'openai/gpt-6.1-sol'
const HEARS = 'qwen/qwen3.8-omni-flash'
const HEARD = '今天下午三点开会'
const PROVIDERS: Readonly<Record<string, string>> = { [READS_WORDS]: 'OpenAI', [HEARS]: 'Alibaba' }

/** One second of 8 kHz, 8-bit mono speech-shaped bytes in a RIFF container. */
function wav(): Uint8Array {
  const samples = 8000
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const tag = (at: number, text: string) => bytes.set(new TextEncoder().encode(text), at)
  tag(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  tag(8, 'WAVE')
  tag(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 8000, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  tag(36, 'data')
  view.setUint32(40, samples, true)
  for (let at = 0; at < samples; at += 1) bytes[44 + at] = 128 + Math.round(60 * Math.sin(at / 9))
  return bytes
}

type Received = Parameters<GatewayScript>[0] & Readonly<{ spoken: string; model: string }>
function recording() {
  const received: Received[] = []
  const script: GatewayScript = request => {
    const { model } = JSON.parse(request.body) as { model: string }
    received.push({ ...request, spoken: interfacePath(request.path, request.rawBody), model })
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        { model, provider: PROVIDERS[model] ?? 'OpenAI', choices: [{ delta: { content: 'ok' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]),
    }
  }
  return { received, script }
}

/** A converter of this tenant for speech whose engine counts how often it was asked. */
async function countedConverter(tree: ReleaseTree) {
  const engines = tree.scope.get(mediaEnginesKey)
  if (engines === undefined) throw new Error('no engines in the tree')
  const answer = async () => ({ kind: 'converted' as const, text: HEARD, derived: [] })
  const scripted = createScriptedEngine(answer, { name: 'voice.counted', accepts: ['audio/*'] })
  engines.register(scripted.engine)
  const made = await tree.clients.assets['create-asset']({
    tenant: tenantOf(savedTenant(tree.home)),
    operation: 'define-voice',
    category: 'converter',
    name: 'voice',
    body: treeOf({
      kind: 'voice',
      engine: 'voice.counted',
      parameters: {},
      egress: { kind: 'in-process' },
    }),
  })
  if (made.outcome !== 'succeeded') throw new Error(JSON.stringify(made))
  return scripted.calls
}

async function ended(tree: ReleaseTree, session: string, runs: number) {
  await pollUntil(
    `run ${String(runs)} to end`,
    () => historyOf(tree, session),
    found => found.filter(each => each.kind === 'run.terminal').length >= runs,
  )
}

describe('switching the model of a history with a voice in it (C35)', () => {
  it(
    'a model that hears gets the original, one that reads gets the transcript, and the speech is converted once',
    { tags: ['slow'], timeout: 480_000 },
    async () => {
      const { received, script } = recording()
      const speech = wav()
      const original = Buffer.from(speech).toString('base64')
      const exitCode = await onReleaseTree({ script, model: READS_WORDS }, async tree => {
        // The release starts the model that hears off; the tenant turns it on.
        await setModelSwitches(tree, { [HEARS]: true })
        const created = await tree.cli(['create-session', '--definition', 'coding'])
        expect(created.status, created.stderr).toBe(0)
        const session = String(bodyOf(created)['session'])
        const calls = await countedConverter(tree)
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        const ref: Reference = await uploaded(client, tenant, 'switch-voice-1', speech, 'audio/wav')
        const prepared = await client['prepare-media']({ tenant, ref })
        expect(prepared).toMatchObject({
          outcome: 'succeeded',
          body: { preprocess: { kind: 'done' } },
        })
        const voice = {
          kind: 'voice',
          id: 'blk_voice',
          visibility: { toHuman: true, toModel: true },
          ref,
          transcript: null,
        }
        const turns: { model: string; input: string }[] = [
          { model: READS_WORDS, input: 'first' },
          { model: HEARS, input: 'second' },
          { model: READS_WORDS, input: 'third' },
        ]
        for (const [index, turn] of turns.entries()) {
          if (index > 0) {
            const selected = await selectModel(tree, session, turn.model, `switch-${String(index)}`)
            expect(selected).toMatchObject({ outcome: 'succeeded' })
          }
          const blocks =
            index === 0
              ? [words('blk_words', 'listen to this'), voice]
              : [words(`blk_${turn.input}`, `and now (${turn.input})`)]
          expect(await send(tree, session, turn.input, blocks)).toMatchObject({
            outcome: 'succeeded',
          })
          await ended(tree, session, index + 1)
        }
        // Each request carries the history before it, so a turn's own request is the first with its words.
        expect(received).toHaveLength(3)
        const [first, second, third] = received as [Received, Received, Received]
        expect(second.rawBody).toContain('(second)')
        expect(third.rawBody).toContain('(third)')
        expect([first.model, second.model, third.model]).toEqual([READS_WORDS, HEARS, READS_WORDS])
        expect(first.rawBody).toContain(HEARD)
        expect(first.rawBody).not.toContain(original)
        expect(second.rawBody).toContain(original)
        expect(second.rawBody).not.toContain(HEARD)
        expect(third.rawBody).toContain(HEARD)
        expect(third.rawBody).not.toContain(original)
        expect(calls).toHaveLength(1)
        expect(executionFailures(tree.storageRoot)).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )
})
