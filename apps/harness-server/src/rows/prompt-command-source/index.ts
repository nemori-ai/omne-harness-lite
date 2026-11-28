import type { Context, Plugin } from '@deepseek-ai/cordis'
import { assetChangesKey } from '@omne-harness/assets-cordis-contract'
import {
  type AssetChanges,
  categoryContributionPlugin,
} from '@omne-harness/assets-cordis-contract/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail } from '@omne-harness/operation-result'
import {
  createPromptEntrySource,
  heldPrompts,
  onePrompt,
  PROMPT_CATEGORY,
  promptBodyContract,
  promptCategoryDisplay,
  promptCommandsPoint,
  type PromptLayers,
} from '@omne-harness/prompt-command-source'
import type { SessionId } from '@omne-harness/session-contract'
import { sessionWorkPrincipalsKey } from '@omne-harness/session-cordis-contract/cordis'
import type { Asker } from '@omne-harness/slash-command-contract'
import {
  commandEntrySourcesKey,
  type CommandEntrySourcesService,
} from '@omne-harness/slash-command-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import { askerLayersOf } from '../tenant-assets/asker-layers.ts'
import { turnOfSession } from '../tenant-assets/turn.ts'

const UNAVAILABLE = fail('unavailable' as const)

/** The layers the session's own work reads prompt commands from: the tenant's, and in a turn the workspace's. */
function layersFor(ctx: Context) {
  const layersOf = askerLayersOf(ctx, PROMPT_CATEGORY)
  return async ({ tenant, session }: Asker<unknown>): Promise<PromptLayers | undefined> => {
    try {
      const work = await ctx
        .get(sessionWorkPrincipalsKey)
        ?.forSession({ actor: 'coordinator', tenant, session: session as SessionId })
      if (work === undefined || !('ok' in work)) return undefined
      const access = { principal: work.ok as unknown, tenant, session: session as SessionId }
      const turn = await turnOfSession(ctx, access)
      if (turn === undefined) return undefined
      return await layersOf({ tenant, ...(turn === null ? {} : { turn }) })
    } catch {
      return undefined
    }
  }
}

const promptCommandSourcePlugin: Plugin.Object = {
  name: 'prompt-command-source',
  inject: [commandEntrySourcesKey],
  apply(ctx: Context) {
    ctx.plugin(
      categoryContributionPlugin(
        'prompt-command-category',
        { contract: promptBodyContract(), display: promptCategoryDisplay },
        promptCommandsPoint,
      ),
    )
    const layersOf = layersFor(ctx)
    const source = createPromptEntrySource<unknown>({
      async held(asker) {
        const layers = await layersOf(asker)
        return layers === undefined ? UNAVAILABLE : heldPrompts(layers)
      },
      async one(asker, name) {
        const layers = await layersOf(asker)
        return layers === undefined ? UNAVAILABLE : onePrompt(layers, name)
      },
      changes(tenant, changed) {
        const changes = ctx.get(assetChangesKey, false) as AssetChanges | undefined
        const text = tenantCodec.encode(tenant)
        if (changes === undefined || !text.ok) return () => {}
        return changes.subscribe(text.value, { changed, closed: changed })
      },
    })
    ;(ctx.get(commandEntrySourcesKey) as CommandEntrySourcesService<unknown>).contribute(source)
  },
}

/** Prompt commands: the asset category, and the commands a session's work holds as one command entry source. */
export const promptCommandSourceRow = defineRow({
  row: 'prompt-command-source',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [commandEntrySourcesKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: promptCommandSourcePlugin,
})
