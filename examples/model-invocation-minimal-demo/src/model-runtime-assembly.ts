import type { Context } from '@deepseek-ai/cordis'
import { createAssemblyLifetime } from '@omne-harness-lite/assembly-lifecycle'
import { composePluginTree } from '@omne-harness-lite/cordis-plugin-tree'
import { preparePluginTree, loadPluginTree } from '@omne-harness-lite/cordis-plugin-tree/cordis'
import {
  createModelRuntimeLocal,
  type ModelRuntimeLocalConfig,
  type ModelRuntimeLocalConstruction,
} from '@omne-harness-lite/model-request-runtime-local/cordis'
import {
  MODEL_RUNTIME_HOST_INPUTS,
  MODEL_RUNTIME_EXECUTION_SUPPORT,
  MODEL_TRANSPORT,
} from '@omne-harness-lite/model-request-runtime/cordis'
import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'

// The trusted assembly uses one stable Context. This is local ownership, not authorization.
const reservations = new WeakMap<Context, object>()

/** One real provider row retains its original dependencies until confirmed closure. */
export async function startModelRuntimeAssembly(
  ctx: Context,
  config: ModelRuntimeLocalConfig,
  construction: ModelRuntimeLocalConstruction = {},
) {
  if (reservations.has(ctx)) throw new Error('model runtime original assembly retained')
  const reservation = Object.freeze({})
  reservations.set(ctx, reservation)
  const releaseReservation = () => {
    if (reservations.get(ctx) === reservation) reservations.delete(ctx)
  }
  const binding = createModelRuntimeLocal(construction),
    id = 'model-runtime'
  // prepare/load validation has not acquired provider resources. The returned tree owns
  // asynchronous setup, including failure, and always remains accessible to its caller.
  let tree: ReturnType<typeof loadPluginTree>
  let lifetime: ReturnType<typeof createAssemblyLifetime>
  try {
    const prepared = await preparePluginTree(
      composePluginTree([
        { id, plugin: { package: '@demo/model-runtime', export: 'provider' }, config },
      ]),
      {
        externalServices: [
          MODEL_RUNTIME_HOST_INPUTS,
          MODEL_RUNTIME_EXECUTION_SUPPORT,
          MODEL_TRANSPORT,
          STORAGE_SERVICE,
          CLOCK_SERVICE,
        ],
        async resolveModule(reference) {
          if (reference.package !== '@demo/model-runtime' || reference.export !== 'provider')
            throw new Error('unknown model runtime assembly module')
          return { provider: binding.plugin }
        },
      },
    )
    lifetime = createAssemblyLifetime(prepared.ids, binding.closeAdmission)
    tree = loadPluginTree(ctx, prepared, lifetime)
  } catch (error) {
    releaseReservation()
    throw error
  }
  let observed = false
  return Object.freeze({
    ready: tree.ready,
    owner: binding.owner,
    closeAdmission: binding.closeAdmission,
    async close(): Promise<'closed' | 'retained'> {
      binding.closeAdmission()
      const closing = tree.dispose(),
        control = lifetime.closeControl(id)
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
        throw new Error('model runtime assembly close failed')
      const result = await binding.close()
      if (!('released' in result)) return 'retained'
      releaseReservation()
      return 'closed'
    },
  })
}
