// @module-tag slow
import { describe, expect, it } from 'vitest'
import { createScriptedEngine } from '@omne-harness/media-contract/testing'
import { mediaEnginesKey } from '@omne-harness/media-cordis-contract/cordis'
import { bodyOf, savedTenant } from '../../r9/support.ts'
import { tenantOf } from '../../support/protocol-clients.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { mediaClientOf } from '../media-access/support.ts'
import { send, treeOf, uploaded, words, type Reference } from './support.ts'

const visibility = { toHuman: true, toModel: true }
const block = (kind: 'voice' | 'file', id: string, ref: Reference) => ({
  kind,
  id,
  visibility,
  ref,
  transcript: null,
})
/** A WAV of a few samples; `seed` makes each one another medium. */
function wav(seed: number): Uint8Array {
  const bytes = new Uint8Array(44 + 8)
  const view = new DataView(bytes.buffer)
  const tag = (at: number, text: string) => bytes.set(new TextEncoder().encode(text), at)
  tag(0, 'RIFF')
  view.setUint32(4, 36 + 8, true)
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
  view.setUint32(40, 8, true)
  view.setUint16(44, seed)
  return bytes
}
const PDF = new TextEncoder().encode('%PDF-1.4\nfixture body\n')
const LONG = 'a long report. '.repeat(1200)

/** Two fixture engines and the tenant's own definitions that name them. */
async function fixtures(tree: ReleaseTree) {
  const engines = tree.scope.get(mediaEnginesKey)
  if (engines === undefined) throw new Error('no engines in the tree')
  const answer = (text: string) => async () => ({
    kind: 'converted' as const,
    text,
    derived: [],
  })
  engines.register(
    createScriptedEngine(answer('今天下午三点开会'), {
      name: 'voice.fixture',
      accepts: ['audio/*'],
    }).engine,
  )
  engines.register(
    createScriptedEngine(answer(LONG), { name: 'doc.fixture', accepts: ['application/pdf'] })
      .engine,
  )
  const tenant = tenantOf(savedTenant(tree.home))
  const versions: Record<string, string> = {}
  for (const [name, engine] of [
    ['voice', 'voice.fixture'],
    ['application-pdf', 'doc.fixture'],
  ] as const) {
    const made = await tree.clients.assets['create-asset']({
      tenant,
      operation: `define-${name}`,
      category: 'converter',
      name,
      body: treeOf({ kind: name, engine, parameters: {}, egress: { kind: 'in-process' } }),
    })
    if (made.outcome !== 'succeeded') throw new Error(JSON.stringify(made))
    versions[name] = made.body.version
  }
  return versions
}

async function emptySession(tree: ReleaseTree): Promise<string> {
  const created = await tree.cli(['create-session', '--definition', 'coding'])
  expect(created.status, created.stderr).toBe(0)
  return String(bodyOf(created)['session'])
}
const userMessages = async (tree: ReleaseTree, session: string) =>
  (await historyOf(tree, session)).filter(entry => entry.kind === 'message.user')

describe('the representation snapshot at intake (C30)', () => {
  it(
    'a voice block in the log has its words and where they came from; a long document has a reference for its words; a medium not prepared is refused',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        const session = await emptySession(tree)
        const versions = await fixtures(tree)
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        const speech = await uploaded(client, tenant, 'snap-voice', wav(1), 'audio/wav')
        const report = await uploaded(client, tenant, 'snap-pdf', PDF, 'application/pdf')
        const unready = await uploaded(client, tenant, 'snap-later', wav(2), 'audio/wav')

        expect(await client['describe-media']({ tenant, ref: unready })).toMatchObject({
          outcome: 'succeeded',
          body: { preprocess: { kind: 'not-started' } },
        })
        expect(await client['prepare-media']({ tenant, ref: speech })).toMatchObject({
          outcome: 'succeeded',
          body: {
            preprocess: {
              kind: 'done',
              representation: { outcome: 'converted', text: '今天下午三点开会' },
            },
          },
        })
        const prepared = await client['prepare-media']({ tenant, ref: report })
        if (prepared.outcome !== 'succeeded') throw new Error(prepared.outcome)

        expect(
          await send(tree, session, 'not-yet', [
            words('w0', 'hear this'),
            block('voice', 'v0', unready),
          ]),
        ).toEqual({
          outcome: 'invalid',
          body: {},
        })
        expect(
          await send(tree, session, 'heard', [
            words('w1', 'hear and read these'),
            block('voice', 'v1', speech),
            block('file', 'f1', report),
          ]),
        ).toEqual({ outcome: 'succeeded', body: { recovered: false } })
        const [entry] = await pollUntil(
          'the input in the history',
          () => userMessages(tree, session),
          found => found.length > 0,
        )
        const message = entry?.payload['message'] as
          | { blocks: Record<string, unknown>[] }
          | undefined
        const blocks = message?.blocks ?? []
        expect(blocks[1]).toMatchObject({
          kind: 'voice',
          transcript: '今天下午三点开会',
          snapshot: {
            outcome: 'converted',
            definition: { name: 'voice', revision: versions['voice'] },
            engine: { name: 'voice.fixture', revision: '1' },
            text: null,
            others: [],
          },
        })
        expect(blocks[2]).toMatchObject({
          kind: 'file',
          transcript: null,
          snapshot: {
            outcome: 'converted',
            definition: { name: 'application-pdf', revision: versions['application-pdf'] },
            text: { mediaType: 'text/plain' },
          },
        })
        expect(JSON.stringify(entry)).not.toContain('a long report.')
        expect(await userMessages(tree, session)).toHaveLength(1)
        await pollUntil(
          'the Run of the input to end',
          () => historyOf(tree, session),
          found => found.some(each => each.kind === 'run.terminal'),
        )
      })
      expect(exitCode).toBe(0)
    },
  )
})
