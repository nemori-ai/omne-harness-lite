// @module-tag slow
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { crc32 } from 'node:zlib'
import { createImageCodec } from '@omne-harness/media-image'
import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import { mediaToolStoreRow } from '../../../src/rows/media-tool-store/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import type { GatewayScript } from '../../fixtures/model-gateway.ts'
import { bodyOf } from '../../r9/support.ts'
import {
  executionFailures,
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { storedTexts } from '../../support/stored-texts.ts'
import { mediaClientOf, noisePng } from '../media-access/support.ts'
import { WITH_PROFILES_THAT_TAKE_WORDS_ONLY } from '../session-access/words-only-route.ts'

const PNG = noisePng(64, 48)
const base64Of = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

type Message = Readonly<{ role: string; content: unknown; tool_calls?: readonly unknown[] }>
type Received = Parameters<GatewayScript>[0]

/** A model that makes the one call its last user message names, then answers with words. */
function calling() {
  const received: Received[] = []
  const pick = toolCallsByRequest(body => {
    const { messages } = JSON.parse(body) as { messages: readonly Message[] }
    const at = messages.findLastIndex(message => message.role === 'user')
    const asked = /CALL (\w+) ([\w.]+)/u.exec(JSON.stringify(messages[at]?.content ?? ''))
    const called = messages.slice(at + 1).some(message => (message.tool_calls?.length ?? 0) > 0)
    if (asked === null || called) return []
    const [, command = '', path = ''] = asked
    return [
      {
        id: `call_${String(at)}`,
        tool: 'Files',
        arguments: JSON.stringify({ command, intent: 'test call', params: { path } }),
      },
    ]
  })
  const script: GatewayScript = request => {
    received.push(request)
    return pick(request)
  }
  return { received, script }
}

/** The same picture in another format: what the image codec of media makes of the PNG. */
async function reencoded(mediaType: 'image/jpeg' | 'image/webp'): Promise<Uint8Array> {
  const codec = createImageCodec({
    maxWidth: 64,
    maxHeight: 64,
    maxDecodedBytes: 64 * 64 * 4,
    concurrency: 1,
  })
  const fitted = await codec.fit(PNG, {
    mediaTypes: [mediaType],
    maxBytes: 1 << 20,
    maxWidth: 64,
    maxHeight: 48,
  })
  if ('failure' in fitted || fitted.ok.mediaType !== mediaType) throw new Error(`no ${mediaType}`)
  return fitted.ok.bytes
}

/** A PNG that declares two frames: the animation chunk goes in right after the header chunk. */
function animated(png: Uint8Array): Uint8Array {
  const bytes = Buffer.from(png)
  const header = 8 + 12 + bytes.readUInt32BE(8)
  const body = Buffer.concat([Buffer.from('acTL'), Buffer.from([0, 0, 0, 2, 0, 0, 0, 0])])
  const sized = Buffer.alloc(4)
  sized.writeUInt32BE(8)
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([bytes.subarray(0, header), sized, body, sum, bytes.subarray(header)])
}

/** The server's default directory: where a session with no workspace works. */
function placed(tree: ReleaseTree, name: string, bytes: Uint8Array | string): string {
  const directory = join(dirname(tree.storageRoot), 'workspace')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, name), bytes)
  return name
}

async function emptySession(tree: ReleaseTree): Promise<string> {
  const created = await tree.cli(['create-session', '--definition', 'coding'])
  expect(created.status, created.stderr).toBe(0)
  return String(bodyOf(created)['session'])
}

/** Sends one input that makes the model call a Files command, and waits until `runs` Runs ended. */
async function called(tree: ReleaseTree, session: string, call: string, runs = 1) {
  const sent = await tree.cli(['send-input', '--session', session, '--text', `CALL ${call}`])
  expect(sent.status, sent.stderr).toBe(0)
  const entries = await pollUntil(
    `${String(runs)} Runs of the session to end`,
    () => historyOf(tree, session),
    found => found.filter(each => each.kind === 'run.terminal').length >= runs,
  )
  return { entries, results: toolResults(entries) }
}

type Block = Readonly<{ kind: string; ref?: { key: string; mediaType: string }; text?: string }>
function blocksOf(value: unknown): Block[] {
  if (Array.isArray(value)) return value.flatMap(blocksOf)
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  const own = typeof record['kind'] === 'string' && 'id' in record ? [record as Block] : []
  return [...own, ...Object.values(record).flatMap(blocksOf)]
}
const picturesOf = (entries: Awaited<ReturnType<typeof called>>['entries']) =>
  entries
    .filter(entry => entry.kind === 'message.tool')
    .flatMap(entry => blocksOf(entry.payload))
    .filter(block => block.kind === 'image')

const bypass = { permission: 'bypass-permissions' }

describe('the row media-tool-store', () => {
  it('declares the manifest of the stub table', () => {
    const declared = rowDeclarationOf(mediaToolStoreRow)
    expect(declared).toMatchObject({
      row: 'media-tool-store',
      implementation: 'real',
      lifecycle: { kind: 'none' },
      manifest: { provides: ['toolMediaStore'], injects: ['media'] },
    })
    const stub = rowManifests.get(declared!.row)
    expect(stub?.provides).toEqual(['s0.toolMediaStore'])
    expect(stub?.injects).toEqual(['s0.media'])
  })
})

