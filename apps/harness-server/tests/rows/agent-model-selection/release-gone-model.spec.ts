// @module-tag slow
import type { Context } from '@deepseek-ai/cordis'
import type { ModelProfiles } from '@omne-harness/model-contract/provider'
import { modelProfilesKey } from '@omne-harness/model-cordis-contract/cordis'
import { ModelProfilesLocalPlugin } from '@omne-harness/model-host-local/cordis'
import { describe, expect, it } from 'vitest'
import { defineRow } from '../../../src/row.ts'
import { modelRowsOperatorConfig } from '../../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { send, words } from '../media-intake/support.ts'
import { SEES, selectModel } from '../session-access/words-only-route.ts'

type Resolve = ModelProfiles<unknown>['resolve']
type Gone = 'withdrawn' | 'unknown-name'
const now: { gone: Gone | null } = { gone: null }

/** The official profiles, with `SEES` taken away while the test says so: withdrawn, or no such model. */
class TakingAway extends ModelProfilesLocalPlugin {
  constructor(ctx: Context, config: ConstructorParameters<typeof ModelProfilesLocalPlugin>[1]) {
    super(ctx, config)
    const official = this.resolve
    const resolve: Resolve = async input =>
      input.route === SEES && now.gone !== null
        ? { ok: { kind: 'absent', reason: now.gone } }
        : official(input)
    Object.assign(this, { resolve })
  }
}
const TAKING_AWAY = {
  withoutRows: ['model-profiles'],
  addedRows: [
    {
      id: 'model-profiles',
      plugin: 'takingAway',
      config: modelRowsOperatorConfig({ storageRoot: '/unused' }).profiles,
      definition: defineRow({
        row: 'model-profiles',
        implementation: 'real',
        manifest: { provides: [modelProfilesKey], injects: [], sameProviderGroup: null },
        lifecycle: { kind: 'none' },
        plugin: TakingAway,
      }),
    },
  ],
}

const ends = (tree: ReleaseTree, session: string, count: number) =>
  pollUntil(
    `run ${String(count)} to end`,
    () => historyOf(tree, session),
    found => found.filter(entry => entry.kind === 'run.terminal').length >= count,
  )

describe('a session whose selected model goes away (C5)', () => {
  it.each(['withdrawn', 'unknown-name'] as const)(
    'ends its next Run as failed, without a model request, once the model is %s',
    { tags: ['slow'], timeout: 240_000 },
    async gone => {
      now.gone = null
      let requests = 0
      const answer = toolCallsThenText(() => [])
      const script: typeof answer = request => {
        requests += 1
        return answer(request)
      }
      const exitCode = await onReleaseTree({ script, ...TAKING_AWAY }, async tree => {
        const session = await tree.startSession('hello')
        await ends(tree, session, 1)
        expect(await selectModel(tree, session, SEES, 'control-1')).toMatchObject({
          outcome: 'succeeded',
        })
        const before = requests
        now.gone = gone
        expect(await send(tree, session, 'gone', [words('blk_gone', 'again')])).toMatchObject({
          outcome: 'succeeded',
        })
        const history = await ends(tree, session, 2)
        const terminal = history.filter(entry => entry.kind === 'run.terminal').at(-1)
        expect(terminal?.payload).toMatchObject({
          terminal: { outcome: 'failed' },
          end: { conclusion: 'fail', failure: { kind: 'node-failed', failureKind: 'invalid' } },
        })
        expect(requests).toBe(before)
      })
      now.gone = null
      expect(exitCode).toBe(0)
    },
  )
})
