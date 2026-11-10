import type { Context, Plugin } from '@deepseek-ai/cordis'
import {
  modelCommandsKey,
  modelCredentialKey,
  modelRequestPreparationKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { createModelRequestPreparationPlugin } from '@omne-harness/model-host-local/cordis'
import { createOpenAiFamily, openAiTokenizerResources } from '@omne-harness/pi-ai-openai'
import { composeFamilies } from '@omne-harness/pi-ai-transport'
import { modelTokenizersKey } from '@omne-harness/tokenizer-tiktoken/cordis'
import { defineRow } from '../../row.ts'
import { modelRequestPreparationConfig, type ModelRequestPreparationConfig } from './config.ts'
import { credentialLayerSupplier } from '../../model/credential-layer.ts'

const plugin: Plugin.Object = {
  name: 'model-request-preparation',
  inject: [modelCommandsKey, modelTokenizersKey],
  Config: modelRequestPreparationConfig,
  async apply(ctx: Context, config: ModelRequestPreparationConfig) {
    const executor = ctx.get(modelTokenizersKey)
    if (executor === undefined) throw new Error('modelTokenizers was not injected')
    const bindings = composeFamilies([
      createOpenAiFamily({
        tokenizer: openAiTokenizerResources(),
        executor,
        maxSerializedBytes: config.openai.maxSerializedBytes,
        limits: config.openai.limits,
        margin: config.openai.margin,
      }),
    ])
    const preparation = createModelRequestPreparationPlugin({
      bindings,
      // `modelCredential` is read per call: a missing custody stops a preparation, it does not hold
      // the row PENDING, and it never falls back to the factory reference.
      supplierOf: credentialLayerSupplier(() => ctx.get(modelCredentialKey)),
    })
    await ctx.plugin(preparation.plugin, { maxCitedCalls: config.maxCitedCalls })
  },
}

export const modelRequestPreparationRow = defineRow({
  row: 'model-request-preparation',
  implementation: 'real',
  manifest: {
    provides: [modelRequestPreparationKey],
    injects: [modelCommandsKey, modelTokenizersKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
