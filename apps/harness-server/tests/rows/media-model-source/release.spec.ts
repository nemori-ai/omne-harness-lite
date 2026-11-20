// @module-tag slow
import { readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import { mediaModelSourceRow } from '../../../src/rows/media-model-source/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { interfacePath } from '../../fixtures/gateway-wire.ts'
import type { GatewayScript } from '../../fixtures/model-gateway.ts'
import { bodyOf } from '../../r9/support.ts'
import {
  executionFailures,
  historyOf,
  onReleaseTree,
  pollUntil,
  sse,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { mediaClientOf, noisePng } from '../media-access/support.ts'
import { picture, send, uploaded, words, type Reference } from '../media-intake/support.ts'

const PICTURE = noisePng(64, 48)
const IMAGE_BYTES_LIMIT = 4_194_304
const base64Of = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

type Received = Parameters<GatewayScript>[0] & Readonly<{ spoken: string }>
/** A model that answers every request with words, as the provider its model is served by. */
function recording() {
  const received: Received[] = []
  const script: GatewayScript = request => {
    received.push({ ...request, spoken: interfacePath(request.path, request.rawBody) })
    const { model } = JSON.parse(request.body) as { model: string }
    const serving = { model, provider: model.startsWith('anthropic/') ? 'Anthropic' : 'OpenAI' }
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        { ...serving, choices: [{ delta: { content: 'done' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]),
    }
  }
  return { received, script }
}

function filesUnder(root: string, wanted: (name: string) => boolean): string[] {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (wanted(entry.name)) found.push(path)
    }
  }
  walk(root)
  return found
}

/** Every value every table of the storage holds, as text: packed text unpacked, other bytes as they are. */
function storedTexts(storageRoot: string): string[] {
  const texts: string[] = []
  for (const file of filesUnder(storageRoot, name => /\.(sqlite|db)$/u.test(name))) {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
      for (const { name } of tables)
        for (const row of db.prepare(`SELECT * FROM "${String(name)}"`).all())
          for (const value of Object.values(row)) {
            if (typeof value === 'string') texts.push(value)
            if (!(value instanceof Uint8Array)) continue
            texts.push(Buffer.from(value).toString('latin1'))
            try {
              texts.push(unpackText(value))
            } catch {
              // Not packed text: the bytes themselves were looked at above.
            }
          }
    } finally {
      db.close()
    }
  }
  return texts
}

async function emptySession(tree: ReleaseTree): Promise<string> {
  const created = await tree.cli(['create-session', '--definition', 'coding'])
  expect(created.status, created.stderr).toBe(0)
  return String(bodyOf(created)['session'])
}
/** Sends one input with the picture and waits until its Run ended. */
async function pictured(tree: ReleaseTree, ref: Reference, input = 'pictured') {
  const session = await emptySession(tree)
  const blocks = [words('blk_words', 'look at this'), picture('blk_picture', ref)]
  expect(await send(tree, session, input, blocks)).toMatchObject({ outcome: 'succeeded' })
  const entries = await pollUntil(
    'the Run of the pictured input to end',
    () => historyOf(tree, session),
    found => found.some(each => each.kind === 'run.terminal'),
  )
  return { session, entries }
}
const terminalOf = (entries: Awaited<ReturnType<typeof pictured>>['entries']) =>
  entries.find(each => each.kind === 'run.terminal')?.payload

describe('the row media-model-source', () => {
  it('declares the manifest of the stub table', () => {
    const declared = rowDeclarationOf(mediaModelSourceRow)
    expect(declared).toMatchObject({
      row: 'media-model-source',
      implementation: 'real',
      lifecycle: { kind: 'none' },
      manifest: { provides: ['modelMediaSource'], injects: ['media'] },
    })
    const stub = rowManifests.get(declared!.row)
    expect(stub?.provides).toEqual(['s0.modelMediaSource'])
    expect(stub?.injects).toEqual(['s0.media'])
  })
})

