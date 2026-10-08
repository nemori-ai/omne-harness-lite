import type { Context } from '@deepseek-ai/cordis'
import { createAssemblyLifetime } from '@omne-harness-lite/assembly-lifecycle'
import { composePluginTree } from '@omne-harness-lite/cordis-plugin-tree'
import {
  preparePluginTree,
  loadPluginTree,
  inspectPluginTree,
} from '@omne-harness-lite/cordis-plugin-tree/cordis'
import { SESSION_LOG_BACKING } from '@omne-harness-lite/session-log/cordis'
import { SESSION_ACCESS } from '@omne-harness-lite/session-tenancy/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { createRuntimeContextLocal } from '@omne-harness-lite/runtime-context-local/cordis'

/** A trusted application module binds one factory instance to one managed tree row. */
export async function startRuntimeContextAssembly(ctx: Context) {
  const binding = createRuntimeContextLocal(),
    id = 'runtime-context'
  const prepared = await preparePluginTree(
    composePluginTree([
      { id, plugin: { package: '@demo/runtime-context', export: 'provider' }, config: {} },
    ]),
    {
      externalServices: [SESSION_LOG_BACKING, SESSION_ACCESS, CLOCK_SERVICE, STORAGE_SERVICE],
      async resolveModule(reference) {
        if (reference.package !== '@demo/runtime-context' || reference.export !== 'provider')
          throw new Error('unknown context assembly module')
        return { provider: binding.plugin }
      },
    },
  )
  const lifetime = createAssemblyLifetime(prepared.ids, binding.closeAdmission)
  const tree = loadPluginTree(ctx, prepared, lifetime)
  let observed = false
  return Object.freeze({
    ready: tree.ready,
    initializer: binding.initializer,
    closeAdmission: binding.closeAdmission,
    fiber: () => inspectPluginTree(tree).find(row => row.id === id)?.fiber,
    async close(): Promise<'closed' | 'retained'> {
      binding.closeAdmission()
      const closing = tree.dispose()
      const control = lifetime.closeControl(id)
      if (control) {
        const attempt = observed ? control.retryClose() : control.closeAttempt()
        observed = true
        if ((await attempt) === 'retained') return 'retained'
      }
      const report = await closing
      if (
        report.assemblyErrors.length ||
        report.rows.some(row => row.result.kind === 'failed' && row.result.codes.includes('close'))
      )
        throw new Error('runtime context assembly close failed')
      return 'closed'
    },
  })
}
