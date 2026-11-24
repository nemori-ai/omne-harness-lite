import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { canvasProtocol } from '@omne-harness/canvas-protocol'
import { createCanvasContribution } from './contribution.ts'
import type { CanvasFace, CanvasPrincipals } from './ports.ts'

export type CanvasAccessPluginInput = Readonly<{
  principals: (ctx: Context) => CanvasPrincipals
  face: (ctx: Context) => CanvasFace | undefined
}>

const CANVAS_ACCESS_PLUGIN = 'canvas-access'

/** Mounts canvas/v1 on the access registry. The canvas is taken at each call, so the protocol stays while it is away. */
export function createCanvasAccessPlugin(input: CanvasAccessPluginInput): Plugin.Object {
  return {
    name: CANVAS_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    apply(ctx: Context) {
      ctx.plugin(
        defineAccessPlugin({
          name: `${CANVAS_ACCESS_PLUGIN}.contribution`,
          protocol: canvasProtocol,
          handlers: () =>
            createCanvasContribution({
              principals: input.principals(ctx),
              face: () => input.face(ctx),
            }),
        }),
      )
    },
  }
}
