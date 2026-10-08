import type {
  FailureConsumableOperation,
  FailureConsumption,
  ModelRuntimeOperations,
  RuntimeCloseResult,
} from '@omne-harness-lite/model-request-runtime'
import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { z } from 'zod'

import {
  ModelRuntimeService as RuntimeDefinition,
  MODEL_RUNTIME_SERVICE,
} from '@omne-harness-lite/model-request-runtime/cordis'
import type { Context } from '@deepseek-ai/cordis'

/** The host retains this owner before construction resolves; release only removes that retention. */
export interface ModelRuntimeAssemblyOwner {
  readonly close: () => Promise<RuntimeCloseResult>
  readonly release: () => void
}
export interface ModelRuntimeAssembly {
  readonly service: ModelRuntimeOperations
  readonly owner: ModelRuntimeAssemblyOwner
}
const methodNames = [
  'acquireCall',
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
  'acknowledgeCall',
] as const satisfies readonly (keyof ModelRuntimeOperations)[]

function validAssembly(assembled: ModelRuntimeAssembly): boolean {
  return !(
    assembled === null ||
    typeof assembled !== 'object' ||
    assembled.owner === null ||
    typeof assembled.owner !== 'object' ||
    typeof assembled.owner.close !== 'function' ||
    typeof assembled.owner.release !== 'function' ||
    assembled.service === null ||
    typeof assembled.service !== 'object'
  )
}

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
      STORAGE_SERVICE,
      CLOCK_SERVICE,
    ],
    Config: z.object({}).strict(),
    async apply(ctx) {
      if (ctx.get(MODEL_RUNTIME_SERVICE) !== undefined)
        throw new Error('duplicate model runtime service provider')
      const assembled = await input.construct()
      if (!validAssembly(assembled)) throw new TypeError('invalid model runtime assembly')
      const { owner } = assembled
      let released = false
      async function closeOwner(): Promise<RuntimeCloseResult> {
        const result = await owner.close()
        if ('released' in result && result.released === true && !released) {
          owner.release()
          released = true
        }
        return result
      }
      if (methodNames.some(name => typeof assembled.service[name] !== 'function')) {
        await closeOwner()
        throw new TypeError('incomplete model runtime service')
      }
      let admissionClosed = false
      let closing: Promise<RuntimeCloseResult> | undefined
      function close(): Promise<RuntimeCloseResult> {
        admissionClosed = true
        if (closing !== undefined) return closing
        closing = closeOwner()
        return closing
      }
      const original = assembled.service
      function forwardFailure<I, R>(
        operation: FailureConsumableOperation<I, R>,
        stopped?: R,
      ): FailureConsumableOperation<I, R> {
        function invoke(input: I): Promise<R>
        function invoke(
          input: I,
          options: { readonly consumeFailure: true },
        ): Promise<FailureConsumption<R>>
        async function invoke(
          input: I,
          options?: { readonly consumeFailure: true },
        ): Promise<R | FailureConsumption<R>> {
          if (admissionClosed && stopped !== undefined)
            return options === undefined
              ? stopped
              : { result: stopped, consumption: { kind: 'notApplicable' } }
          return options === undefined ? await operation(input) : await operation(input, options)
        }
        return invoke
      }
      const service: ModelRuntimeOperations = {
        acquireCall: input => original.acquireCall(input),
        legalTargets: input => original.legalTargets(input),
        displayList: input => original.displayList(input),
        effectiveModel: input => original.effectiveModel(input),
        selectModel: input => original.selectModel(input),
        openCall: input =>
          admissionClosed ? Promise.resolve({ runtimeStopped: true }) : original.openCall(input),
        dispatch: forwardFailure(original.dispatch, { runtimeStopped: true }),
        dispatchAgain: forwardFailure(original.dispatchAgain, { runtimeStopped: true }),
        interrupt: input => original.interrupt(input),
        releaseCall: input => original.releaseCall(input),
        reconcile: input => original.reconcile(input),
        readAttempts: forwardFailure(original.readAttempts),
        settleReply: input => original.settleReply(input),
        canDispatchAgain: input => original.canDispatchAgain(input),
        // RT12 S-100: host stop does not hide a durable ACK or its cleanup recognition.
        acknowledgeCall: input => original.acknowledgeCall(input),
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
        new ModelRuntimeProvider(ctx, service)
      } catch (error) {
        await close()
        throw error
      }
    },
  })
}

class ModelRuntimeProvider extends RuntimeDefinition {
  readonly acquireCall: ModelRuntimeOperations['acquireCall']
  readonly legalTargets: ModelRuntimeOperations['legalTargets']
  readonly displayList: ModelRuntimeOperations['displayList']
  readonly effectiveModel: ModelRuntimeOperations['effectiveModel']
  readonly selectModel: ModelRuntimeOperations['selectModel']
  readonly openCall: ModelRuntimeOperations['openCall']
  readonly dispatch: ModelRuntimeOperations['dispatch']
  readonly dispatchAgain: ModelRuntimeOperations['dispatchAgain']
  readonly interrupt: ModelRuntimeOperations['interrupt']
  readonly releaseCall: ModelRuntimeOperations['releaseCall']
  readonly reconcile: ModelRuntimeOperations['reconcile']
  readonly readAttempts: ModelRuntimeOperations['readAttempts']
  readonly settleReply: ModelRuntimeOperations['settleReply']
  readonly canDispatchAgain: ModelRuntimeOperations['canDispatchAgain']
  readonly acknowledgeCall: ModelRuntimeOperations['acknowledgeCall']
  constructor(ctx: Context, service: ModelRuntimeOperations) {
    super(ctx)
    this.acquireCall = service.acquireCall
    this.legalTargets = service.legalTargets
    this.displayList = service.displayList
    this.effectiveModel = service.effectiveModel
    this.selectModel = service.selectModel
    this.openCall = service.openCall
    this.dispatch = service.dispatch
    this.dispatchAgain = service.dispatchAgain
    this.interrupt = service.interrupt
    this.releaseCall = service.releaseCall
    this.reconcile = service.reconcile
    this.readAttempts = service.readAttempts
    this.settleReply = service.settleReply
    this.canDispatchAgain = service.canDispatchAgain
    this.acknowledgeCall = service.acknowledgeCall
  }
}
