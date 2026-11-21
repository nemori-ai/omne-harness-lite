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
import { withRouteReadingWordsOnly } from '../session-access/words-only-route.ts'

const PDF = new TextEncoder().encode('%PDF-1.4\nfixture body\n')
const LONG = 'The report says the passphrase is BLUE GIRAFFE 4172. '.repeat(400)
const NATIVE = [{ id: 'file-parser', pdf: { engine: 'native' } }]
const base64 = Buffer.from(PDF).toString('base64')

type Received = Parameters<GatewayScript>[0] & Readonly<{ spoken: string }>
function recording() {
  const received: Received[] = []
  const script: GatewayScript = request => {
    received.push({ ...request, spoken: interfacePath(request.path, request.rawBody) })
    const { model } = JSON.parse(request.body) as { model: string }
    const provider = model.startsWith('anthropic/') ? 'Anthropic' : 'OpenAI'
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        { model, provider, choices: [{ delta: { content: 'BLUE GIRAFFE 4172' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]),
    }
  }
  return { received, script }
}

async function emptySession(tree: ReleaseTree): Promise<string> {
  const created = await tree.cli(['create-session', '--definition', 'coding'])
  expect(created.status, created.stderr).toBe(0)
  return String(bodyOf(created)['session'])
}

/** Sends the PDF with a question and waits until its Run ended. */
async function asked(tree: ReleaseTree, session: string, ref: Reference) {
  const file = {
    kind: 'file',
    id: 'blk_file',
    visibility: { toHuman: true, toModel: true },
    ref,
    transcript: null,
  }
  const blocks = [words('blk_words', 'what is the passphrase?'), file]
  expect(await send(tree, session, 'asked', blocks)).toMatchObject({ outcome: 'succeeded' })
  return pollUntil(
    'the Run of the input to end',
    () => historyOf(tree, session),
    found => found.some(each => each.kind === 'run.terminal'),
  )
}
const terminalOf = (entries: Awaited<ReturnType<typeof asked>>) =>
  entries.find(each => each.kind === 'run.terminal')?.payload

describe('a PDF an input refers to, sent to a model that reads it natively (C33)', () => {
  it.each([
    ['Responses', 'openai/gpt-5.6-luna', '/responses', 'input_file'],
    ['Messages', 'anthropic/claude-haiku-5.5', '/messages', 'document'],
  ] as const)(
    'on %s the gateway receives the original file and is told to parse it natively',
    { tags: ['slow'], timeout: 360_000 },
    async (_engine, model, spoken, part) => {
      const { received, script } = recording()
      const exitCode = await onReleaseTree({ script, model }, async tree => {
        const session = await emptySession(tree)
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        const ref = await uploaded(client, tenant, 'file-native-1', PDF, 'application/pdf')
        const prepared = await client['prepare-media']({ tenant, ref })
        expect(prepared).toMatchObject({
          outcome: 'succeeded',
          body: { preprocess: { kind: 'done' } },
        })
        const entries = await asked(tree, session, ref)
        const carrying = received.filter(request => request.rawBody.includes(base64))
        expect(carrying).toHaveLength(1)
        const [request] = carrying
        expect(request?.spoken.endsWith(spoken)).toBe(true)
        const raw = JSON.parse(request!.rawBody) as { model: string; plugins?: unknown }
        expect(raw.model).toBe(model)
        expect(raw.plugins).toEqual(NATIVE)
        expect(request!.rawBody).toContain(`"type":"${part}"`)
        expect(terminalOf(entries)).toMatchObject({ terminal: { outcome: 'completed' } })
        expect(executionFailures(tree.storageRoot)).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )
})

/** An engine of this tenant for PDF that makes it into many words, kept apart from the block. */
async function longReader(tree: ReleaseTree): Promise<void> {
  const engines = tree.scope.get(mediaEnginesKey)
  if (engines === undefined) throw new Error('no engines in the tree')
  const answer = async () => ({ kind: 'converted' as const, text: LONG, derived: [] })
  engines.register(
    createScriptedEngine(answer, { name: 'doc.long', accepts: ['application/pdf'] }).engine,
  )
  const made = await tree.clients.assets['create-asset']({
    tenant: tenantOf(savedTenant(tree.home)),
    operation: 'define-application-pdf',
    category: 'converter',
    name: 'application-pdf',
    body: treeOf({
      kind: 'application-pdf',
      engine: 'doc.long',
      parameters: {},
      egress: { kind: 'in-process' },
    }),
  })
  if (made.outcome !== 'succeeded') throw new Error(JSON.stringify(made))
}

describe('the same model judged as reading words only (C34)', () => {
  it(
    'the gateway receives the extracted words, read back from where they were kept, and no file',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const model = 'openai/gpt-5.6-luna'
      const { received, script } = recording()
      const options = { script, model, ...withRouteReadingWordsOnly(model) }
      const exitCode = await onReleaseTree(options, async tree => {
        const session = await emptySession(tree)
        await longReader(tree)
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        const ref = await uploaded(client, tenant, 'file-words-1', PDF, 'application/pdf')
        const prepared = await client['prepare-media']({ tenant, ref })
        expect(prepared).toMatchObject({
          outcome: 'succeeded',
          body: { preprocess: { kind: 'done' } },
        })
        const entries = await asked(tree, session, ref)
        const asking = received.filter(request =>
          request.rawBody.includes('what is the passphrase?'),
        )
        expect(asking).toHaveLength(1)
        const [request] = asking
        expect(request!.rawBody).toContain(LONG.slice(0, 200))
        expect(request!.rawBody).not.toContain(base64)
        expect(request!.rawBody).not.toContain('input_file')
        expect(request!.rawBody).not.toContain('file-parser')
        expect(terminalOf(entries)).toMatchObject({ terminal: { outcome: 'completed' } })
        expect(executionFailures(tree.storageRoot)).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )
})
