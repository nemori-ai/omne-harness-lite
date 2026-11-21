import type { Context } from '@deepseek-ai/cordis'
import { profileCovers } from '@omne-harness/model-contract'
import type { ModelProfiles } from '@omne-harness/model-contract/provider'
import { modelProfilesKey } from '@omne-harness/model-cordis-contract/cordis'
import { ModelProfilesLocalPlugin } from '@omne-harness/model-host-local/cordis'
import { defineRow } from '../../../src/row.ts'
import { modelRowsOperatorConfig, savedTenant } from '../../r9/support.ts'
import { sessionRef, tenantOf } from '../../support/protocol-clients.ts'
import type { ReleaseTree } from '../../support/release-tree.ts'

export const SEES = 'openai/gpt-6.1-sol'
export const READS_WORDS_ONLY = 'test/words-only'
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

/** Options of a release tree whose profiles are the official ones and the words-only route. */
export const WITH_WORDS_ONLY_ROUTE = {
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

export function selectModel(tree: ReleaseTree, session: string, model: string, controlId: string) {
  const select = tree.clients.session['select-model']
  return select({
    tenant: tenantOf(savedTenant(tree.home)),
    session: sessionRef(session),
    controlId,
    model,
  } as Parameters<typeof select>[0])
}

/**
 * The official profiles, each judged as if its model took words only: a requirement of anything
 * more is refused for modality. Sending goes on as before, since the routes are the official ones.
 */
class TakingWordsOnly extends ModelProfilesLocalPlugin {
  constructor(ctx: Context, config: ConstructorParameters<typeof ModelProfilesLocalPlugin>[1]) {
    super(ctx, config)
    const official = this.resolve
    const resolve: Resolve = async input => {
      const resolved = await official(input)
      const more = input.required.modalities.some(modality => modality !== 'text')
      if (!more || !('ok' in resolved) || resolved.ok.kind !== 'resolved') return resolved
      return { ok: { ...resolved.ok, selectable: false, reasons: ['modality'] } }
    }
    Object.assign(this, { resolve })
  }
}

export const WITH_PROFILES_THAT_TAKE_WORDS_ONLY = {
  withoutRows: ['model-profiles'],
  addedRows: [
    {
      id: 'model-profiles',
      plugin: 'takingWordsOnly',
      config: PROFILES_CONFIG,
      definition: defineRow({
        row: 'model-profiles',
        implementation: 'real',
        manifest: { provides: [modelProfilesKey], injects: [], sameProviderGroup: null },
        lifecycle: { kind: 'none' },
        plugin: TakingWordsOnly,
      }),
    },
  ],
}
