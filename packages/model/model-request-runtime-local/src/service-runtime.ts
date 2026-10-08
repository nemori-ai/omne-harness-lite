import { projectRuntimeComponent } from './runtime-projection.ts'
import type { CallFactsView } from './reference-types.ts'
import { randomUUID } from 'node:crypto'
import { createPlanReuseScopes } from './plan-reuse-scopes.ts'
import { createRuntimeAcquire } from './service-acquire.ts'
import { createServiceAcknowledge } from './service-acknowledge.ts'
import { createAcknowledgementCustody } from './acknowledgement-custody.ts'
import { createRuntimeReads } from './service-reads.ts'
import { createServiceCalls } from './service-calls.ts'
import { createServiceDispatch } from './service-dispatch.ts'
import { createServiceControl } from './service-control.ts'
import { createRuntimeReconcile, createRuntimeSettleReply } from './service-reconcile.ts'
import { drainDiagnosticThenable } from './invocation-diagnostics.ts'
import { retainRuntimeExecutions } from './execution-source.ts'
import type {
  ModelRuntimeOperations,
  ModelRuntimeHostInputs,
  RuntimeCloseResult,
  FailureConsumableOperation,
  FailureConsumption,
  ModelRuntimeExecutionSource,
} from '@omne-harness-lite/model-request-runtime'
import type { RuntimeConstruction } from './service-types.ts'
import type { PlannedSemantics } from '@omne-harness-lite/model-request-runtime'

const ownedStores = new WeakSet<object>()
const unavailable = Object.freeze({ unavailable: true } as const)
const runtimeStopped = Object.freeze({ runtimeStopped: true } as const)

