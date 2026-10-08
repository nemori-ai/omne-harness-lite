import type { Context, Fiber } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import {
  ModelRuntimeHostInputsService,
  ModelRuntimeExecutionSupportService,
  MODEL_RUNTIME_SERVICE,
} from '@omne-harness-lite/model-request-runtime/cordis'
import type {
  ModelRuntimeHostInputs,
  ModelRuntimeExecutionSupport,
  ModelRuntimeOperations,
  DispatchInput,
  DispatchResult,
  DispatchAgainInput,
  DispatchAgainResult,
  ReadAttemptsResult,
  FailureConsumption,
} from '@omne-harness-lite/model-request-runtime'
import type { CallKey } from '@omne-harness-lite/messages'
import { z } from 'zod'

/** This private assembly closure alone registers trusted actors on real caller fibers. */
export async function createDemoModelInputs(
  ctx: Context,
  base: ModelRuntimeHostInputs,
  support: ModelRuntimeExecutionSupport,
) {
  const subjects = new WeakMap<
    Fiber,
    {
      readonly build: (signal: AbortSignal) => ModelRuntimeHostInputs
      readonly invalidation: AbortController
      borrows: number
      finished: boolean
    }
  >()
  const callers = new Set<Fiber>()
  const generation = Object.freeze({})
  let stopping = false,
    borrows = 0
  class HostInputs extends ModelRuntimeHostInputsService {
    capture() {
      const thisFiber = this.ctx.fiber
      // Fiber identity is stable; traced Context object identity is not.
      const subject = subjects.get(thisFiber)
      const inputs = subject ? subject.build(subject.invalidation.signal) : base
      let released = false
      borrows++
      if (subject) subject.borrows++
      return Object.freeze({
        inputs,
        lease: Object.freeze({
          generation,
          isCurrent: () =>
            !stopping && subject !== undefined && !subject.invalidation.signal.aborted,
          release() {
            if (released) return
            released = true
            borrows--
            if (subject && --subject.borrows === 0 && subject.finished)
              void thisFiber
                .dispose()
                .catch(() => ctx.logger.error('demo_model.caller_dispose_failed'))
          },
        }),
      })
    }
  }
  class ExecutionSupport extends ModelRuntimeExecutionSupportService {
    readonly settlementContention = support.settlementContention
    readonly settlementScheduler = support.settlementScheduler
    readonly policy = support.policy
    readonly acknowledgementCleanup = support.acknowledgementCleanup
    readonly diagnostic = support.diagnostic
    declare readonly diagnosticCollector?: Exclude<
      ModelRuntimeExecutionSupport['diagnosticCollector'],
      undefined
    >
    constructor(inner: Context) {
      super(inner)
      if (support.diagnosticCollector) this.diagnosticCollector = support.diagnosticCollector
    }
  }
  const binding = ctx.plugin(
    definePlugin({
      name: 'demo-model-runtime-inputs',
      Config: z.object({}).strict(),
      apply(inner) {
        new HostInputs(inner)
        new ExecutionSupport(inner)
      },
    }),
    {},
  )
  await binding
  async function run<R>(
    build: (signal: AbortSignal) => ModelRuntimeHostInputs,
    work: (service: ModelRuntimeOperations) => Promise<R>,
  ): Promise<R> {
    if (stopping) throw new Error('demo model inputs stopped')
    const fiber = ctx.plugin(
      definePlugin({
        name: 'demo-model-caller',
        Config: z.object({}).strict(),
        apply() {},
      }),
      {},
    )
    const invalidation = new AbortController()
    const subject = { build, invalidation, borrows: 0, finished: false }
    subjects.set(fiber.ctx.fiber, subject)
    callers.add(fiber)
    fiber.ctx.effect(() => () => {
      invalidation.abort()
      callers.delete(fiber)
    })
    try {
      const service = fiber.ctx.get(MODEL_RUNTIME_SERVICE)
      if (!service) throw new Error('demo model runtime not ready')
      return await work(service)
    } finally {
      subject.finished = true
      if (subject.borrows === 0) await fiber.dispose()
    }
  }
  class Caller implements ModelRuntimeOperations {
    readonly #build: (signal: AbortSignal) => ModelRuntimeHostInputs
    constructor(build: (signal: AbortSignal) => ModelRuntimeHostInputs) {
      this.#build = build
      // This private operations adapter supplies independent closures. The actual Cordis
      // provider methods are still invoked on their traced receiver inside run().
      this.acquireCall = this.acquireCall.bind(this)
      this.legalTargets = this.legalTargets.bind(this)
      this.displayList = this.displayList.bind(this)
      this.effectiveModel = this.effectiveModel.bind(this)
      this.selectModel = this.selectModel.bind(this)
      this.openCall = this.openCall.bind(this)
      this.dispatch = this.dispatch.bind(this)
      this.dispatchAgain = this.dispatchAgain.bind(this)
      this.interrupt = this.interrupt.bind(this)
      this.releaseCall = this.releaseCall.bind(this)
      this.reconcile = this.reconcile.bind(this)
      this.readAttempts = this.readAttempts.bind(this)
      this.settleReply = this.settleReply.bind(this)
      this.canDispatchAgain = this.canDispatchAgain.bind(this)
      this.acknowledgeCall = this.acknowledgeCall.bind(this)
    }
    acquireCall(...args: Parameters<ModelRuntimeOperations['acquireCall']>) {
      return run(this.#build, service => service.acquireCall(...args))
    }
    legalTargets(...args: Parameters<ModelRuntimeOperations['legalTargets']>) {
      return run(this.#build, service => service.legalTargets(...args))
    }
    displayList(...args: Parameters<ModelRuntimeOperations['displayList']>) {
      return run(this.#build, service => service.displayList(...args))
    }
    effectiveModel(...args: Parameters<ModelRuntimeOperations['effectiveModel']>) {
      return run(this.#build, service => service.effectiveModel(...args))
    }
    selectModel(...args: Parameters<ModelRuntimeOperations['selectModel']>) {
      return run(this.#build, service => service.selectModel(...args))
    }
    openCall(...args: Parameters<ModelRuntimeOperations['openCall']>) {
      return run(this.#build, service => service.openCall(...args))
    }
    interrupt(...args: Parameters<ModelRuntimeOperations['interrupt']>) {
      return run(this.#build, service => service.interrupt(...args))
    }
    releaseCall(...args: Parameters<ModelRuntimeOperations['releaseCall']>) {
      return run(this.#build, service => service.releaseCall(...args))
    }
    reconcile(...args: Parameters<ModelRuntimeOperations['reconcile']>) {
      return run(this.#build, service => service.reconcile(...args))
    }
    settleReply(...args: Parameters<ModelRuntimeOperations['settleReply']>) {
      return run(this.#build, service => service.settleReply(...args))
    }
    canDispatchAgain(...args: Parameters<ModelRuntimeOperations['canDispatchAgain']>) {
      return run(this.#build, service => service.canDispatchAgain(...args))
    }
    acknowledgeCall(...args: Parameters<ModelRuntimeOperations['acknowledgeCall']>) {
      return run(this.#build, service => service.acknowledgeCall(...args))
    }
    dispatch(input: DispatchInput): Promise<DispatchResult>
    dispatch(
      input: DispatchInput,
      options: { readonly consumeFailure: true },
    ): Promise<FailureConsumption<DispatchResult>>
    dispatch(
      input: DispatchInput,
      options?: { readonly consumeFailure: true },
    ): Promise<DispatchResult | FailureConsumption<DispatchResult>> {
      return options
        ? run(this.#build, service => service.dispatch(input, options))
        : run(this.#build, service => service.dispatch(input))
    }
    dispatchAgain(input: DispatchAgainInput): Promise<DispatchAgainResult>
    dispatchAgain(
      input: DispatchAgainInput,
      options: { readonly consumeFailure: true },
    ): Promise<FailureConsumption<DispatchAgainResult>>
    dispatchAgain(
      input: DispatchAgainInput,
      options?: { readonly consumeFailure: true },
    ): Promise<DispatchAgainResult | FailureConsumption<DispatchAgainResult>> {
      return options
        ? run(this.#build, service => service.dispatchAgain(input, options))
        : run(this.#build, service => service.dispatchAgain(input))
    }
    readAttempts(input: CallKey): Promise<ReadAttemptsResult>
    readAttempts(
      input: CallKey,
      options: { readonly consumeFailure: true },
    ): Promise<FailureConsumption<ReadAttemptsResult>>
    readAttempts(
      input: CallKey,
      options?: { readonly consumeFailure: true },
    ): Promise<ReadAttemptsResult | FailureConsumption<ReadAttemptsResult>> {
      return options
        ? run(this.#build, service => service.readAttempts(input, options))
        : run(this.#build, service => service.readAttempts(input))
    }
  }
  return Object.freeze({
    caller(build: (signal: AbortSignal) => ModelRuntimeHostInputs): ModelRuntimeOperations {
      return new Caller(build)
    },
    async close() {
      stopping = true
      await Promise.all([...callers].map(fiber => fiber.dispose()))
      if (borrows !== 0) throw new Error('demo model input borrows retained')
      await binding.dispose()
    },
  })
}