describe('a picture an input refers to, when its request is sent (C15)', () => {
  it.each([
    ['chat-completions', 'openai/gpt-5.6-sol', '/chat/completions'],
    ['Responses', 'openai/gpt-6.1-sol', '/responses'],
    ['Messages', 'anthropic/claude-sonnet-5.5', '/messages'],
  ] as const)(
    'on %s the gateway receives the bytes of the original, and the storage holds none of them',
    { tags: ['slow'], timeout: 360_000 },
    async (_engine, model, spoken) => {
      const { received, script } = recording()
      const exitCode = await onReleaseTree({ script, model }, async tree => {
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        const ref = await uploaded(client, tenant, 'source-upload-1', PICTURE)
        const { entries } = await pictured(tree, ref)
        const sent = base64Of(PICTURE)
        const carrying = received.filter(request => request.rawBody.includes(sent))
        expect(carrying).toHaveLength(1)
        expect(carrying[0]?.spoken.endsWith(spoken)).toBe(true)
        expect(JSON.parse(carrying[0]!.rawBody)).toMatchObject({ model })
        expect(terminalOf(entries)).toMatchObject({ terminal: { outcome: 'completed' } })
        const raw = Buffer.from(PICTURE.subarray(64, 128)).toString('latin1')
        const inside = sent.slice(40, 120)
        const texts = storedTexts(tree.storageRoot)
        expect(texts.some(text => text.includes(ref.key))).toBe(true)
        expect(texts.filter(text => text.includes(inside) || text.includes(raw))).toEqual([])
        expect(executionFailures(tree.storageRoot)).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )
})

describe('a picture that cannot be sent as it is (C16)', () => {
  it(
    'a picture over the limit of the model for one image is sent as a smaller version within it',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const { received, script } = recording()
      const large = noisePng(1400, 1100)
      expect(large.byteLength).toBeGreaterThan(IMAGE_BYTES_LIMIT)
      const exitCode = await onReleaseTree({ script }, async tree => {
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        const ref = await uploaded(client, tenant, 'source-upload-large', large)
        const { entries } = await pictured(tree, ref)
        const sent = received.flatMap(request => [
          ...request.body.matchAll(/data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)/gu),
        ])
        expect(sent).toHaveLength(1)
        const [, mediaType = '', data = ''] = sent[0] ?? []
        const bytes = Buffer.from(data, 'base64')
        expect(bytes.byteLength).toBeGreaterThan(1_000)
        expect(bytes.byteLength).toBeLessThanOrEqual(IMAGE_BYTES_LIMIT)
        expect(['image/png', 'image/jpeg', 'image/webp', 'image/gif']).toContain(mediaType)
        expect(terminalOf(entries)).toMatchObject({ terminal: { outcome: 'completed' } })
        expect(await client['describe-media']({ tenant, ref })).toMatchObject({
          body: { state: 'held', facts: { widthPixels: 1400, heightPixels: 1100 } },
        })
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'bytes that are gone leave the request unsent: material unavailable, not a missing modality',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const { received, script } = recording()
      const exitCode = await onReleaseTree({ script }, async tree => {
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        const ref = await uploaded(client, tenant, 'source-upload-gone', PICTURE)
        const objects = filesUnder(
          join(dirname(tree.storageRoot), 'media'),
          name => name === ref.key,
        )
        expect(objects).toHaveLength(1)
        for (const object of objects) rmSync(object)
        const { entries } = await pictured(tree, ref)
        expect(terminalOf(entries)).toMatchObject({
          terminal: { outcome: 'failed' },
          cause: {
            record: expect.stringMatching(
              /\/model-failed\/input-rejected\/material-unavailable$/u,
            ) as unknown,
          },
        })
        expect(received).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )
})

describe('the release tree without the row media-model-source (C16, C22)', () => {
  it(
    'a request that refers to a picture is not sent while no source is there; words go on as before',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const { received, script } = recording()
      const options = { script, withoutRows: ['media-model-source'] }
      const exitCode = await onReleaseTree(options, async tree => {
        expect(tree.scope.get('modelMediaSource')).toBeUndefined()
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        const ref = await uploaded(client, tenant, 'source-upload-norow', PICTURE)
        const quiet = await tree.startSession('hello')
        const ended = await pollUntil(
          'the Run of words to end',
          () => historyOf(tree, quiet),
          found => found.some(entry => entry.kind === 'run.terminal'),
        )
        expect(terminalOf(ended)).toMatchObject({ terminal: { outcome: 'completed' } })
        expect(received).toHaveLength(1)
        const session = await emptySession(tree)
        const blocks = [words('blk_words', 'look at this'), picture('blk_picture', ref)]
        expect(await send(tree, session, 'pictured', blocks)).toMatchObject({
          outcome: 'succeeded',
        })
        await pollUntil(
          'the Run of the pictured input to start',
          () => historyOf(tree, session),
          found => found.some(entry => entry.kind === 'run.started'),
        )
        await new Promise(resolve => setTimeout(resolve, 6_000))
        const entries = await historyOf(tree, session)
        expect(received).toHaveLength(1)
        expect(entries.some(entry => entry.kind === 'run.terminal')).toBe(false)
      })
      expect(exitCode).toBe(0)
    },
  )
})
