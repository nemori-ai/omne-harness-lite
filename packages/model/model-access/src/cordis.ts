import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { modelProtocol } from '@omne-harness/model-protocol'
import { createModelAccessContribution } from './contribution.ts'
import type {
  ModelAccessPrincipals,
  ModelAccessSettings,
  ModelChoiceReader,
  ModelSessionRequirements,
} from './ports.ts'

export type ModelAccessPluginInput = Readonly<{
  principals: (ctx: Context) => ModelAccessPrincipals
  profiles: (ctx: Context) => ModelChoiceReader | undefined
  sessions?: (ctx: Context) => ModelSessionRequirements | undefined
}>

const MODEL_ACCESS_PLUGIN = 'model-access'

export function createModelAccessPlugin<S extends ModelAccessSettings = ModelAccessSettings>(
  input: ModelAccessPluginInput,
): Plugin.Object {
  return {
    name: MODEL_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    apply(ctx: Context, settings: S) {
      ctx.plugin(
        defineAccessPlugin({
          name: `${MODEL_ACCESS_PLUGIN}.contribution`,
          protocol: modelProtocol,
          handlers: () =>
            createModelAccessContribution({
              profiles: () => input.profiles(ctx),
              principals: input.principals(ctx),
              settings,
              sessions: () => input.sessions?.(ctx),
            }),
        }),
      )
    },
  }
}