/** One process owner for all reference lifecycle operations and their shared call store. */
export function createModelRuntime<P extends PlannedSemantics, R>(
  provided: RuntimeConstruction<P, R>,
): {
  readonly service: ModelRuntimeOperations
  readonly project: (inputs: ModelRuntimeHostInputs, facts: CallFactsView) => ModelRuntimeOperations
  readonly close: () => Promise<RuntimeCloseResult>
  readonly executionSource: ModelRuntimeExecutionSource
} {
  if (ownedStores.has(provided.calls)) throw new TypeError('call store already owned')
  let released = false
  const executions = retainRuntimeExecutions(provided.calls, () => released)
  const construction = Object.freeze({ ...provided, calls: executions.calls })
  // RT12 S-98: one custody per runtime owns ACK cleanup; its explicit retry policy is required.
  const custody = createAcknowledgementCustody({
    runtimeCopies: executions.runtimeCopies,
    calls: construction.calls,
    content: construction.callFacts.content,
    scheduler: construction.settlementScheduler,
    policy: construction.acknowledgementCleanup,
    diagnostic: event => construction.policy.diagnostic(event),
  })
  // These constructors only create local closures; host resource acquisition precedes this factory.
  const scopes = createPlanReuseScopes(construction)
  const reads = createRuntimeReads(construction, custody)
  const acquire = createRuntimeAcquire(construction, custody)
  const acknowledge = createServiceAcknowledge(construction, custody)
  const calls = createServiceCalls(construction, scopes, custody)
  const dispatch = createServiceDispatch(construction, scopes)
  const control = createServiceControl(construction)
  const instance = randomUUID()
  const settlementInputs = (source: RuntimeConstruction<P, R>) => ({
    calls: source.calls,
    sessions: source.sessions,
    callAccess: source.callAccess,
    callFacts: source.callFacts,
    contention: source.settlementContention,
    scheduler: source.settlementScheduler,
    reservationWaitPolicy: source.reservationWaitPolicy,
    ...(source.history.run === undefined ? {} : { run: source.history.run }),
    diagnostic: source.diagnostic,
    custody,
    instance,
  })
  const settleReply = createRuntimeSettleReply(settlementInputs(construction))
  let recoveryDiagnosticReportEnabled = true
  const reportRecoveryDiagnosticFailure = (): void => {
    if (!recoveryDiagnosticReportEnabled) return
    try {
      const returned: unknown = construction.policy.diagnostic({
        kind: 'model_runtime.recovery_diagnostic_failed',
      })
      if (drainDiagnosticThenable(returned)) recoveryDiagnosticReportEnabled = false
    } catch {
      recoveryDiagnosticReportEnabled = false
    }
  }
  const recoveryInputs = (source: RuntimeConstruction<P, R>) => ({
    recovery: source.recovery,
    run: source.history.run,
    contention: source.settlementContention,
    scheduler: source.settlementScheduler,
    now: source.policy.now,
    diagnostic: source.diagnostic,
    ...(source.diagnosticCollector === undefined
      ? {}
      : { diagnosticCollector: source.diagnosticCollector }),
    onDiagnosticFailure: reportRecoveryDiagnosticFailure,
    custody,
    settlementWork: { store: source.callFacts.content.work, owns: settleReply.ownsWork },
  })
  const reconcile = createRuntimeReconcile(recoveryInputs(construction))
  ownedStores.add(provided.calls)

  const inFlight = new Set<Promise<void>>()
  let admissionClosed = false
  let closing: Promise<RuntimeCloseResult> | undefined

  function guarded<I, O>(
    operation: (input: I) => Promise<O>,
    halted: O,
    allowClosed = false,
  ): (input: I) => Promise<O> {
    return async input => {
      if (admissionClosed && !allowClosed) return halted
      let complete = () => {}
      const done = new Promise<void>(resolve => {
        complete = resolve
      })
      inFlight.add(done)
      try {
        return await operation(input)
      } finally {
        inFlight.delete(done)
        complete()
      }
    }
  }

  function guardedFailure<I, O>(
    operation: FailureConsumableOperation<I, O>,
    halted: O,
  ): FailureConsumableOperation<I, O> {
    function invoke(input: I): Promise<O>
    function invoke(
      input: I,
      options: { readonly consumeFailure: true },
    ): Promise<FailureConsumption<O>>
    async function invoke(
      input: I,
      options?: { readonly consumeFailure: true },
    ): Promise<O | FailureConsumption<O>> {
      if (admissionClosed)
        return options === undefined
          ? halted
          : { result: halted, consumption: { kind: 'notApplicable' } }
      let complete = () => {}
      const done = new Promise<void>(resolve => {
        complete = resolve
      })
      inFlight.add(done)
      try {
        return options === undefined ? await operation(input) : await operation(input, options)
      } finally {
        inFlight.delete(done)
        complete()
      }
    }
    return invoke
  }

  function operations(components: {
    reads: Pick<typeof reads, 'methods'>
    acquire: Pick<typeof acquire, 'acquireCall'>
    acknowledge: Pick<typeof acknowledge, 'acknowledgeCall'>
    calls: Pick<typeof calls, 'openCall'>
    dispatch: Pick<typeof dispatch, 'dispatch' | 'dispatchAgain'>
    control: Pick<typeof control, 'interrupt' | 'releaseCall'>
    reconcile: Pick<typeof reconcile, 'reconcile'>
    settleReply: Pick<typeof settleReply, 'settleReply'>
  }): ModelRuntimeOperations {
    const { reads, acquire, acknowledge, calls, dispatch, control, reconcile, settleReply } =
      components
    return Object.freeze({
      acquireCall: guarded(acquire.acquireCall, unavailable, true),
      legalTargets: guarded(reads.methods.legalTargets, unavailable),
      displayList: guarded(reads.methods.displayList, unavailable),
      effectiveModel: guarded(reads.methods.effectiveModel, unavailable),
      selectModel: guarded(reads.methods.selectModel, unavailable),
      openCall: guarded(calls.openCall, runtimeStopped),
      dispatch: guardedFailure(dispatch.dispatch, runtimeStopped),
      dispatchAgain: guardedFailure(dispatch.dispatchAgain, runtimeStopped),
      interrupt: guarded(control.interrupt, unavailable),
      releaseCall: guarded(control.releaseCall, unavailable),
      reconcile: guarded(reconcile.reconcile, unavailable),
      readAttempts: guardedFailure(reads.methods.readAttempts, unavailable),
      settleReply: guarded(settleReply.settleReply, unavailable),
      canDispatchAgain: guarded(reads.methods.canDispatchAgain, unavailable),
      // RT12 S-100: host stop does not hide a durable ACK or its cleanup recognition.
      acknowledgeCall: guarded(acknowledge.acknowledgeCall, unavailable, true),
    })
  }
  const service = operations({
    reads,
    acquire,
    acknowledge,
    calls,
    dispatch,
    control,
    reconcile,
    settleReply,
  })

  function project(inputs: ModelRuntimeHostInputs, facts: CallFactsView): ModelRuntimeOperations {
    if (facts.content !== construction.callFacts.content)
      throw new TypeError('runtime projection must borrow the original content owner')
    const next: RuntimeConstruction<P, R> = Object.freeze({
      ...construction,
      sessions: inputs.sessions,
      history: inputs.history,
      recovery: inputs.recovery,
      callAccess: inputs.callAccess,
      callPresence: inputs.callPresence,
      identities: inputs.identities,
      callFacts: Object.freeze({
        content: construction.callFacts.content,
        lookup: facts.lookup,
        creation: facts.creation,
        refresh: facts.refresh,
        close: construction.callFacts.close,
      }),
    })
    return operations({
      reads: projectRuntimeComponent(reads, next),
      acquire: projectRuntimeComponent(acquire, next),
      acknowledge: projectRuntimeComponent(acknowledge, next),
      calls: projectRuntimeComponent(calls, next),
      dispatch: projectRuntimeComponent(dispatch, next),
      control: projectRuntimeComponent(control, next),
      settleReply: projectRuntimeComponent(settleReply, settlementInputs(next)),
      reconcile: projectRuntimeComponent(reconcile, recoveryInputs(next)),
    })
  }

  const owners = [
    ['reads', reads.close],
    ['acquire', acquire.close],
    ['acknowledge', acknowledge.close],
    ['custody', custody.close],
    ['calls', calls.close],
    ['dispatch', dispatch.close],
    ['control', control.close],
    ['settleReply', settleReply.close],
    ['reconcile', reconcile.close],
  ] as const
  async function closeOwners(): Promise<{ readonly released: boolean; readonly threw: boolean }> {
    const attempts = owners.map(([, close]) => {
      try {
        return close()
      } catch (error) {
        return Promise.reject(error)
      }
    })
    const outcomes = await Promise.allSettled(attempts)
    for (const [index, outcome] of outcomes.entries()) {
      if (outcome?.status !== 'rejected') continue
      try {
        construction.policy.diagnostic({
          kind: 'model_runtime.close_component_failed',
          detail: { component: owners[index]?.[0] ?? 'unknown' },
        })
      } catch {
        // Diagnostics do not settle or release the failed owner.
      }
    }
    return {
      released: outcomes.every(
        outcome => outcome.status === 'fulfilled' && 'released' in outcome.value,
      ),
      threw: outcomes.some(outcome => outcome.status === 'rejected'),
    }
  }

  async function closeResource(
    component: 'store' | 'facts',
    close: () => Promise<RuntimeCloseResult>,
  ): Promise<RuntimeCloseResult> {
    try {
      return await close()
    } catch {
      try {
        construction.policy.diagnostic({
          kind: 'model_runtime.close_component_failed',
          detail: { component },
        })
      } catch {
        // Diagnostics do not settle or release the failed resource.
      }
      return unavailable
    }
  }

  async function closeOnce(): Promise<RuntimeCloseResult> {
    const first = await closeOwners()
    await Promise.allSettled([...inFlight])
    const second = await closeOwners()
    // Writers and readers may still need immutable content while they drain.
    // Close the container store and facts only after their work actually stops.
    const store =
      second.released && inFlight.size === 0
        ? await closeResource('store', construction.calls.close)
        : unavailable
    const facts =
      'released' in store ? await closeResource('facts', construction.callFacts.close) : unavailable
    const scopeResult = inFlight.size === 0 ? scopes.close() : unavailable
    return !first.threw &&
      !second.threw &&
      second.released &&
      'released' in store &&
      'released' in facts &&
      inFlight.size === 0 &&
      'released' in scopeResult
      ? { released: true }
      : unavailable
  }

  function close(): Promise<RuntimeCloseResult> {
    if (released) return Promise.resolve({ released: true })
    if (closing !== undefined) return closing
    admissionClosed = true
    const attempt = closeOnce()
    closing = attempt
      .then(result => {
        if ('released' in result) released = true
        return result
      })
      .catch(() => unavailable)
      .finally(() => {
        closing = undefined
      })
    return closing
  }

  return Object.freeze({ service, project, close, executionSource: executions.source })
}