describe('Files open on the release tree (C19)', () => {
  it(
    'a static PNG, JPEG and WebP each reach the model as their own bytes in its next request; the result holds a reference, the storage no bytes',
    { tags: ['slow'], timeout: 480_000 },
    async () => {
      const { received, script } = calling()
      const pictures = [
        ['shot.png', 'image/png', PNG],
        ['shot.jpg', 'image/jpeg', await reencoded('image/jpeg')],
        ['shot.webp', 'image/webp', await reencoded('image/webp')],
      ] as const
      const exitCode = await onReleaseTree({ script, ...bypass }, async tree => {
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        for (const [name, mediaType, bytes] of pictures) {
          const session = await emptySession(tree)
          const before = received.length
          const { entries, results } = await called(
            tree,
            session,
            `open ${placed(tree, name, bytes)}`,
          )
          expect(results).toHaveLength(1)
          expect(results[0]).toMatch(
            new RegExp(
              `^done Files open path="${name}" resolved_path=".*" media_type=${mediaType} width=64 height=48 bytes=${String(bytes.byteLength)}$`,
              'u',
            ),
          )
          const [stored, ...others] = picturesOf(entries)
          expect(others).toEqual([])
          expect(stored?.ref).toMatchObject({ mediaType, bytes: String(bytes.byteLength) })
          expect(
            await client['describe-media']({ tenant, ref: stored!.ref as never }),
          ).toMatchObject({
            body: { state: 'held', facts: { kind: 'image', widthPixels: 64, heightPixels: 48 } },
          })
          const sent = base64Of(bytes)
          const after = received.slice(before)
          expect(after.map(request => request.rawBody.includes(sent))).toEqual([false, true])
          expect(JSON.stringify(entries)).not.toContain(sent.slice(40, 120))
        }
        const inside = base64Of(PNG).slice(40, 120)
        const raw = Buffer.from(PNG.subarray(64, 128)).toString('latin1')
        const texts = storedTexts(tree.storageRoot)
        expect(texts.filter(text => text.includes(inside) || text.includes(raw))).toEqual([])
        expect(executionFailures(tree.storageRoot)).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'what is no picture, an animated picture and a picture over the budget are each refused with one line; nothing is stored and no picture is sent',
    { tags: ['slow'], timeout: 480_000 },
    async () => {
      const { received, script } = calling()
      const refused = [
        ['words.png', 'just words, not a picture', 'not-image'],
        ['moving.png', animated(PNG), 'animated'],
        ['wide.png', noisePng(16385, 2), 'over-budget'],
      ] as const
      const exitCode = await onReleaseTree({ script, ...bypass }, async tree => {
        for (const [name, bytes, reason] of refused) {
          const session = await emptySession(tree)
          const { entries, results } = await called(
            tree,
            session,
            `open ${placed(tree, name, bytes)}`,
          )
          expect(results).toHaveLength(1)
          expect(results[0]).toMatch(
            new RegExp(`^rejected reason=${reason} path="${name}" resolved_path=".*"$`, 'u'),
          )
          expect(picturesOf(entries)).toEqual([])
        }
        expect(received.filter(request => request.rawBody.includes('image_url'))).toEqual([])
        expect(executionFailures(tree.storageRoot)).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )
})

describe('when the picture cannot be taken, open is unavailable in its place and other commands go on (C19, C22)', () => {
  it(
    'a session whose model takes words only: open answers why and does not run; read runs',
    { tags: ['slow'], timeout: 480_000 },
    async () => {
      const { received, script } = calling()
      const options = { script, ...bypass, ...WITH_PROFILES_THAT_TAKE_WORDS_ONLY }
      const exitCode = await onReleaseTree(options, async tree => {
        const session = await emptySession(tree)
        placed(tree, 'shot.png', PNG)
        placed(tree, 'note.txt', 'a note in words')
        const opened = await called(tree, session, 'open shot.png')
        expect(opened.results).toEqual([
          'Files: the command "open" is not available now (output-incompatible). The model of this session does not take what the command returns. Continue without it.',
        ])
        expect(picturesOf(opened.entries)).toEqual([])
        const read = await called(tree, session, 'read note.txt', 2)
        expect(read.results.at(-1)).toContain('a note in words')
        expect(received.filter(request => request.rawBody.includes(base64Of(PNG)))).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'the release tree without the row media-tool-store: open answers that nothing can store its product; read runs',
    { tags: ['slow'], timeout: 480_000 },
    async () => {
      const { received, script } = calling()
      const options = { script, ...bypass, withoutRows: ['media-tool-store'] }
      const exitCode = await onReleaseTree(options, async tree => {
        expect(tree.scope.get('toolMediaStore')).toBeUndefined()
        const session = await emptySession(tree)
        placed(tree, 'shot.png', PNG)
        placed(tree, 'note.txt', 'a note in words')
        const opened = await called(tree, session, 'open shot.png')
        expect(opened.results).toEqual([
          'Files: the command "open" is not available now (products-unstorable). This deployment has nowhere to store what the command produces. Continue without it.',
        ])
        const read = await called(tree, session, 'read note.txt', 2)
        expect(read.results.at(-1)).toContain('a note in words')
        expect(received.filter(request => request.rawBody.includes(base64Of(PNG)))).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )
})
