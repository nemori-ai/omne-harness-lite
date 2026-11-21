// @module-tag slow
import { describe, expect, it } from 'vitest'
import { createScriptedEngine } from '@omne-harness/media-contract/testing'
import { mediaEnginesKey } from '@omne-harness/media-cordis-contract/cordis'
import type { GatewayScript } from '../../fixtures/model-gateway.ts'
import { bodyOf, savedTenant } from '../../r9/support.ts'
import { sessionRef, tenantOf } from '../../support/protocol-clients.ts'
import {
  executionFailures,
  historyOf,
  onReleaseTree,
  pollUntil,
  sse,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { mediaClientOf, noisePng } from '../media-access/support.ts'
import { picture, send, treeOf, uploaded, words, type Reference } from '../media-intake/support.ts'
import { selectModel, withRouteReadingWordsOnly } from '../session-access/words-only-route.ts'

const SEES = 'openai/gpt-6.1-sol'
const READS_PDF_AS_WORDS = 'openai/gpt-5.6-luna'
const HEARD = '今天下午三点开会'
const EXTRACTED = 'The extracted report says the passphrase is BLUE GIRAFFE 4172. '.repeat(300)
const PDF = new TextEncoder().encode('%PDF-1.4\nfixture body\n')
const SHOWN = { toHuman: true, toModel: true }
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

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
  for (let at = 0; at < samples; at += 1) bytes[44 + at] = 128 + Math.round(50 * Math.sin(at / 5))
  return bytes
}

type Received = Parameters<GatewayScript>[0]
function recording() {
  const received: Received[] = []
  const script: GatewayScript = request => {
    received.push(request)
    const { model } = JSON.parse(request.body) as { model: string }
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

/** This tenant's converters: speech into a few words, a PDF into many words kept apart. */
async function converters(tree: ReleaseTree): Promise<void> {
  const engines = tree.scope.get(mediaEnginesKey)
  if (engines === undefined) throw new Error('no engines in the tree')
  const into = (text: string) => async () => ({ kind: 'converted' as const, text, derived: [] })
  engines.register(
    createScriptedEngine(into(HEARD), { name: 'voice.reads', accepts: ['audio/*'] }).engine,
  )
  engines.register(
    createScriptedEngine(into(EXTRACTED), { name: 'doc.reads', accepts: ['application/pdf'] })
      .engine,
  )
  for (const [name, engine] of [
    ['voice', 'voice.reads'],
    ['application-pdf', 'doc.reads'],
  ] as const) {
    const made = await tree.clients.assets['create-asset']({
      tenant: tenantOf(savedTenant(tree.home)),
      operation: `define-${name}`,
      category: 'converter',
      name,
      body: treeOf({ kind: name, engine, parameters: {}, egress: { kind: 'in-process' } }),
    })
    if (made.outcome !== 'succeeded') throw new Error(JSON.stringify(made))
  }
}

async function created(tree: ReleaseTree): Promise<string> {
  const made = await tree.cli(['create-session', '--definition', 'coding'])
  expect(made.status, made.stderr).toBe(0)
  return String(bodyOf(made)['session'])
}

/** Sends one input with the block, waits for its Run, and gives the request the gateway got for it. */
async function asked(
  tree: ReleaseTree,
  received: Received[],
  session: string,
  block: object,
  input: string,
) {
  const before = received.length
  const blocks = [words(`blk_${input}_words`, `look (${input})`), block]
  expect(await send(tree, session, input, blocks)).toMatchObject({ outcome: 'succeeded' })
  await pollUntil(
    `the Run of ${input} to end`,
    () => historyOf(tree, session),
    found => found.some(each => each.kind === 'run.terminal'),
  )
  const mine = received.slice(before)
  expect(mine).toHaveLength(1)
  return mine[0]!.rawBody
}

/** What the session diagnostics say the model read of each block. */
async function readsOf(tree: ReleaseTree, session: string) {
  const page = await tree.clients.sessionDiagnostics['read-session-diagnostics']({
    tenant: tenantOf(savedTenant(tree.home)),
    session: sessionRef(session),
    cursor: null,
    run: null,
    pageBytes: '65536',
  } as never)
  if (page.outcome !== 'succeeded') throw new Error(JSON.stringify(page))
  const body = page.body as unknown as {
    runs: { modelCalls: { reads: { block: string; read: string }[] }[] }[]
  }
  return body.runs.flatMap(run => run.modelCalls.flatMap(call => call.reads))
}

describe('which representation the model read, as the diagnostics say and as the gateway got it (C36)', () => {
  it(
    'the original, a smaller version, a transcript and extracted words: each read agrees with the request sent',
    { tags: ['slow'], timeout: 600_000 },
    async () => {
      const { received, script } = recording()
      const small = noisePng(64, 48)
      const large = noisePng(1400, 1100)
      const speech = wav()
      const options = { script, model: SEES, ...withRouteReadingWordsOnly(READS_PDF_AS_WORDS) }
      const exitCode = await onReleaseTree(options, async tree => {
        const first = await created(tree)
        await converters(tree)
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        const upload = async (
          name: string,
          bytes: Uint8Array,
          mediaType: string,
        ): Promise<Reference> => {
          const ref = await uploaded(client, tenant, name, bytes, mediaType)
          expect(await client['prepare-media']({ tenant, ref })).toMatchObject({
            outcome: 'succeeded',
          })
          return ref
        }

        const original = await asked(
          tree,
          received,
          first,
          picture('blk_small', await upload('reads-small', small, 'image/png')),
          'small',
        )
        expect(original).toContain(base64(small))
        expect(await readsOf(tree, first)).toContainEqual(
          expect.objectContaining({ block: 'blk_small', read: 'original' }),
        )

        const second = await created(tree)
        const fitted = await asked(
          tree,
          received,
          second,
          picture('blk_large', await upload('reads-large', large, 'image/png')),
          'large',
        )
        expect(fitted).toMatch(/data:image\/[a-z]+;base64,/u)
        expect(fitted).not.toContain(base64(large).slice(0, 4000))
        expect(await readsOf(tree, second)).toContainEqual(
          expect.objectContaining({ block: 'blk_large', read: 'fitted' }),
        )

        const third = await created(tree)
        const voice = {
          kind: 'voice',
          id: 'blk_voice',
          visibility: SHOWN,
          ref: await upload('reads-voice', speech, 'audio/wav'),
          transcript: null,
        }
        const heard = await asked(tree, received, third, voice, 'voice')
        expect(heard).toContain(HEARD)
        expect(heard).not.toContain(base64(speech))
        expect(await readsOf(tree, third)).toContainEqual(
          expect.objectContaining({ block: 'blk_voice', read: 'transcript' }),
        )

        const fourth = await created(tree)
        expect(await selectModel(tree, fourth, READS_PDF_AS_WORDS, 'reads-pdf')).toMatchObject({
          outcome: 'succeeded',
        })
        const file = {
          kind: 'file',
          id: 'blk_pdf',
          visibility: SHOWN,
          ref: await upload('reads-pdf', PDF, 'application/pdf'),
          transcript: null,
        }
        const extracted = await asked(tree, received, fourth, file, 'pdf')
        expect(extracted).toContain(EXTRACTED.slice(0, 200))
        expect(extracted).not.toContain(base64(PDF))
        expect(await readsOf(tree, fourth)).toContainEqual(
          expect.objectContaining({ block: 'blk_pdf', read: 'transcript' }),
        )

        expect(executionFailures(tree.storageRoot)).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )
})
