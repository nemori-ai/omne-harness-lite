// @module-tag slow
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import { mediaIntakeRow } from '../../../src/rows/media-intake/index.ts'
import { sessionBeforeIntakeRow } from '../../../src/rows/session-before-intake/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { bodyOf, runOmne } from '../../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { mediaClientOf, noisePng } from '../media-access/support.ts'
import { picture, processors, send, uploaded, words } from './support.ts'

const PICTURE = noisePng(64, 48)
const FACTS = { kind: 'image', widthPixels: 64, heightPixels: 48 }
const script = toolCallsThenText(() => [])

async function emptySession(tree: ReleaseTree): Promise<string> {
  const created = await tree.cli(['create-session', '--definition', 'coding'])
  expect(created.status, created.stderr).toBe(0)
  return String(bodyOf(created)['session'])
}
const userMessages = async (tree: ReleaseTree, session: string) =>
  (await historyOf(tree, session)).filter(entry => entry.kind === 'message.user')

async function stranger(tree: ReleaseTree) {
  const base = dirname(tree.home)
  const home = join(base, 'frank')
  for (const command of ['register', 'login'])
    expect(
      (
        await runOmne({
          args: [command, '--login-identifier', 'frank'],
          home,
          server: `http://127.0.0.1:${String(tree.port)}`,
          cwd: base,
          credential: 'frank-pw-media-intake-7d1a',
        })
      ).status,
    ).toBe(0)
  return mediaClientOf(tree.port, home)
}

describe('the two rows of the processing before intake', () => {
  it.each([
    [
      sessionBeforeIntakeRow,
      'session-before-intake',
      ['sessionBeforeIntake', 'sessionUtteranceResolver'],
      [],
    ],
    [mediaIntakeRow, 'media-intake', [], ['media', 'sessionBeforeIntake']],
  ] as const)(
    'the row %s declares the manifest of the stub table',
    (row, id, provides, injects) => {
      const declared = rowDeclarationOf(row)
      expect(declared).toMatchObject({
        row: id,
        implementation: 'real',
        lifecycle: { kind: 'none' },
        manifest: { provides, injects },
      })
      const stub = rowManifests.get(declared!.row)
      expect(stub?.provides ?? []).toEqual(provides.map(name => `s0.${name}`))
      expect(stub?.injects ?? []).toEqual(injects.map(name => `s0.${name}`))
    },
  )

  it(
    'an input that refers to an uploaded picture is accepted held and measured, and the log has no bytes (C12)',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const exitCode = await onReleaseTree({ script }, async tree => {
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        const ref = await uploaded(client, tenant, 'intake-upload-1', PICTURE)
        expect(processors(tree)).toEqual(['media.references'])
        const session = await emptySession(tree)
        const brought = { kind: 'image', widthPixels: 9000, heightPixels: 9000 }
        const blocks = [words('blk_words', 'look at this'), picture('blk_picture', ref)]
        expect(
          await send(tree, session, 'pictured', [
            blocks[0],
            picture('blk_picture', ref, { facts: brought }),
          ]),
        ).toEqual({ outcome: 'succeeded', body: { recovered: false } })
        const [entry] = await pollUntil(
          'the input in the history',
          () => userMessages(tree, session),
          found => found.length > 0,
        )
        expect(entry?.payload['message']).toMatchObject({
          blocks: [blocks[0], { ...picture('blk_picture', ref), facts: FACTS }],
        })
        expect(JSON.stringify(await historyOf(tree, session))).not.toContain('"inline"')
        expect(await client['describe-media']({ tenant, ref })).toEqual({
          outcome: 'succeeded',
          body: { state: 'held', facts: FACTS, preprocess: { kind: 'not-needed' } },
        })
        expect(await send(tree, session, 'pictured', blocks)).toEqual({
          outcome: 'succeeded',
          body: { recovered: true },
        })
        expect(await userMessages(tree, session)).toHaveLength(1)
        await pollUntil(
          'the Run of the pictured input to end',
          () => historyOf(tree, session),
          found => found.some(each => each.kind === 'run.terminal'),
        )
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'a reference to no medium or to a medium of another tenant, and a block of inline bytes, are refused (C12)',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const exitCode = await onReleaseTree({ script }, async tree => {
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        const own = await uploaded(client, tenant, 'intake-upload-own', PICTURE)
        const other = await stranger(tree)
        const foreign = await uploaded(other.client, other.tenant, 'intake-upload-foreign', PICTURE)
        expect(foreign.key).not.toBe(own.key)
        const session = await emptySession(tree)
        const refused = {
          outcome: 'invalid',
          body: { field: 'value.message.blocks[1]', reason: expect.any(String) },
        }
        const unknown = { ...own, key: 'f'.repeat(32) }
        for (const [input, bad] of [
          ['unknown', picture('blk_bad', unknown)],
          ['foreign', picture('blk_bad', foreign)],
          [
            'inline',
            {
              kind: 'image',
              id: 'blk_bad',
              visibility: words('x', '').visibility,
              mediaType: 'image/png',
              inline: 'AAAA',
            },
          ],
        ] as const)
          expect(await send(tree, session, input, [words('blk_words', 'see'), bad]), input).toEqual(
            refused,
          )
        expect(await userMessages(tree, session)).toEqual([])
        expect(await send(tree, session, 'words', [words('blk_words', 'only words')])).toEqual({
          outcome: 'succeeded',
          body: { recovered: false },
        })
        expect(
          await other.client['describe-media']({ tenant: other.tenant, ref: foreign }),
        ).toEqual({
          outcome: 'succeeded',
          body: { state: 'staged', facts: FACTS, preprocess: { kind: 'not-needed' } },
        })
      })
      expect(exitCode).toBe(0)
    },
  )
})

describe('the release tree without the intake row of media (C22)', () => {
  it(
    'no processor measures a reference while the row is out; uploads and sessions of words go on as before',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const options = { script, withoutRows: ['media-intake'] }
      const exitCode = await onReleaseTree(options, async tree => {
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        const ref = await uploaded(client, tenant, 'intake-upload-2', PICTURE)
        const quiet = await tree.startSession('hello')
        await pollUntil(
          'the Run of words to end',
          () => historyOf(tree, quiet),
          found => found.some(entry => entry.kind === 'run.terminal'),
        )
        expect(processors(tree)).toEqual([])
        expect(await client['describe-media']({ tenant, ref })).toMatchObject({
          body: { state: 'staged' },
        })
      })
      expect(exitCode).toBe(0)
    },
  )
})
