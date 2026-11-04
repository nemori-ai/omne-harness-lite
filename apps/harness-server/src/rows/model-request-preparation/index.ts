// The `model-request-preparation` row (application assembly, MD-15): the model-host-local
// preparation plugin with the real OpenAI family. It injects `modelCommands` only, so `prepare` and
// the metering leases need neither `modelRuntime` nor a supplier network. The plugin also provides
// `modelPreparationResources` on its fiber; the row table lists the first key only. The supplier
// completion reads `modelCredential` per call to choose the tenant or the factory reference
// (`src/model/tenant-credential.ts`).
//
// The plugin class takes its family bindings and its supplier completion as objects, not as
// configuration. The row body builds them from the row configuration, then loads the plugin as a
// child of its own fiber, so a row unload ends the plugin and its leases with it.
import type { Context, Plugin } from '@deepseek-ai/cordis'
import {
  modelCommandsKey,
  modelCredentialKey,
  modelRequestPreparationKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { createModelRequestPreparationPlugin } from '@omne-harness/model-host-local/cordis'
import { createOpenAiFamily, openAiTokenizerResources } from '@omne-harness/pi-ai-openai'
import { composeFamilies } from '@omne-harness/pi-ai-transport'
import { defineRow } from '../../row.ts'
import { modelRequestPreparationConfig, type ModelRequestPreparationConfig } from './config.ts'
import { tenantCredentialSupplier } from '../../model/tenant-credential.ts'

const plugin: Plugin.Object = {
  name: 'model-request-preparation',
  inject: [modelCommandsKey],
  Config: modelRequestPreparationConfig,
  async apply(ctx: Context, config: ModelRequestPreparationConfig) {
    const bindings = composeFamilies([
      createOpenAiFamily({
        tokenizer: openAiTokenizerResources(),
        limits: config.openai.limits,
        margin: config.openai.margin,
      }),
    ])
    const preparation = createModelRequestPreparationPlugin({
      bindings,
      // `modelCredential` is read per call: a missing custody stops a preparation, it does not hold
      // the row PENDING, and it never falls back to the factory reference.
      supplierOf: tenantCredentialSupplier(() => ctx.get(modelCredentialKey)),
    })
    await ctx.plugin(preparation.plugin, { maxCitedCalls: config.maxCitedCalls })
  },
}

export const modelRequestPreparationRow = defineRow({
  row: 'model-request-preparation',
  implementation: 'real',
  manifest: {
    provides: [modelRequestPreparationKey],
    injects: [modelCommandsKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
