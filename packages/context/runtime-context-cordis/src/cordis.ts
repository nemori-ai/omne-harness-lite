import type { Context, Plugin } from '@deepseek-ai/cordis'
import {
  runtimeContextTrustKey,
  type RuntimeContextTrustService,
} from '@omne-harness/runtime-context-cordis-contract/cordis'

type Trust<P> = Pick<RuntimeContextTrustService<P>, 'authority' | 'bindings'>

/**
 * The plugin takes the two original ports from the construction input key and hands them to the
 * factory. While the key is absent the plugin stays pending. The trust object is never read from
 * plugin configuration. The production factory is not in this member yet.
 */
export function createRuntimeContextPlugin<P>(construct: (trust: Trust<P>) => void): Plugin.Object {
  return {
    name: 'runtime-context-cordis',
    inject: [runtimeContextTrustKey],
    apply(ctx: Context) {
      const { authority, bindings } = ctx.runtimeContextTrust
      // Pass exactly the two original ports, not the service object.
      construct({ authority, bindings } as Trust<P>)
    },
  }
}
