import type { Context, Plugin } from '@deepseek-ai/cordis'
import {
  modelCommandsKey,
  modelCredentialKey,
  modelDecisionPreparationKey,
  modelRequestPreparationKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { createDecisionPreparation } from '@omne-harness/model-host-local'
import {
  createModelRequestPreparationPlugin,
  serveModelDecisionPreparation,
} from '@omne-harness/model-host-local/cordis'
import { modelTokenizersKey } from '@omne-harness/tokenizer-tiktoken/cordis'
import { defineRow } from '../../row.ts'
import { modelRequestPreparationConfig, type ModelRequestPreparationConfig } from './config.ts'
import { credentialLayerSupplier } from '../../model/credential-layer.ts'
import { releaseFamilies } from '../../model/families.ts'
import { qualifyingReads } from '../../model/commands-qualifying.ts'
import { modelReadersPortOf } from '../../model/ports.ts'

const plugin: Plugin.Object = {
  name: 'model-request-preparation',
  inject: [modelCommandsKey, modelTokenizersKey],
  Config: modelRequestPreparationConfig,
  async apply(ctx: Context, config: ModelRequestPreparationConfig) {
    const executor = ctx.get(modelTokenizersKey)
    if (executor === undefined) throw new Error('modelTokenizers was not injected')
    const bindings = releaseFamilies(config, executor)
    const readers = modelReadersPortOf(ctx)
    if (readers === undefined)
      throw new Error(
        'model-request-preparation: the modelHostAuthority entry object of this release is not installed',
      )
    const reader = readers.bindReader(ctx)
    const supplierOf = credentialLayerSupplier(() => ctx.get(modelCredentialKey))
    // A decision request stands on no profile of the chat selection: only the credential layer is shared.
    serveModelDecisionPreparation(ctx, createDecisionPreparation({ supplierOf }))
    const preparation = createModelRequestPreparationPlugin({
      bindings,
      supplierOf,
      readFacts: commands => qualifyingReads(commands, access => reader.qualifyRead(access)),
    })
    await ctx.plugin(preparation.plugin, { maxCitedCalls: config.maxCitedCalls })
  },
}

export const modelRequestPreparationRow = defineRow({
  row: 'model-request-preparation',
  implementation: 'real',
  manifest: {
    provides: [modelRequestPreparationKey, modelDecisionPreparationKey],
    injects: [modelCommandsKey, modelTokenizersKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
