import { definePlugin } from '@omne-harness-lite/kernel-basis'
import { z } from 'zod'
import type { ModelRuntimeService, RuntimeCloseResult } from './service-types.ts'

export const MODEL_RUNTIME_SERVICE = 'modelRuntime'

export interface ModelRuntimeAssembly {
  readonly service: ModelRuntimeService
  /** Closes actual call/selection owners; unavailable retains unfinished responsibility. */
  readonly close: () => Promise<RuntimeCloseResult>
}
const methodNames = [
  'legalTargets',
  'displayList',
  'effectiveModel',
  'selectModel',
  'openCall',
  'dispatch',
  'dispatchAgain',
  'interrupt',
  'releaseCall',
  'reconcile',
  'readAttempts',
  'settleReply',
  'canDispatchAgain',
] as const satisfies readonly (keyof ModelRuntimeService)[]

/** P-2: the application supplies the one real A/B/C service composition per fiber run. */
export function createModelRuntimePlugin(input: {
  readonly construct: () => Promise<ModelRuntimeAssembly>
}) {
  if (typeof input.construct !== 'function') throw new TypeError('runtime constructor required')
  return definePlugin({
    name: 'model-request-runtime',
    inject: [
      'sessionLog',
      'modelCatalogRead',
      'credentialLookup',
      'modelTransport',
      'storage',
      'clock',
    ],
    Config: z.object({}).strict(),
    async apply(ctx) {
      if (ctx.get(MODEL_RUNTIME_SERVICE) !== undefined)
        throw new Error('duplicate model runtime service provider')
      const assembled = await input.construct()
      if (
        assembled === null ||
        typeof assembled !== 'object' ||
        typeof assembled.close !== 'function' ||
        assembled.service === null ||
        typeof assembled.service !== 'object'
      )
        throw new TypeError('invalid model runtime assembly')
      if (methodNames.some(name => typeof assembled.service[name] !== 'function')) {
        await assembled.close()
        throw new TypeError('incomplete model runtime service')
      }
      let admissionClosed = false
      let closing: Promise<RuntimeCloseResult> | undefined
      function close(): Promise<RuntimeCloseResult> {
        admissionClosed = true
        if (closing !== undefined) return closing
        closing = assembled.close()
        return closing
      }
      const original = assembled.service
      const service: ModelRuntimeService = {
        legalTargets: input => original.legalTargets(input),
        displayList: input => original.displayList(input),
        effectiveModel: input => original.effectiveModel(input),
        selectModel: input => original.selectModel(input),
        openCall: input =>
          admissionClosed ? Promise.resolve({ runtimeStopped: true }) : original.openCall(input),
        dispatch: input =>
          admissionClosed ? Promise.resolve({ runtimeStopped: true }) : original.dispatch(input),
        dispatchAgain: input =>
          admissionClosed
            ? Promise.resolve({ runtimeStopped: true })
            : original.dispatchAgain(input),
        interrupt: input => original.interrupt(input),
        releaseCall: input => original.releaseCall(input),
        reconcile: input => original.reconcile(input),
        readAttempts: input => original.readAttempts(input),
        settleReply: input => original.settleReply(input),
        canDispatchAgain: input => original.canDispatchAgain(input),
      }
      Object.freeze(service)
      try {
        ctx.effect(
          () => async () => {
            try {
              const result = await close()
              if ('unavailable' in result) ctx.logger.error('model_runtime.close_unavailable')
            } catch {
              ctx.logger.error('model_runtime.close_failed')
            }
          },
          'model-request-runtime.close',
        )
        ctx.provide(MODEL_RUNTIME_SERVICE, service)
      } catch (error) {
        await close()
        throw error
      }
    },
  })
}
