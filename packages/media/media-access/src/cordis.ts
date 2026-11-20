import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { mediaProtocol } from '@omne-harness/media-protocol'
import { createMediaContribution } from './contribution.ts'
import type { MediaFace, TargetTenantPrincipals } from './ports.ts'

export type MediaAccessPluginInput = Readonly<{
  principals: (ctx: Context) => TargetTenantPrincipals
  media: (ctx: Context) => MediaFace | undefined
}>

const MEDIA_ACCESS_PLUGIN = 'media-access'

/** Mounts media/v1 on the access registry of the tree; the media face is taken at each call. */
export function createMediaAccessPlugin(input: MediaAccessPluginInput): Plugin.Object {
  return {
    name: MEDIA_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    apply(ctx: Context) {
      ctx.plugin(
        defineAccessPlugin({
          name: `${MEDIA_ACCESS_PLUGIN}.contribution`,
          protocol: mediaProtocol,
          handlers: () =>
            createMediaContribution({
              principals: input.principals(ctx),
              media: () => input.media(ctx),
            }),
        }),
      )
    },
  }
}
