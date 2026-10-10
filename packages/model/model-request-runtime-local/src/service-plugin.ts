import type { SessionModelSelectionFactory } from '@omne-harness-lite/model-request-runtime'
import type { SessionModelSettlement } from '@omne-harness-lite/model-request-runtime'
import type { SessionModelAcknowledgementFactory } from '@omne-harness-lite/model-request-runtime'
import type { ModelCallPublication } from '@omne-harness-lite/model-request-runtime'
import type { SessionModelRequestPreparation } from '@omne-harness-lite/model-request-runtime'
import { symbols, type Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import {
  ASSEMBLY_LIFETIME_SERVICE,
  startRetainedAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import type { AssemblyDeclaration } from '@omne-harness-lite/cordis-plugin-tree'
import { LosslessNumber, isNonNegativeJsonInteger } from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { CallKey } from '@omne-harness-lite/messages'
import type {
  ModelRuntimeOperations,
  ModelRuntimeHostInputs,
  ModelRuntimeHostLease,
  RuntimeCloseResult,
  DispatchInput,
  DispatchResult,
  DispatchAgainInput,
  DispatchAgainResult,
  ReadAttemptsResult,
  FailureConsumption,
  PlannedRequest,
  RawResponse,
  CallAccess,
  CallAccessInput,
  CallAccessEvidence,
  CallAccessResult,
  CallReadView,
  RetainedCallReadView,
  AcquireCallResult,
  TransportAdapter,
  AdaptationLease,
} from '@omne-harness-lite/model-request-runtime'
import {
  ModelRuntimeService,
  ModelRuntimeHostInputsService,
  MODEL_RUNTIME_SERVICE,
  MODEL_RUNTIME_HOST_INPUTS,
  MODEL_RUNTIME_EXECUTION_SUPPORT,
  MODEL_TRANSPORT,
} from '@omne-harness-lite/model-request-runtime/cordis'
import { z } from 'zod'
import { createModelRuntime } from './service-runtime.ts'
import { createCallContainerStore } from './service-container.ts'
import { createModelCallContentStore } from './reference-content.ts'
import type {
  SessionModelCallFacts,
  SessionModelCallFactsFactory,
} from '@omne-harness-lite/model-request-runtime'
import { createProviderContributions } from './provider-contributions.ts'
import type { ModelCallExternalContentCustody } from './reference-types.ts'

const integer = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const decimal = z.string().refine(value => {
  try {
    new LosslessNumber(value)
    return true
  } catch {
    return false
  }
}, 'Expected a JSON number lexeme')
const nonnegativeInteger = decimal.pipe(
  z.string().refine(value => isNonNegativeJsonInteger(new LosslessNumber(value))),
)
const positiveInteger = nonnegativeInteger.pipe(
  z
    .string()
    .refine(
      value => ExactDecimal.from(new LosslessNumber(value)).compare(ExactDecimal.from(0)) > 0,
    ),
)
const Config = z
  .object({
    maxScopes: integer,
    callReferences: z
      .object({
        maxScopes: integer,
        content: z.object({ maxConcurrentWrites: integer, maxContentBytes: integer }).strict(),
      })
      .strict(),
    reservationWaitPolicy: z
      .object({ maxWaitersPerCall: positiveInteger, timeoutMs: positiveInteger })
      .strict(),
    tokenMargin: z
      .object({
        multiplier: decimal.pipe(
          z
            .string()
            .refine(
              value =>
                ExactDecimal.from(new LosslessNumber(value)).compare(ExactDecimal.from(1)) >= 0,
            ),
        ),
        reserveTokens: nonnegativeInteger,
      })
      .strict(),
  })
  .strict()
export type ModelRuntimeLocalConfig = z.infer<typeof Config>
const requires = [
  MODEL_RUNTIME_HOST_INPUTS,
  MODEL_RUNTIME_EXECUTION_SUPPORT,
  STORAGE_SERVICE,
  CLOCK_SERVICE,
  MODEL_TRANSPORT,
] as const

type Runtime = ReturnType<typeof createModelRuntime<PlannedRequest, RawResponse>>
type Facts = SessionModelCallFacts

/** Close only new-work admission at the original host-port usage points. */
function admissionInputs(
  inputs: ModelRuntimeHostInputs,
  lease: ModelRuntimeHostLease,
): ModelRuntimeHostInputs {
  const callAccess: CallAccess = {
    async check<T>(
      input: CallAccessInput,
      admitted: (evidence: CallAccessEvidence) => Promise<T>,
    ): Promise<CallAccessResult<T>> {
      if (!lease.isCurrent()) return { unavailable: true }
      return inputs.callAccess.check(input, admitted)
    },
  }
  return Object.freeze({
    ...inputs,
    sessions: {
      async bind(...args: Parameters<ModelRuntimeHostInputs['sessions']['bind']>) {
        if (!lease.isCurrent()) return { failure: 'unavailable' } as const
        const result = await inputs.sessions.bind(...args)
        return lease.isCurrent() ? result : ({ failure: 'unavailable' } as const)
      },
    },
    callAccess,
  })
}
function retained(view: CallReadView): view is RetainedCallReadView {
  return view.acknowledged === undefined
}

interface ProviderState {
  readonly runtime: Runtime
  readonly facts: Facts
  readonly bridge: ModelRuntimeHostInputsService
  readonly contributions: ReturnType<typeof createProviderContributions>
}
// TypeScript private properties are readable through reflection. Keep privileged resources out
// of the service object; Cordis method receivers can be proxies, so use original-instance keys.
const states = new WeakMap<object, ProviderState>()
function stateOf(receiver: Provider): ProviderState {
  let state = states.get(receiver)
  if (!state) {
    const original: unknown = Reflect.get(receiver, symbols.original)
    if (original !== null && typeof original === 'object') state = states.get(original)
  }
  if (!state) throw new Error('model runtime receiver has no original owner')
  return state
}
async function invoke<R>(
  receiver: Provider,
  ctx: Context,
  operation: (service: ModelRuntimeOperations) => Promise<R>,
  newWork = false,
  effect = false,
  retain?: (
    result: R,
    borrow: ReturnType<ReturnType<typeof createProviderContributions>['borrow']>,
  ) => Promise<R>,
): Promise<R> {
  // Trace this generation's original bridge into the actual method receiver's caller context.
  const state = stateOf(receiver)
  const captured = ctx.reflect.trace(state.bridge).capture()
  const borrow = state.contributions.borrow(captured.lease, effect ? ctx : undefined)
  let finished = false
  try {
    const inputs = newWork ? admissionInputs(captured.inputs, captured.lease) : captured.inputs
    const result = await operation(
      state.runtime.project(inputs, state.facts.project(inputs.callPresence)),
    )
    finished = true
    if (retain) return await retain(result, borrow)
    await borrow.complete()
    return result
  } catch (error) {
    if (!finished) await borrow.complete()
    throw error
  }
}

class Provider extends ModelRuntimeService {
  constructor(ctx: Context, state: ProviderState) {
    super(ctx)
    states.set(this, state)
  }
  acquireCall(...args: Parameters<ModelRuntimeOperations['acquireCall']>) {
    return invoke<AcquireCallResult>(
      this,
      this.ctx,
      service => service.acquireCall(...args),
      false,
      true,
      async (result, borrow) => {
        const original = 'consumer' in result ? result.consumer : undefined
        await borrow.complete(original)
        if (!original || !('view' in result)) return result
        if (!retained(result.view)) return result
        if (borrow.withdrawn()) return { view: result.view }
        return { view: result.view, consumer: borrow.consumer(original) }
      },
    )
  }
  legalTargets(...args: Parameters<ModelRuntimeOperations['legalTargets']>) {
    return invoke(this, this.ctx, service => service.legalTargets(...args))
  }
  displayList(...args: Parameters<ModelRuntimeOperations['displayList']>) {
    return invoke(this, this.ctx, service => service.displayList(...args))
  }
  effectiveModel(...args: Parameters<ModelRuntimeOperations['effectiveModel']>) {
    return invoke(this, this.ctx, service => service.effectiveModel(...args))
  }
  selectModel(...args: Parameters<ModelRuntimeOperations['selectModel']>) {
    return invoke(this, this.ctx, service => service.selectModel(...args))
  }
  openCall(...args: Parameters<ModelRuntimeOperations['openCall']>) {
    return invoke(this, this.ctx, service => service.openCall(...args), true)
  }
  interrupt(...args: Parameters<ModelRuntimeOperations['interrupt']>) {
    return invoke(this, this.ctx, service => service.interrupt(...args))
  }
  releaseCall(...args: Parameters<ModelRuntimeOperations['releaseCall']>) {
    return invoke(this, this.ctx, service => service.releaseCall(...args))
  }
  reconcile(...args: Parameters<ModelRuntimeOperations['reconcile']>) {
    return invoke(this, this.ctx, service => service.reconcile(...args))
  }
  settleReply(...args: Parameters<ModelRuntimeOperations['settleReply']>) {
    return invoke(this, this.ctx, service => service.settleReply(...args))
  }
  canDispatchAgain(...args: Parameters<ModelRuntimeOperations['canDispatchAgain']>) {
    return invoke(this, this.ctx, service => service.canDispatchAgain(...args))
  }
  acknowledgeCall(...args: Parameters<ModelRuntimeOperations['acknowledgeCall']>) {
    return invoke(this, this.ctx, service => service.acknowledgeCall(...args))
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
    if (!options) return invoke(this, this.ctx, service => service.dispatch(input), true)
    return invoke(
      this,
      this.ctx,
      service => service.dispatch(input, options),
      true,
      true,
      async (result, borrow) => {
        const source = result.consumption.kind === 'failure' ? result.consumption.source : undefined
        await borrow.complete(source)
        return source && !borrow.withdrawn()
          ? { ...result, consumption: { kind: 'failure', source: borrow.source(source) } }
          : { ...result, consumption: { kind: 'notApplicable' } }
      },
    )
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
    if (!options) return invoke(this, this.ctx, service => service.dispatchAgain(input), true)
    return invoke(
      this,
      this.ctx,
      service => service.dispatchAgain(input, options),
      true,
      true,
      async (result, borrow) => {
        const source = result.consumption.kind === 'failure' ? result.consumption.source : undefined
        await borrow.complete(source)
        return source && !borrow.withdrawn()
          ? { ...result, consumption: { kind: 'failure', source: borrow.source(source) } }
          : { ...result, consumption: { kind: 'notApplicable' } }
      },
    )
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
    if (!options) return invoke(this, this.ctx, service => service.readAttempts(input))
    return invoke(
      this,
      this.ctx,
      service => service.readAttempts(input, options),
      false,
      true,
      async (result, borrow) => {
        const source = result.consumption.kind === 'failure' ? result.consumption.source : undefined
        await borrow.complete(source)
        return source && !borrow.withdrawn()
          ? { ...result, consumption: { kind: 'failure', source: borrow.source(source) } }
          : { ...result, consumption: { kind: 'notApplicable' } }
      },
    )
  }
}

/** Trusted assembly closure ports. These are not serialized policy or caller authority. */
export interface ModelRuntimeLocalConstruction {
  readonly selectionFactory: SessionModelSelectionFactory
  readonly requestPreparation: SessionModelRequestPreparation
  readonly callFactsFactory: SessionModelCallFactsFactory
  readonly settlementFactory: SessionModelSettlement
  readonly acknowledgementFactory: SessionModelAcknowledgementFactory
  readonly recordPublication: ModelCallPublication
  readonly externalContent?: ModelCallExternalContentCustody
  /** Add request projection to the original adapter. Preserve send/read/projectOutput,
   * semantic inputs, plan brands, cancellation and actual completion. No independent
   * resources or close owner. The original lease retains binding/signal/track/release.
   */
  readonly decorateTransport?: (
    original: TransportAdapter<PlannedRequest, RawResponse>,
  ) => TransportAdapter<PlannedRequest, RawResponse>
}

function decoratedLease(
  lease: AdaptationLease,
  decorate: ModelRuntimeLocalConstruction['decorateTransport'],
): { readonly lease: AdaptationLease } {
  if (!decorate) return { lease }
  try {
    return { lease: { ...lease, transport: decorate(lease.transport) } }
  } catch (error) {
    lease.release()
    throw error
  }
}

/** Trusted assembly owns this factory; source/facts never become ordinary Context services. */
export function createModelRuntimeLocal(construction: ModelRuntimeLocalConstruction) {
  const contentDependencies = construction.externalContent
    ? { externalContent: construction.externalContent }
    : {}
  const decorateTransport = construction.decorateTransport
  let mounted = false,
    stopped = false
  let runtime: Runtime | undefined
  let facts: Facts | undefined
  let content: ReturnType<typeof createModelCallContentStore> | undefined
  let calls: ReturnType<typeof createCallContainerStore<PlannedRequest, RawResponse>> | undefined
  let setupBorrow: ReturnType<ModelRuntimeHostInputsService['capture']> | undefined
  const contributions = createProviderContributions()
  const ready = Promise.withResolvers<void>()
  void ready.promise.catch(() => undefined)
  let closing: Promise<RuntimeCloseResult> | undefined
  function closeAdmission() {
    stopped = true
    if (!runtime) ready.reject(new Error('model runtime stopped before readiness'))
    // Admission alone must preserve original recovery, readers and existing work.
    runtime?.closeAdmission()
  }
  function close(): Promise<RuntimeCloseResult> {
    closeAdmission()
    contributions.closeAdmission()
    if (closing) return closing
    closing = (async () => {
      const outcomes = await Promise.allSettled([closeResources(), contributions.close()])
      const resource = outcomes[0],
        borrowers = outcomes[1]
      if (resource.status === 'rejected') throw resource.reason
      if (borrowers.status === 'rejected') throw borrowers.reason
      const result = resource.value
      if (!('released' in result)) return result
      if (runtime && !('released' in runtime.executionSource.release()))
        return { unavailable: true } as const
      setupBorrow?.lease.release()
      return { released: true } as const
    })().finally(() => {
      closing = undefined
    })
    return closing
  }
  async function closeResources(): Promise<RuntimeCloseResult> {
    if (runtime) return runtime.close()
    const store = await calls?.close()
    if (store && !('released' in store)) return store
    return facts?.close() ?? content?.close() ?? { released: true }
  }
  const plugin = Object.assign(
    definePlugin({
      name: 'model-request-runtime-local',
      Config,
      inject: [...requires, ASSEMBLY_LIFETIME_SERVICE],
      apply(ctx, config) {
        if (mounted) throw new Error('model runtime factory already mounted')
        mounted = true
        const bridge = ctx.modelRuntimeHostInputs
        const originalBridge: ModelRuntimeHostInputsService = Reflect.get(bridge, symbols.original)
        const support = ctx.modelRuntimeExecutionSupport,
          storage = ctx.storage,
          transport = ctx.modelTransport
        // Clock is required for the host policies of this generation; no replacement discovery.
        const clock = ctx.clock
        startRetainedAssemblyWork(
          ctx,
          async () => {
            try {
              if (stopped) throw new Error('model runtime owner stopped')
              if (!clock) throw new Error('model runtime clock absent')
              setupBorrow = originalBridge.capture()
              content = createModelCallContentStore({
                storage,
                policy: config.callReferences.content,
                ...contentDependencies,
              })
              facts = construction.callFactsFactory({
                content,
                presence: setupBorrow.inputs.callPresence,
                maxScopes: config.callReferences.maxScopes,
              })
              calls = createCallContainerStore<PlannedRequest, RawResponse>()
              runtime = createModelRuntime({
                requestPreparation: construction.requestPreparation,
                selectionFactory: construction.selectionFactory,
                acknowledgementFactory: construction.acknowledgementFactory,
                settlementFactory: construction.settlementFactory,
                recordPublication: construction.recordPublication,
                ...setupBorrow.inputs,
                settlementContention: support.settlementContention,
                settlementScheduler: support.settlementScheduler,
                policy: support.policy,
                acknowledgementCleanup: support.acknowledgementCleanup,
                diagnostic: support.diagnostic,
                ...(support.diagnosticCollector
                  ? { diagnosticCollector: support.diagnosticCollector }
                  : {}),
                calls,
                callFacts: facts,
                maxScopes: config.maxScopes,
                tokenMargin: {
                  multiplier: new LosslessNumber(config.tokenMargin.multiplier),
                  reserveTokens: new LosslessNumber(config.tokenMargin.reserveTokens),
                },
                reservationWaitPolicy: {
                  maxWaitersPerCall: new LosslessNumber(
                    config.reservationWaitPolicy.maxWaitersPerCall,
                  ),
                  timeoutMs: new LosslessNumber(config.reservationWaitPolicy.timeoutMs),
                },
                transport: {
                  clearReuseScope: scope => transport.clearReuseScope(scope),
                  acquire(binding, routeName) {
                    const result = transport.acquire(binding, routeName)
                    if ('lease' in result) return decoratedLease(result.lease, decorateTransport)
                    return result.rejected === 'invalidInput'
                      ? { invalidInput: { reason: 'malformed' } }
                      : { unavailable: true }
                  },
                },
              })
              ctx.fiber.assertActive()
              if (stopped || !ctx.assemblyLifetime.isCurrent())
                throw new Error('model runtime setup withdrawn')
              new Provider(ctx, { runtime, facts, bridge: originalBridge, contributions })
              ready.resolve()
            } catch (error) {
              ready.reject(error)
              throw error
            }
          },
          async () => {
            const result = await close()
            if (!('released' in result)) throw new Error('model runtime original owner retained')
          },
        )
      },
    }),
    {
      assemblyLifecycle: 1 as const,
      describeAssembly(value: unknown): AssemblyDeclaration {
        Config.parse(value)
        return {
          provides: [MODEL_RUNTIME_SERVICE],
          requires: [...requires],
          optional: [],
          dynamicProvides: [],
          dynamicRequires: [],
          claims: [],
        }
      },
    },
  )
  return Object.freeze({
    plugin,
    ready: ready.promise,
    closeAdmission,
    close,
    owner() {
      if (!runtime || !facts || !setupBorrow) throw new Error('model runtime owner not ready')
      return Object.freeze({
        executionSource: runtime.executionSource,
        facts: facts.project(setupBorrow.inputs.callPresence),
        close,
      })
    },
  })
}
