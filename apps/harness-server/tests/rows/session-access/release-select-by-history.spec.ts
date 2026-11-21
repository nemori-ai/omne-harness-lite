// @module-tag slow
import { userMessageId } from '@omne-harness/session-protocol'
import { describe, expect, it } from 'vitest'
import { bodyOf, savedTenant } from '../../r9/support.ts'
import { sessionRef, tenantOf } from '../../support/protocol-clients.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { mediaClientOf, noisePng } from '../media-access/support.ts'
import { picture, send, uploaded, words } from '../media-intake/support.ts'
import { READS_WORDS_ONLY, SEES, WITH_WORDS_ONLY_ROUTE, selectModel } from './words-only-route.ts'

const PICTURE = noisePng(64, 48)
const script = toolCallsThenText(() => [])

async function emptySession(tree: ReleaseTree): Promise<string> {
  const created = await tree.cli(['create-session', '--definition', 'coding'])
  expect(created.status, created.stderr).toBe(0)
  return String(bodyOf(created)['session'])
}
const ended = (tree: ReleaseTree, session: string) =>
  pollUntil(
    'the Run to end',
    () => historyOf(tree, session),
    found => found.some(entry => entry.kind === 'run.terminal'),
  )
const select = selectModel
async function standsAt(tree: ReleaseTree, session: string): Promise<unknown> {
  const read = tree.clients.session['read-model-selection']
  const answer = await read({
    tenant: tenantOf(savedTenant(tree.home)),
    session: sessionRef(session),
  } as Parameters<typeof read>[0])
  return answer.outcome === 'succeeded' ? answer.body.model : answer
}

describe('selecting a model for a session whose history holds a picture (C14)', () => {
  it(
    'a model that reads words only is refused and the picture is named; a model that sees is selected; a history of words takes either',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const options = { script, ...WITH_WORDS_ONLY_ROUTE }
      const exitCode = await onReleaseTree(options, async tree => {
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        const ref = await uploaded(client, tenant, 'select-upload-1', PICTURE)
        const pictured = await emptySession(tree)
        const before = await standsAt(tree, pictured)
        expect(
          await send(tree, pictured, 'pictured', [
            words('blk_words', 'look at this'),
            picture('blk_picture', ref),
          ]),
        ).toMatchObject({ outcome: 'succeeded' })
        await ended(tree, pictured)

        expect(await select(tree, pictured, READS_WORDS_ONLY, 'control-1')).toEqual({
          outcome: 'invalid',
          body: {
            reason: 'modality',
            blocks: [{ message: await userMessageId('pictured'), block: 'blk_picture' }],
          },
        })
        expect(await standsAt(tree, pictured)).toEqual(before)
        expect(await select(tree, pictured, SEES, 'control-2')).toMatchObject({
          outcome: 'succeeded',
          body: { model: SEES },
        })
        expect(await standsAt(tree, pictured)).toBe(SEES)

        const worded = await tree.startSession('hello')
        await ended(tree, worded)
        expect(await select(tree, worded, READS_WORDS_ONLY, 'control-3')).toMatchObject({
          outcome: 'succeeded',
          body: { model: READS_WORDS_ONLY },
        })
      })
      expect(exitCode).toBe(0)
    },
  )
})
