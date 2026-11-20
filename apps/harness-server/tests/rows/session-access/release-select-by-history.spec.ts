// @module-tag slow
import type { Context } from '@deepseek-ai/cordis'
import { profileCovers } from '@omne-harness/model-contract'
import type { ModelProfiles } from '@omne-harness/model-contract/provider'
import { modelProfilesKey } from '@omne-harness/model-cordis-contract/cordis'
import { ModelProfilesLocalPlugin } from '@omne-harness/model-host-local/cordis'
import { userMessageId } from '@omne-harness/session-protocol'
import { describe, expect, it } from 'vitest'
import { defineRow } from '../../../src/row.ts'
import { bodyOf, modelRowsOperatorConfig, savedTenant } from '../../r9/support.ts'
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

const SEES = 'openai/gpt-6.1-sol'
const READS_WORDS_ONLY = 'test/words-only'
type Resolve = ModelProfiles<unknown>['resolve']

/**
 * The official profiles, and one route more that takes words only. Every official profile takes
 * pictures, so the release has no such route of its own; this one is the profile of `SEES` with
 * its input cut to text, judged against the requirement with Model's own `profileCovers`.
 */
class WithWordsOnlyRoute extends ModelProfilesLocalPlugin {
  constructor(ctx: Context, config: ConstructorParameters<typeof ModelProfilesLocalPlugin>[1]) {
    super(ctx, config)
    const official = this.resolve
    const resolve: Resolve = async input => {
      if (input.route !== READS_WORDS_ONLY) return official(input)
      const seeing = await official({
        ...input,
        route: SEES,
        required: { ...input.required, modalities: ['text'], fileTypes: [] },
      })
      if (!('ok' in seeing) || seeing.ok.kind !== 'resolved') return seeing
      const { profile } = seeing.ok
      const definition = { ...profile.definition, input: ['text'] as const }
      const covered = profileCovers(definition, input.required)
      return {
        ok: {
          ...seeing.ok,
          profile: {
            ...profile,
            identity: { ...profile.identity, route: READS_WORDS_ONLY },
            adoption: { ...profile.adoption, name: READS_WORDS_ONLY },
            definition,
          },
          selectable: covered,
          reasons: covered ? [] : ['modality'],
        },
      }
    }
    Object.assign(this, { resolve })
  }
}
const profilesRow = defineRow({
  row: 'model-profiles',
  implementation: 'real',
  manifest: { provides: [modelProfilesKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: WithWordsOnlyRoute,
})

/** What the operator layer of the tests gives the row this one stands in for. */
const PROFILES_CONFIG = modelRowsOperatorConfig({ storageRoot: '/unused' }).profiles

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
function select(tree: ReleaseTree, session: string, model: string, controlId: string) {
  const select = tree.clients.session['select-model']
  return select({
    tenant: tenantOf(savedTenant(tree.home)),
    session: sessionRef(session),
    controlId,
    model,
  } as Parameters<typeof select>[0])
}
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
      const options = {
        script,
        withoutRows: ['model-profiles'],
        addedRows: [
          {
            id: 'model-profiles',
            plugin: 'withWordsOnlyRoute',
            config: PROFILES_CONFIG,
            definition: profilesRow,
          },
        ],
      }
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
