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

const MODEL = 'qwen/qwen3.8-omni-flash'
const HEARD = '蓝色长颈鹿四一七二'

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
  for (let at = 0; at < samples; at += 1) bytes[44 + at] = 128 + Math.round(60 * Math.sin(at / 7))
  return bytes
}

type Received = Parameters<GatewayScript>[0] & Readonly<{ spoken: string }>
function recording() {
  const received: Received[] = []
  const script: GatewayScript = request => {
    received.push({ ...request, spoken: interfacePath(request.path, request.rawBody) })
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        { model: MODEL, provider: 'Alibaba', choices: [{ delta: { content: HEARD } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]),
    }
  }
  return { received, script }
}

/** A converter of this tenant for speech, so the voice is prepared before it is sent. */
async function voiceConverter(tree: ReleaseTree): Promise<void> {
  const engines = tree.scope.get(mediaEnginesKey)
  if (engines === undefined) throw new Error('no engines in the tree')
  const answer = async () => ({
    kind: 'converted' as const,
    text: '一段没有用到的转写',
    derived: [],
  })
  engines.register(
    createScriptedEngine(answer, { name: 'voice.heard', accepts: ['audio/*'] }).engine,
  )
  const tenant = tenantOf(savedTenant(tree.home))
  const made = await tree.clients.assets['create-asset']({
    tenant,
    operation: 'define-voice',
    category: 'converter',
    name: 'voice',
    body: treeOf({
      kind: 'voice',
      engine: 'voice.heard',
      parameters: {},
      egress: { kind: 'in-process' },
    }),
  })
  if (made.outcome !== 'succeeded') throw new Error(JSON.stringify(made))
}

describe('a voice an input refers to, sent to a model that hears speech (C32)', () => {
  it(
    'the gateway receives the original as input_audio on chat-completions, not its transcript',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const { received, script } = recording()
      const speech = wav()
      const exitCode = await onReleaseTree({ script, model: MODEL }, async tree => {
        const created = await tree.cli(['create-session', '--definition', 'coding'])
        expect(created.status, created.stderr).toBe(0)
        const session = String(bodyOf(created)['session'])
        await voiceConverter(tree)
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        const ref: Reference = await uploaded(client, tenant, 'voice-native-1', speech, 'audio/wav')
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
        expect(
          await send(tree, session, 'heard', [
            words('blk_words', 'what is the passphrase?'),
            voice,
          ]),
        ).toMatchObject({ outcome: 'succeeded' })
        const entries = await pollUntil(
          'the Run of the voiced input to end',
          () => historyOf(tree, session),
          found => found.some(each => each.kind === 'run.terminal'),
        )
        const sent = Buffer.from(speech).toString('base64')
        const carrying = received.filter(request => request.rawBody.includes(sent))
        expect(carrying).toHaveLength(1)
        const [request] = carrying
        expect(request?.spoken.endsWith('/chat/completions')).toBe(true)
        const body = JSON.parse(request!.rawBody) as {
          model: string
          messages: { content: unknown }[]
        }
        expect(body.model).toBe(MODEL)
        const parts = body.messages.flatMap(each =>
          Array.isArray(each.content) ? (each.content as unknown[]) : [],
        )
        expect(parts).toContainEqual({
          type: 'input_audio',
          input_audio: { data: sent, format: 'wav' },
        })
        expect(request!.rawBody).not.toContain('一段没有用到的转写')
        expect(entries.find(each => each.kind === 'run.terminal')?.payload).toMatchObject({
          terminal: { outcome: 'completed' },
        })
        expect(executionFailures(tree.storageRoot)).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )
})
