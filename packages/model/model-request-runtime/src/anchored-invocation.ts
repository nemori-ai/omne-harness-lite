import { parseOpaqueIdentifier, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { ExactDecimal, judgeAccountValue } from '@omne-harness-lite/call-accounts'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import { compareRfc3339Instants } from '@omne-harness-lite/offer-expiry'
import type { ModelCallDispatchedRecord } from '@omne-harness-lite/messages'
import type {
  AppendResult,
  AppendSuccess,
  OwnedLogEntry,
} from '@omne-harness-lite/session-log-jsonl'
import type { ReplyDisposition } from '@omne-harness-lite/model-response'
import { ownPlanInput, preflightMissingInputLimits } from './input.ts'
import { invokeModel } from './invoke.ts'
import { drainDiagnosticThenable } from './invocation-diagnostics.ts'
import {
  createCredentialRedactionPolicy,
  CredentialRedactionConfigurationError,
} from './credential-redaction.ts'
import { captureModelLogValue, prepareModelLogEntry, modelLogJsonEqual } from './log-codec.ts'
import { createSettlementCoordinator } from './settlement-coordinator.ts'
import { settlementAppendReceipt } from './settlement-receipt.ts'
import { settlementGenerationCurrent } from './settlement-prefix.ts'
import {
  constructPendingModelResponse,
  constructModelResponse,
  constructAnchoredInterruption,
  type ResponseConstructionInput,
} from './response-construction.ts'
import type {
  PlannedSemantics,
  ModelInvocationHandle,
  ModelInvocationResult,
  InvocationPolicy,
  OutputProjectionInput,
} from './types.ts'
import type {
  SettlementTask,
  SettlementRegistration,
  SettlementResult,
  SettlementHandle,
  SettlementRequest,
  SettlementOwner,
  SettlementTaskKind,
} from './settlement-types.ts'
import type {
  AnchoredInvocationHandle,
  AnchoredInvocationInput,
  AnchoredInvocationOutcome,
  ResponseConstructionResult,
} from './anchored-invocation-types.ts'
import type {
  DiagnosticEmitter,
  DiagnosticEvent,
  DiagnosticRecordResult,
} from './diagnostics-types.ts'

const unavailable = Object.freeze({ unavailable: true } as const)
/** One actual emitter is shared by the anchored owner and the inner public invocation. */
function anchoredDiagnostics<P extends PlannedSemantics, R>(
  input: AnchoredInvocationInput<P, R>,
): {
  readonly invocationEmitter?: DiagnosticEmitter
  readonly record: (event: DiagnosticEvent) => DiagnosticRecordResult
  readonly close: () => void
} {
  let emitter: DiagnosticEmitter | undefined
  let recordEnabled = true
  let closeAttempted = false
  let reportEnabled = true
  const report = (kind: string): void => {
    if (!reportEnabled) return
    try {
      const result: unknown = input.policy.diagnostic({ kind })
      if (drainDiagnosticThenable(result)) reportEnabled = false
    } catch {
      reportEnabled = false
    }
  }
  if (input.diagnosticEmitterFactory !== undefined) {
    try {
      const produced: unknown = input.diagnosticEmitterFactory()
      if (drainDiagnosticThenable(produced)) report('model_anchor.diagnostic_contract_violation')
      else if (
        produced !== null &&
        typeof produced === 'object' &&
        'record' in produced &&
        'close' in produced &&
        typeof produced.record === 'function' &&
        typeof produced.close === 'function'
      )
        emitter = produced as DiagnosticEmitter
      else report('model_anchor.diagnostic_contract_violation')
    } catch {
      report('model_anchor.diagnostic_sink_failed')
    }
  }
  const record = (event: DiagnosticEvent): DiagnosticRecordResult => {
    if (!emitter || !recordEnabled) return { dropped: 'closed' }
    try {
      const result: unknown = emitter.record(event)
      if (drainDiagnosticThenable(result)) {
        recordEnabled = false
        report('model_anchor.diagnostic_contract_violation')
        return { dropped: 'invalid' }
      } else if (result !== null && typeof result === 'object') {
        if ('recorded' in result) {
          const ref = result.recorded
          if (
            ref !== null &&
            typeof ref === 'object' &&
            'collectorId' in ref &&
            'sequence' in ref &&
            typeof ref.collectorId === 'string' &&
            typeof ref.sequence === 'string'
          )
            return { recorded: { collectorId: ref.collectorId, sequence: ref.sequence } }
        } else if (
          'dropped' in result &&
          (result.dropped === 'invalid' ||
            result.dropped === 'unsupported' ||
            result.dropped === 'oversize' ||
            result.dropped === 'queue_full' ||
            result.dropped === 'closed')
        )
          return { dropped: result.dropped }
      }
      recordEnabled = false
      report('model_anchor.diagnostic_contract_violation')
    } catch {
      recordEnabled = false
      report('model_anchor.diagnostic_sink_failed')
    }
    return { dropped: 'invalid' }
  }
  const close = (): void => {
    if (!emitter || closeAttempted) return
    closeAttempted = true
    try {
      const result: unknown = emitter.close()
      if (drainDiagnosticThenable(result)) report('model_anchor.diagnostic_contract_violation')
    } catch {
      report('model_anchor.diagnostic_sink_failed')
    }
  }
  return {
    ...(emitter === undefined
      ? {}
      : {
          invocationEmitter: Object.freeze({
            record,
            // The anchored owner closes the one emitter after durable work has stopped.
            close() {},
          } satisfies DiagnosticEmitter),
        }),
    record,
    close,
  }
}
function validPolicy(policy: InvocationPolicy): boolean {
  return (
    typeof policy.now === 'function' &&
    typeof policy.schedule === 'function' &&
    typeof policy.diagnostic === 'function' &&
    policy.statusCauseTable !== null &&
    typeof policy.statusCauseTable === 'object' &&
    Object.entries(policy.statusCauseTable).every(
      ([k, v]) =>
        /^[1-5][0-9]{2}$/.test(k) &&
        ['credential_unavailable', 'request_rejected', 'upstream_unavailable'].includes(v),
    ) &&
    [policy.firstContentTimeoutMs, policy.idleContentTimeoutMs].every(
      v => Number.isFinite(v) && v > 0,
    )
  )
}
function terminalHandle(
  value: AnchoredInvocationOutcome,
  releaseBorrowed?: () => Promise<void>,
  keepReferences = false,
): AnchoredInvocationHandle {
  let closing: ReturnType<AnchoredInvocationHandle['close']> | undefined
  return {
    outcome: Promise.resolve(value),
    snapshot: () => ({ blocks: [], position: 0 }),
    observedFacts: () => ({ unavailable: true }),
    abort() {},
    interrupt() {},
    borrowControl: () => unavailable,
    async settleReply() {
      return { unavailable: true, reason: 'closed' }
    },
    finishReady: () => Promise.resolve(unavailable),
    close() {
      if (keepReferences) return Promise.resolve(unavailable)
      closing ??= (async () => {
        await releaseBorrowed?.()
        return { released: true } as const
      })()
      return closing
    },
  }
}
/** R3-P3/P4/P5, RT5 S-15/17: one noRun dispatch with the original invokeModel and shared settlement. */
async function prepareAnchoredInvocation<P extends PlannedSemantics, R>(
  input: AnchoredInvocationInput<P, R>,
): Promise<AnchoredInvocationHandle> {
  input = Object.freeze({ ...input })
  const terminal = (value: AnchoredInvocationOutcome) =>
    terminalHandle(value, input.releaseBorrowed)
  const owned = ownPlanInput(input.planInput)
  const missing = owned === undefined ? preflightMissingInputLimits(input.planInput) : null
  const requested = owned ?? missing?.input
  if (
    !requested ||
    (input.run === undefined) !== (input.attempt === undefined) ||
    (input.run !== undefined && !('ok' in judgeAccountValue('RunId', input.run))) ||
    (input.attempt !== undefined && !('ok' in judgeAccountValue('AttemptId', input.attempt))) ||
    !(input.signal instanceof AbortSignal) ||
    !input.policy ||
    !validPolicy(input.policy) ||
    !('ok' in parseOpaqueIdentifier(input.messageId, 'MessageId')) ||
    !('ok' in parseOpaqueIdentifier(input.responseId, 'ResponseId')) ||
    input.profile.routeName !== requested.routeName ||
    !requested.snapshot.providers.includes(requested.provider) ||
    ((!requested.snapshot.allowFallback || modelLogJsonEqual(requested.target.dispatch, 1)) &&
      requested.provider !== requested.snapshot.providers[0]) ||
    (input.profile.origin === 'custom' && input.credentialScope.layer === 'factory') ||
    (input.credentialScope.layer === 'tenant' &&
      !tenantIdEquals(input.credentialScope.tenant, input.settlement.binding.tenant))
  )
    return terminal({ rejected: 'invalidInput', reason: 'malformed' })
  try {
    const bound = createCredentialRedactionPolicy(input.policy.credentialRedaction).bind(
      input.credential,
    )
    if ('rejected' in bound) return terminal({ rejected: 'invalidInput', reason: 'malformed' })
    const config = input.policy.credentialRedaction
    const sourceOwner = input.settlement.owner
    const sourceLog = input.settlement.binding.log
    const contention = input.settlement.settlementContention
    input = Object.freeze({
      ...input,
      policy: Object.freeze({
        ...input.policy,
        statusCauseTable: Object.freeze({ ...input.policy.statusCauseTable }),
        credentialRedaction: Object.freeze({
          credential_fragment_min_length: config.credential_fragment_min_length,
          credential_header_names: Object.freeze([...config.credential_header_names]),
          credential_patterns: Object.freeze(
            config.credential_patterns.map(pattern => Object.freeze({ ...pattern })),
          ),
        }),
      }),
      settlement: Object.freeze({
        ...input.settlement,
        ...(contention === undefined
          ? {}
          : {
              settlementContention: Object.freeze({
                ...contention,
                limits: Object.freeze({ ...contention.limits }),
              }),
            }),
        ...(input.settlement.settlementScheduler === undefined
          ? {}
          : { settlementScheduler: Object.freeze({ ...input.settlement.settlementScheduler }) }),
        binding: Object.freeze({
          ...input.settlement.binding,
          log: Object.freeze({
            append: sourceLog.append.bind(sourceLog),
            readSince: sourceLog.readSince.bind(sourceLog),
            readByKey: sourceLog.readByKey.bind(sourceLog),
          }),
        }),
        owner: Object.freeze({
          name: sourceOwner.name,
          admission: sourceOwner.admission.bind(sourceOwner),
          acquire: sourceOwner.acquire.bind(sourceOwner),
          opened: sourceOwner.opened.bind(sourceOwner),
          unresolvedWrites: sourceOwner.unresolvedWrites.bind(sourceOwner),
        }),
      }),
    })
  } catch (error) {
    if (error instanceof CredentialRedactionConfigurationError)
      return terminal({ rejected: 'invalidInput', reason: 'malformed' })
    throw error
  }
  const binding = Object.freeze({ ...input.settlement.binding })
  const originalOwner = input.settlement.owner
  if ('unknown' in originalOwner.opened() || originalOwner.unresolvedWrites().length > 0)
    return terminalHandle(unavailable, undefined, true)
  const contention = input.settlement.settlementContention
  if (contention === undefined || input.settlement.settlementScheduler === undefined)
    return terminal(unavailable)
  if (!settlementGenerationCurrent(binding) || originalOwner.admission() !== 'open')
    return terminal(unavailable)
  const transport = Object.freeze({
    plan: input.transport.plan.bind(input.transport),
    projectOutput: input.transport.projectOutput.bind(input.transport),
    send: input.transport.send.bind(input.transport),
    read: input.transport.read.bind(input.transport),
  })
  const policy = Object.freeze({
    ...input.policy,
    statusCauseTable: Object.freeze({ ...input.policy.statusCauseTable }),
  })
  if (input.signal.aborted) return terminal({ cancelledBeforeDispatch: true })
  const acquiredPlanning = originalOwner.acquire(contention.limits.concurrent)
  if ('unavailable' in acquiredPlanning) return terminal(unavailable)
  const planningRegistration = acquiredPlanning.registration
  let plan
  try {
    const task = planningRegistration.start('wait', async signal => {
      const completion = transport.plan(missing ? missing.original : requested, {
        signal: AbortSignal.any([signal, input.signal]),
        ...(input.reuseScope === undefined ? {} : { reuseScope: input.reuseScope }),
      })
      return input.trackPlan === undefined ? await completion : await input.trackPlan(completion)
    })
    try {
      plan = await task.completion
    } finally {
      await task.stopped
    }
  } finally {
    planningRegistration.release()
  }
  if (input.signal.aborted) return terminal({ cancelledBeforeDispatch: true })
  if (missing) {
    if (
      'rejected' in plan &&
      ((plan.rejected === 'invalidInput' && plan.reason === 'malformed') ||
        plan.rejected === 'modality_not_carried' ||
        plan.rejected === 'orphan_tool_call' ||
        plan.rejected === 'tool_internal_in_request')
    )
      return terminal(plan)
    return terminal({
      rejected: 'invalidInput',
      reason: 'input_limit_missing',
      metrics: missing.metrics,
    })
  }
  if ('rejected' in plan) return terminal(plan)
  const planned = plan.planned
  if (!modelLogJsonEqual(planned.input, requested))
    return terminal({ rejected: 'invalidInput', reason: 'malformed' })
  const captured = captureModelLogValue({
    category: 'record',
    input: {
      kind: 'value',
      value: {
        kind: 'model_call_dispatched',
        call: requested.target.callId,
        dispatch: requested.target.dispatch,
        response: input.responseId,
        provider: requested.provider,
        profile: input.profile,
        profileSnapshot: requested.snapshot,
        adaptation: requested.snapshot.adaptation,
        parameters: requested.parameters,
        selectedBy: input.selectedBy,
        credentialScope: input.credentialScope,
        ...(planned.parameterAdjustments === undefined
          ? {}
          : { parameterAdjustments: planned.parameterAdjustments }),
        ...(planned.droppedParameters === undefined
          ? {}
          : { droppedParameters: planned.droppedParameters }),
      },
    },
  })
  if ('invalidValue' in captured || captured.ok.record?.kind !== 'model_call_dispatched')
    return terminal({ rejected: 'invalidInput', reason: 'malformed' })
  const dispatched: ModelCallDispatchedRecord = captured.ok.record
  const prepared = prepareModelLogEntry({
    session: binding.session,
    shell: {
      tenant: binding.tenant,
      ...(input.run === undefined ? {} : { run: input.run, attempt: input.attempt }),
    },
    captured: captured.ok,
    purpose: { kind: 'record' },
    messagePrefix: null,
  })
  if ('invalidValue' in prepared) return terminal({ rejected: 'invalidInput', reason: 'malformed' })
  const acquired = originalOwner.acquire(contention.limits.concurrent)
  if ('unavailable' in acquired) return terminal(unavailable)
  const registration: SettlementRegistration = acquired.registration
  const controller = new AbortController()
  const tasks: SettlementTask<unknown>[] = []
  const unresolved = new Set<SettlementTask<AppendResult>>()
  let openedTask: SettlementTask<AppendResult> | undefined
  let openedConfirmed = false,
    openedKnownAbsent = false,
    quarantined = false,
    closed = false,
    registrationReleased = false,
    borrowedReleased = false
  let firstTokenAt: string | null = null
  let invocation: ModelInvocationHandle | undefined
  let construction: ResponseConstructionInput | undefined
  let interruption: Extract<ResponseConstructionResult, { readonly response: unknown }> | undefined
  let settled = false
  let heldSettlement:
    { readonly handle: SettlementHandle; readonly request: SettlementRequest } | undefined
  let dispatchConfirmed = false
  let dispatchedPosition: JsonNumber | undefined
  let openedPosition: JsonNumber | undefined
  let anchorsReported = false
  let anchoredStopped = false
  let interruptInitiator: 'user' | 'run_cancelled' | undefined
  let draining: Promise<void> | undefined
  const controlBorrows = new Set<Promise<void>>()
  let closePromise: ReturnType<AnchoredInvocationHandle['close']> | undefined
  const owner: SettlementOwner = {
    name: originalOwner.name,
    admission: () => originalOwner.admission(),
    acquire: originalOwner.acquire,
    opened: () =>
      openedTask !== undefined && ((!openedConfirmed && !openedKnownAbsent) || quarantined)
        ? { unknown: openedTask }
        : originalOwner.opened(),
    unresolvedWrites: () => [...originalOwner.unresolvedWrites(), ...unresolved],
  }
  const coordinator = (() => {
    try {
      return createSettlementCoordinator({ ...input.settlement, binding, owner })
    } catch (error) {
      registration.release()
      throw error
    }
  })()
  const engineering = anchoredDiagnostics(input)
  const diagnose = (kind: string) => {
    try {
      policy.diagnostic({ kind })
    } catch {
      /* isolated observer */
    }
  }
  const stop = () => {
    controller.abort()
    invocation?.abort()
    for (const task of tasks) {
      try {
        task.requestStop()
      } catch {
        diagnose('model_anchor.stop_port_failed')
      }
    }
  }
  input.signal.addEventListener('abort', stop, { once: true })
  if (input.signal.aborted) stop()
  const usable = () =>
    !controller.signal.aborted &&
    originalOwner.admission() === 'open' &&
    settlementGenerationCurrent(binding)
  function start<T>(
    kind: 'append' | 'wait',
    operation: (signal: AbortSignal) => Promise<T>,
  ): SettlementTask<T> {
    const task = registration.start(kind, operation)
    tasks.push(task)
    if (controller.signal.aborted) task.requestStop()
    return task
  }
  function drain(): Promise<void> {
    draining ??= (async () => {
      while (controlBorrows.size > 0) await Promise.race(controlBorrows)
      await Promise.all(tasks.map(task => task.stopped))
      if (!registrationReleased && unresolved.size === 0) {
        registration.release()
        registrationReleased = true
      }
    })()
    return draining
  }
  function borrowControl(): ReturnType<AnchoredInvocationHandle['borrowControl']> {
    if (
      registrationReleased ||
      closed ||
      quarantined ||
      (draining !== undefined && controlBorrows.size === 0)
    )
      return unavailable
    let finish: (() => void) | undefined
    const stopped = new Promise<void>(resolve => {
      finish = resolve
    })
    controlBorrows.add(stopped)
    let active = 0
    let closingBorrow = false
    let admissionBusy = false
    const liveTasks = new Set<SettlementTask<unknown>>()
    const complete = () => {
      if (closingBorrow && active === 0) {
        controlBorrows.delete(stopped)
        finish?.()
      }
    }
    const borrowedOwner: SettlementOwner = {
      name: owner.name,
      admission: owner.admission,
      opened: owner.opened,
      unresolvedWrites: owner.unresolvedWrites,
      // The original registration already holds the configured owner slot. Its control
      // tasks share that ownership; a second owner.acquire would deadlock at limit 1.
      acquire: _limit => {
        if (
          owner.admission() !== 'open' ||
          admissionBusy ||
          liveTasks.size !== 0 ||
          (closingBorrow && active === 0)
        )
          return unavailable
        admissionBusy = true
        active++
        let released = false
        const ownTasks = new Set<SettlementTask<unknown>>()
        return {
          registration: {
            start<T>(kind: SettlementTaskKind, operation: (signal: AbortSignal) => Promise<T>) {
              if (released) throw new TypeError('control borrow closed')
              const task = registration.start(kind, operation)
              tasks.push(task)
              ownTasks.add(task)
              liveTasks.add(task)
              task.stopped.then(
                () => {
                  ownTasks.delete(task)
                  liveTasks.delete(task)
                  if (liveTasks.size === 0) admissionBusy = false
                },
                () => undefined,
              )
              return task
            },
            release() {
              if (released || ownTasks.size !== 0)
                throw new TypeError('control borrow still active')
              released = true
              active--
              if (liveTasks.size === 0) admissionBusy = false
              complete()
            },
          },
        }
      },
    }
    return {
      owner: borrowedOwner,
      release: () => {
        closingBorrow = true
        complete()
      },
    }
  }
  function append(entry: OwnedLogEntry): SettlementTask<AppendResult> {
    const task = start('append', async (): Promise<AppendResult> => {
      if (!usable()) return { failure: 'invalidInput' }
      return binding.log.append(
        binding.session,
        [entry],
        input.run === undefined || input.attempt === undefined
          ? { kind: 'unfenced' }
          : { kind: 'fenced', run: input.run, attempt: input.attempt },
        { kind: 'unconditional' },
      )
    })
    unresolved.add(task)
    return task
  }
  async function receipt(task: SettlementTask<AppendResult>): Promise<AppendSuccess | undefined> {
    let raw: unknown
    try {
      raw = await task.completion
    } catch {
      quarantined = true
      return undefined
    }
    const result = settlementAppendReceipt(raw, 1)
    if (result === null) {
      quarantined = true
      return undefined
    }
    if ('failure' in result) {
      if (result.failure === 'unavailable' || result.failure === 'alreadyRecorded')
        quarantined = true
      else {
        await task.stopped
        unresolved.delete(task)
        if (task === openedTask) openedKnownAbsent = true
      }
      return undefined
    }
    unresolved.delete(task)
    return result
  }
  function recordAnchors(stage: 'reply_handoff' | 'settlement'): void {
    if (anchorsReported) return
    anchorsReported = true
    for (const [anchor, position] of [
      ['dispatched', dispatchedPosition],
      ['opened', openedPosition],
    ] as const) {
      if (position === undefined) continue
      engineering.record({
        source: 'runtime',
        stage,
        outcome: 'started',
        facts: { kind: 'progress', anchor, anchorId: ExactDecimal.from(position).toString() },
      })
    }
  }
  async function settleCandidate(
    disposition: ReplyDisposition | null,
    withoutReply = false,
  ): Promise<SettlementResult> {
    recordAnchors('settlement')
    if (
      (!construction && !interruption && heldSettlement === undefined) ||
      quarantined ||
      unresolved.size > 0
    )
      return { unavailable: true, reason: 'opened_unknown' }
    await drain()
    let original = heldSettlement?.request
    if (heldSettlement !== undefined) {
      const recognized = await coordinator.recognizeUnknown(heldSettlement.handle)
      if ('unavailable' in recognized) return { unavailable: true, reason: 'write_unknown' }
      if ('settled' in recognized) {
        heldSettlement = undefined
        settled = true
        return { settled: recognized.settled, origin: 'recognized' }
      }
      heldSettlement = undefined
    }
    if (original === undefined) {
      const candidate =
        interruption ??
        (construction === undefined
          ? { rejected: 'invalidInput' as const }
          : constructModelResponse(construction, disposition, withoutReply))
      if ('rejected' in candidate) return { unavailable: true, reason: 'candidate' }
      original = {
        target: {
          call: dispatched.call,
          dispatch: dispatched.dispatch,
          response: dispatched.response,
        },
        current: {
          messageId: withoutReply || !('reply' in candidate.response) ? null : input.messageId,
          disposition: withoutReply ? null : disposition,
        },
        response: candidate.response,
      }
    }
    const handle = coordinator.settle(original)
    const result = await handle.completion
    handle.requestStop()
    try {
      await handle.stopped
    } catch {
      heldSettlement = { handle, request: original }
      return { unavailable: true, reason: 'task' }
    }
    if ('unavailable' in result && result.reason === 'write_unknown')
      heldSettlement = { handle, request: original }
    if ('settled' in result) settled = true
    return result
  }
  const run = async (): Promise<AnchoredInvocationOutcome> => {
    try {
      if (!usable()) return { cancelledBeforeDispatch: true }
      const dispatchTask = append(prepared.ok)
      const dispatchReceipt = await receipt(dispatchTask)
      if (dispatchReceipt === undefined) return unavailable
      dispatchConfirmed = true
      dispatchedPosition = dispatchReceipt.positions[0]
      if (!usable()) {
        const candidate = constructAnchoredInterruption({
          dispatched,
          ...(input.run === undefined ? {} : { run: input.run, attempt: input.attempt }),
          planned,
          observed: null,
          sendState: 'not_sent',
          firstTokenAt: null,
          endedAt: policy.now(),
          initiator: interruptInitiator ?? 'run_cancelled',
        })
        if ('rejected' in candidate) return unavailable
        interruption = candidate
        const stoppedSettlement = await settleCandidate(null)
        return 'settled' in stoppedSettlement ? { settled: stoppedSettlement } : unavailable
      }
      const work = start('wait', async signal => {
        const cancel = () => controller.abort()
        signal.addEventListener('abort', cancel, { once: true })
        if (signal.aborted) cancel()
        try {
          if (!usable()) return { cancelledBeforeSend: true } as const
          const invocationEmitter = engineering.invocationEmitter
          invocation = invokeModel({
            ...requested,
            transport: {
              plan: async () => ({ planned }),
              projectOutput: transport.projectOutput,
              send: (...args) => transport.send(...args),
              read: transport.read,
            },
            credential: input.credential,
            policy,
            signal: controller.signal,
            beforeSend: usable,
            ...(input.onAccepted === undefined ? {} : { onAccepted: input.onAccepted }),
            ...(invocationEmitter === undefined
              ? {}
              : { diagnosticEmitterFactory: () => invocationEmitter }),
            beforeFirstContent: () =>
              start('wait', async () => {
                if (!usable()) throw new Error('model_anchor.stopped')
                const at = policy.now()
                if (!('ok' in compareRfc3339Instants(at, at))) throw new Error('model_anchor.clock')
                const value = captureModelLogValue({
                  category: 'record',
                  input: {
                    kind: 'value',
                    value: {
                      kind: 'model_call_opened',
                      call: dispatched.call,
                      dispatch: dispatched.dispatch,
                      firstTokenAt: at,
                    },
                  },
                })
                if ('invalidValue' in value) throw new Error('model_anchor.opened')
                const entry = prepareModelLogEntry({
                  session: binding.session,
                  shell: {
                    tenant: binding.tenant,
                    ...(input.run === undefined ? {} : { run: input.run, attempt: input.attempt }),
                  },
                  captured: value.ok,
                  purpose: { kind: 'record' },
                  messagePrefix: null,
                })
                if ('invalidValue' in entry) throw new Error('model_anchor.opened')
                openedTask = append(entry.ok)
                const openedReceipt = await receipt(openedTask)
                if (openedReceipt === undefined) throw new Error('model_anchor.unconfirmed')
                openedConfirmed = true
                openedPosition = openedReceipt.positions[0]
                firstTokenAt = at
                if (!usable()) {
                  quarantined = true
                  throw new Error('model_anchor.stopped')
                }
              }).completion,
          })
          return await invocation.outcome
        } finally {
          signal.removeEventListener('abort', cancel)
        }
      })
      const result = await work.completion
      if (openedTask !== undefined && !openedConfirmed && !openedKnownAbsent) quarantined = true
      if (quarantined) {
        diagnose('model_anchor.quarantined')
        return unavailable
      }
      if (!('outcome' in result)) {
        if (!('cancelledBeforeSend' in result)) return unavailable
        await work.stopped
        const original = invocation?.observedFacts()
        if (original !== undefined && !('facts' in original)) return unavailable
        if (original !== undefined && original.facts.sentAt !== undefined) return unavailable
        const originalFacts =
          original === undefined
            ? ({ observed: null, sendState: 'not_sent' } as const)
            : ({ observed: original.facts } as const)
        const candidate = constructAnchoredInterruption({
          dispatched,
          ...(input.run === undefined ? {} : { run: input.run, attempt: input.attempt }),
          planned,
          ...originalFacts,
          firstTokenAt: null,
          endedAt: policy.now(),
          initiator: interruptInitiator ?? 'run_cancelled',
        })
        if ('rejected' in candidate) return unavailable
        interruption = candidate
        const stoppedSettlement = await settleCandidate(null)
        return 'settled' in stoppedSettlement ? { settled: stoppedSettlement } : unavailable
      }
      recordAnchors('reply_handoff')
      if (!settlementGenerationCurrent(binding)) return unavailable
      construction = Object.freeze({
        dispatched,
        ...(input.run === undefined ? {} : { run: input.run, attempt: input.attempt }),
        result,
        messageId: input.messageId,
        firstTokenAt,
        projectOutput: (projection: OutputProjectionInput) =>
          transport.projectOutput(planned, projection),
        ...(interruptInitiator === undefined ? {} : { interruptInitiator }),
      })
      await drain()
      const reply = constructPendingModelResponse(construction)
      if ('pending' in reply) return { replyPending: reply.pending }
      if (result.ending !== undefined && result.outcome !== 'interrupted') return unavailable
      const resultSettlement = await settleCandidate(null)
      return 'settled' in resultSettlement ? { settled: resultSettlement } : unavailable
    } finally {
      // Unknown append may outlive invoke; close retains and awaits its actual stopped fact.
      try {
        if (!quarantined) {
          await drain()
          anchoredStopped = registrationReleased
        }
      } finally {
        engineering.close()
      }
    }
  }
  const outcome = run()
  return Object.freeze<AnchoredInvocationHandle>({
    outcome,
    snapshot: () => invocation?.snapshot() ?? { blocks: [], position: 0 },
    observedFacts(target) {
      if (
        !dispatchConfirmed ||
        !anchoredStopped ||
        quarantined ||
        target.call !== dispatched.call ||
        !modelLogJsonEqual(target.dispatch, dispatched.dispatch) ||
        target.response !== dispatched.response ||
        'unknown' in owner.opened() ||
        owner.unresolvedWrites().length !== 0
      )
        return { unavailable: true }
      if (invocation !== undefined) return invocation.observedFacts()
      return {
        facts: Object.freeze({
          usage: Object.freeze({
            input_tokens: 'unknown',
            output_tokens: 'unknown',
            cache_read_tokens: 'unknown',
            cache_write_tokens: 'unknown',
            source: 'none',
          }),
          cost: Object.freeze({ cost_usd: 'unknown', source: 'none' }),
          inputCalibration: Object.freeze({
            requestInput: { kind: 'unavailable', reason: 'send_unknown' },
            observedInput: { kind: 'unavailable', reason: 'send_unknown' },
            outputGroup: { kind: 'unavailable', reason: 'send_unknown' },
          } as const),
        }),
      }
    },
    abort: stop,
    interrupt(initiator) {
      if (initiator !== 'user' && initiator !== 'run_cancelled')
        throw new TypeError('invalid interrupt initiator')
      interruptInitiator ??= initiator
      stop()
    },
    borrowControl,
    async settleReply(disposition) {
      if (closed) return { unavailable: true, reason: 'closed' }
      const finished = await outcome
      if (!('replyPending' in finished)) return { unavailable: true, reason: 'candidate' }
      return settleCandidate(disposition)
    },
    finishReady() {
      if (closePromise) return closePromise
      const attempt = (async () => {
        const finished = await outcome
        if (!('replyPending' in finished) || quarantined || unresolved.size > 0) return unavailable
        closed = true
        await drain()
        if (quarantined || unresolved.size > 0) return unavailable
        input.signal.removeEventListener('abort', stop)
        await coordinator.close()
        if (!borrowedReleased) {
          await input.releaseBorrowed?.()
          borrowedReleased = true
        }
        return { released: true } as const
      })()
      closePromise = attempt
      void attempt.then(
        result => {
          if ('unavailable' in result && closePromise === attempt) closePromise = undefined
        },
        () => {
          if (closePromise === attempt) closePromise = undefined
        },
      )
      return attempt
    },
    close() {
      if (closePromise) return closePromise
      closed = true
      stop()
      const attempt = (async () => {
        await outcome
        await drain()
        if (!settled && construction && !quarantined) await settleCandidate(null, true)
        input.signal.removeEventListener('abort', stop)
        if (quarantined || unresolved.size > 0 || (dispatchConfirmed && !settled))
          return unavailable
        await coordinator.close()
        if (!borrowedReleased) {
          await input.releaseBorrowed?.()
          borrowedReleased = true
        }
        return { released: true } as const
      })()
      closePromise = attempt
      // An unavailable attempt retains the coordinator and borrowed references for a later retry.
      void attempt.then(
        result => {
          if ('unavailable' in result && closePromise === attempt) closePromise = undefined
        },
        () => {
          if (closePromise === attempt) closePromise = undefined
        },
      )
      return attempt
    },
  })
}

/** Own asynchronous planning before a durable dispatch exists; never release before its drain. */
export function createAnchoredModelInvocation<P extends PlannedSemantics, R>(
  input: AnchoredInvocationInput<P, R>,
): AnchoredInvocationHandle {
  if (!(input.signal instanceof AbortSignal))
    return terminalHandle({ rejected: 'invalidInput', reason: 'malformed' }, input.releaseBorrowed)
  const controller = new AbortController()
  const stop = () => controller.abort()
  input.signal.addEventListener('abort', stop, { once: true })
  if (input.signal.aborted) stop()
  // The async preparer captures and validates input synchronously before its first await.
  const captured = Object.freeze({ ...input, signal: controller.signal })
  let attached: AnchoredInvocationHandle | undefined
  let initiator: 'user' | 'run_cancelled' | undefined
  const ready = prepareAnchoredInvocation(captured).then(handle => {
    attached = handle
    if (initiator !== undefined) handle.interrupt(initiator)
    if (controller.signal.aborted) handle.abort()
    return handle
  })
  const outcome = ready.then(handle => handle.outcome)
  let closing: Promise<{ readonly released: true } | { readonly unavailable: true }> | undefined
  return Object.freeze<AnchoredInvocationHandle>({
    outcome,
    snapshot: () => attached?.snapshot() ?? { blocks: [], position: 0 },
    observedFacts: target => attached?.observedFacts(target) ?? { unavailable: true },
    abort() {
      stop()
      attached?.abort()
    },
    interrupt(value) {
      initiator ??= value
      stop()
      attached?.interrupt(value)
    },
    borrowControl: () => attached?.borrowControl() ?? unavailable,
    async settleReply(disposition) {
      return (await ready).settleReply(disposition)
    },
    finishReady() {
      closing ??= ready
        .then(handle => handle.finishReady())
        .then(result => {
          if ('unavailable' in result) closing = undefined
          else input.signal.removeEventListener('abort', stop)
          return result
        })
      return closing
    },
    close() {
      if (closing === undefined) {
        stop()
        attached?.abort()
      }
      closing ??= ready
        .then(handle => handle.close())
        .then(result => {
          if ('unavailable' in result) closing = undefined
          else input.signal.removeEventListener('abort', stop)
          return result
        })
      return closing
    },
  })
}
