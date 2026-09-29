import { createPlanReuseScopes, type PlanReuseScopes } from './plan-reuse-scopes.ts'
import { randomUUID } from 'node:crypto'
import { ExactDecimal, judgeAccountValue } from '@omne-harness-lite/call-accounts'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import {
  validate as contentShape,
  copyJsonValue,
  isJsonNumber,
  isNonNegativeJsonInteger,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import {
  judgeModelProfileDocument,
  validate as profileShape,
  type ModelProfile,
  type ModelProfileRef,
  type ModelProfileSnapshot,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import { winningRow, type ProfileRow } from '@omne-harness-lite/model-profile-directory'
import { validate as toolShape } from '@omne-harness-lite/tool-definition'
import { resolveCallTools } from './call-tools.ts'
import { drainDiagnosticThenable } from './invocation-diagnostics.ts'
import { operationDiagnostics } from './service-diagnostics.ts'
import { createCallContainer, createCallPreparationOwner } from './service-container.ts'
import {
  appendControlRecord,
  createOriginalSystemStop,
  OwnedAppendTracker,
  OwnedReadTracker,
  withOwnedReads,
} from './service-control.ts'
import { createSettlementCoordinator } from './settlement-coordinator.ts'
import { readSettlementPrefix, settlementGenerationCurrent } from './settlement-prefix.ts'
import { authorizedCalibration } from './service-calibration.ts'
import type { CallHistoryResult } from './call-history.ts'
import type {
  CallPreparationOwner,
  CallObserverBinding,
  ModelObserverRequest,
  OpenCallInput,
  OpenCallResult,
  RuntimeConstruction,
  ExactTransportLease,
  ServiceInvalidInput,
  SessionRuntimeBinding,
} from './service-types.ts'
import type { EffectiveModel } from './selection-types.ts'
import type { SettlementOwner, SettlementRegistration, SettlementTask } from './settlement-types.ts'
import type { AppendResult } from '@omne-harness-lite/session-log-jsonl'
import type { CallKey } from './service-types.ts'
import type { CurrentHistoryReaders } from './service-types.ts'
import type { SettlementLogBinding } from './settlement-types.ts'
import type { PlannedSemantics } from './types.ts'

function observeAcquireRefusal<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  session: SessionRuntimeBinding,
  callId: CallKey['callId'],
  outcome: 'rejected' | 'unavailable',
): void {
  try {
    const diagnostics = operationDiagnostics(
      runtime.diagnosticCollector,
      session.log.tenant,
      { executionId: randomUUID(), session: session.log.session, call: callId },
      () => runtime.policy.diagnostic({ kind: 'model_runtime.diagnostic_sink_failed' }),
    )
    diagnostics.record({
      source: 'runtime',
      stage: 'binding',
      outcome,
      facts: { kind: 'decision', cause: outcome === 'rejected' ? 'malformed' : 'dependency' },
    })
    diagnostics.close()
  } catch {
    // A failed observation never changes the provider's actual refusal.
  }
}

/** The verified openCall owner reports the actual exact lease, including its eventual release. */
function observeLease<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  session: SessionRuntimeBinding,
  callId: CallKey['callId'],
  profile: ModelProfileRef,
  lease: ExactTransportLease<P, R>,
): ExactTransportLease<P, R> {
  let reportEnabled = true
  const report = (): void => {
    if (!reportEnabled) return
    try {
      const result: unknown = runtime.policy.diagnostic({
        kind: 'model_runtime.diagnostic_sink_failed',
      })
      if (drainDiagnosticThenable(result)) reportEnabled = false
    } catch {
      reportEnabled = false
    }
  }
  let diagnostics: ReturnType<typeof operationDiagnostics> | undefined
  try {
    diagnostics = operationDiagnostics(
      runtime.diagnosticCollector,
      session.log.tenant,
      { executionId: randomUUID(), session: session.log.session, call: callId },
      report,
    )
    const binding = {
      profile: profile.routeName,
      implementation: lease.binding.implementation.name,
      implementationRevision: lease.binding.implementation.revision,
      modelId: lease.binding.definition.modelId,
      definitionRevision: lease.binding.definition.revision,
      configurationRevision: lease.binding.configuration.revision,
    }
    const owner = diagnostics
    const emit = (outcome: 'accepted' | 'completed' | 'failed'): void => {
      try {
        owner.record({
          source: 'runtime',
          stage: 'binding',
          outcome,
          facts: { kind: 'decision' },
          binding,
        })
      } catch {
        report()
      }
    }
    const close = (): void => {
      try {
        owner.close()
      } catch {
        report()
      }
    }
    emit('accepted')
    return {
      binding: lease.binding,
      transport: lease.transport,
      signal: lease.signal,
      track<T>(completion: Promise<T>): Promise<T> {
        return lease.track(completion)
      },
      release(): void {
        try {
          lease.release()
        } catch (error) {
          emit('failed')
          close()
          throw error
        }
        emit('completed')
        close()
      },
    }
  } catch {
    try {
      diagnostics?.close()
    } catch {
      report()
    }
    report()
    return lease
  }
}

function object(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function basis(value: unknown): value is EffectiveModel {
  if (!object(value) || Object.keys(value).length !== 4) return false
  return (
    typeof value.routeName === 'string' &&
    'ok' in
      judgeModelProfileDocument('ModelProfileRef', {
        origin: 'official',
        routeName: value.routeName,
      }) &&
    'ok' in judgeModelProfileDocument('ModelProfileRef', value.profile) &&
    object(value.profile) &&
    value.profile.routeName === value.routeName &&
    (value.selectedBy === 'session' || value.selectedBy === 'layer_lock') &&
    typeof value.selected === 'string' &&
    'ok' in
      judgeModelProfileDocument('ModelProfileRef', {
        origin: 'official',
        routeName: value.selected,
      })
  )
}

/** Capture request-owned JSON before asynchronous preparation; host/endpoint remain capability refs. */
export function ownOpenCallInput(
  input: OpenCallInput,
): { readonly request: OpenCallInput } | ServiceInvalidInput {
  if (
    input === null ||
    typeof input !== 'object' ||
    !('ok' in parseOpaqueIdentifier(input.session, 'SessionRef')) ||
    !('ok' in parseOpaqueIdentifier(input.creationKey, 'CreationKey')) ||
    (input.callId !== undefined && !('ok' in judgeAccountValue('ModelCallId', input.callId))) ||
    !(
      'ok' in
      judgeModelProfileDocument('ModelProfileRef', {
        origin: 'official',
        routeName: input.target,
      })
    ) ||
    (input.targetChangedBy !== undefined &&
      !contentShape('CapabilityId', input.targetChangedBy).valid) ||
    input.host === null ||
    typeof input.host !== 'object' ||
    !(input.host.signal instanceof AbortSignal) ||
    typeof input.host.stopping !== 'function' ||
    typeof input.host.register !== 'function' ||
    !Array.isArray(input.messages) ||
    !Array.isArray(input.tools)
  )
    return { invalidInput: { reason: 'malformed' } }
  const observer = input.observer
  if (observer !== undefined) {
    if (
      !object(observer) ||
      !('ok' in parseOpaqueIdentifier(observer.session, 'SessionRef')) ||
      !object(observer.endpoint) ||
      typeof observer.endpoint.open !== 'function' ||
      !isNonNegativeJsonInteger(observer.observer_max_buffered_events) ||
      ExactDecimal.from(observer.observer_max_buffered_events).compare(ExactDecimal.from(0)) <= 0 ||
      !isNonNegativeJsonInteger(observer.observer_max_buffered_bytes) ||
      ExactDecimal.from(observer.observer_max_buffered_bytes).compare(ExactDecimal.from(0)) <= 0
    )
      return { invalidInput: { reason: 'malformed' } }
    if (observer.session !== input.session)
      return { invalidInput: { reason: 'observer_scope_mismatch' } }
  }
  if (input.targetChangedBy === undefined && input.target !== input.basis?.routeName)
    return { invalidInput: { reason: 'malformed' } }
  if (
    (input.run === undefined) !== (input.attempt === undefined) ||
    (input.run === undefined) !== (input.report === undefined) ||
    (input.run !== undefined && !('ok' in judgeAccountValue('RunId', input.run))) ||
    (input.attempt !== undefined && !('ok' in judgeAccountValue('AttemptId', input.attempt)))
  )
    return { invalidInput: { reason: 'malformed' } }
  const clonedBasis = copyJsonValue(input.basis)
  if (!('ok' in clonedBasis) || !basis(clonedBasis.ok))
    return { invalidInput: { reason: 'malformed' } }
  const clonedParameters =
    input.parameters === undefined ? undefined : copyJsonValue(input.parameters)
  if (
    clonedParameters !== undefined &&
    (!('ok' in clonedParameters) ||
      !('ok' in judgeModelProfileDocument('ModelRequestParameters', clonedParameters.ok)))
  )
    return { invalidInput: { reason: 'malformed' } }
  const parameters =
    clonedParameters === undefined
      ? undefined
      : // The owned copy was checked against ModelRequestParameters immediately above.
        (clonedParameters.ok as ModelRequestParameters)
  const clonedReport = input.report === undefined ? undefined : copyJsonValue(input.report)
  if (clonedReport !== undefined && !('ok' in clonedReport))
    return { invalidInput: { reason: 'malformed' } }
  if (input.run !== undefined) {
    const report = clonedReport?.ok
    if (
      !object(report) ||
      report.session !== input.session ||
      report.runId !== input.run ||
      !isJsonNumber(report.attempt) ||
      !('ok' in judgeAccountValue('AttemptId', report.attempt)) ||
      input.attempt === undefined ||
      ExactDecimal.from(report.attempt).compare(ExactDecimal.from(input.attempt)) !== 0
    )
      return { invalidInput: { reason: 'malformed' } }
  }
  const messages: OpenCallInput['messages'][number][] = []
  const calls = new Map<string, number>()
  const results = new Map<string, number>()
  for (const item of input.messages) {
    const judged = judgeMessage(item)
    if ('rejected' in judged || judged.ok.type === 'tool_internal')
      return { invalidInput: { reason: 'malformed' } }
    messages.push(judged.ok)
    if (judged.ok.type === 'assistant')
      for (const block of judged.ok.blocks)
        if (block.kind === 'tool_call' && block.complete)
          calls.set(block.callId, (calls.get(block.callId) ?? 0) + 1)
    if (judged.ok.type === 'tool')
      results.set(judged.ok.callId, (results.get(judged.ok.callId) ?? 0) + 1)
  }
  if (
    [...calls].some(([id, count]) => count !== 1 || results.get(id) !== 1) ||
    [...results].some(([id, count]) => count !== 1 || calls.get(id) !== 1)
  )
    return { invalidInput: { reason: 'malformed' } }
  const tools: OpenCallInput['tools'][number][] = []
  for (const item of input.tools) {
    if (!toolShape('ModelToolName', item).valid || tools.includes(item))
      return { invalidInput: { reason: 'malformed' } }
    tools.push(item)
  }
  const common = {
    creationKey: input.creationKey,
    session: input.session,
    ...(input.callId === undefined ? {} : { callId: input.callId }),
    target: input.target,
    ...(input.targetChangedBy === undefined ? {} : { targetChangedBy: input.targetChangedBy }),
    basis: clonedBasis.ok,
    ...(parameters === undefined ? {} : { parameters }),
    messages: Object.freeze(messages),
    tools: Object.freeze(tools),
    host: input.host,
    ...(observer === undefined
      ? {}
      : {
          observer: Object.freeze({
            session: observer.session,
            endpoint: observer.endpoint,
            observer_max_buffered_events: observer.observer_max_buffered_events,
            observer_max_buffered_bytes: observer.observer_max_buffered_bytes,
          }),
        }),
  }
  const request: OpenCallInput =
    input.run === undefined
      ? Object.freeze(common)
      : Object.freeze({
          ...common,
          run: input.run,
          attempt: input.attempt,
          report: clonedReport?.ok,
        })
  return { request }
}

function snapshotOf(profile: ModelProfile): ModelProfileSnapshot | undefined {
  const candidate = {
    adaptation: profile.adaptation,
    providers: profile.providers,
    allowFallback: profile.allowFallback,
    inputModalities: profile.inputModalities,
    outputModalities: profile.outputModalities,
    maxInputTokens: profile.maxInputTokens,
    maxOutputTokens: profile.maxOutputTokens,
    inputConstraints: profile.inputConstraints,
    upstreamInputLimits: profile.upstreamInputLimits,
    ...(profile.parameters === undefined ? {} : { parameters: profile.parameters }),
    updatedAt: profile.updatedAt,
  }
  const copied = copyJsonValue(candidate)
  return 'ok' in copied && profileShape('ModelProfileSnapshot', copied.ok).valid
    ? (copied.ok as unknown as ModelProfileSnapshot)
    : undefined
}

function mergedParameters(
  profile: ModelProfile,
  override: ModelRequestParameters | undefined,
): { readonly parameters: ModelRequestParameters } | ServiceInvalidInput {
  const base = profile.parameters ?? {}
  const combined = {
    ...base,
    ...override,
    ...(base.extra === undefined && override?.extra === undefined
      ? {}
      : { extra: { ...base.extra, ...override?.extra } }),
  }
  const copied = copyJsonValue(combined)
  if (!('ok' in copied)) return { invalidInput: { reason: 'malformed' } }
  const judged = judgeModelProfileDocument('ModelRequestParameters', copied.ok)
  if ('rejected' in judged) return { invalidInput: { reason: judged.rejected } }
  const parameters = copied.ok as ModelRequestParameters
  if (
    parameters.maxOutputTokens !== undefined &&
    ExactDecimal.from(parameters.maxOutputTokens).compare(
      ExactDecimal.from(profile.maxOutputTokens),
    ) > 0
  )
    return { invalidInput: { reason: 'max_output_exceeds_profile' } }
  return { parameters }
}

function readRows(value: unknown): readonly ProfileRow[] | undefined {
  if (!Array.isArray(value)) return undefined
  const copied = copyJsonValue(value)
  if (!('ok' in copied) || !Array.isArray(copied.ok)) return undefined
  return copied.ok.every(
    item =>
      object(item) &&
      'ok' in judgeModelProfileDocument('ModelProfileRef', item.ref) &&
      'ok' in judgeModelProfileDocument('ModelProfile', item.profile),
  )
    ? (copied.ok as unknown as readonly ProfileRow[])
    : undefined
}

function sameObserverRequest(
  left: ModelObserverRequest | undefined,
  right: ModelObserverRequest | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right
  return (
    left.session === right.session &&
    left.endpoint === right.endpoint &&
    ExactDecimal.from(left.observer_max_buffered_events).compare(
      ExactDecimal.from(right.observer_max_buffered_events),
    ) === 0 &&
    ExactDecimal.from(left.observer_max_buffered_bytes).compare(
      ExactDecimal.from(right.observer_max_buffered_bytes),
    ) === 0
  )
}

interface UnknownAppend {
  readonly key: CallKey
  readonly binding: SettlementLogBinding
  readonly owner: SettlementOwner
  readonly registration: SettlementRegistration
  readonly task: SettlementTask<AppendResult>
  readonly readTasks: Set<SettlementTask<unknown>>
}

/** Unknown append receipts retain their original writer until it stops and a full prefix is read. */
export class UnknownAppendTracker {
  readonly #writes = new Set<UnknownAppend>()
  #closing: Promise<{ readonly released: true } | { readonly unavailable: true }> | undefined

  keep(
    key: CallKey,
    binding: SettlementLogBinding,
    owner: SettlementOwner,
    registration: SettlementRegistration,
    task: SettlementTask<AppendResult>,
  ): void {
    this.#writes.add({ key, binding, owner, registration, task, readTasks: new Set() })
  }

  close(input: {
    readonly concurrent: import('@omne-harness-lite/content-blocks').JsonNumber
    readonly call: CurrentHistoryReaders['call']
  }): Promise<{ readonly released: true } | { readonly unavailable: true }> {
    if (this.#closing !== undefined) return this.#closing
    const attempt = this.#closeOnce(input)
    this.#closing = attempt
    const finish = () => {
      if (this.#closing === attempt) this.#closing = undefined
    }
    void attempt.then(finish, finish)
    return attempt
  }

  async #closeOnce(input: {
    readonly concurrent: import('@omne-harness-lite/content-blocks').JsonNumber
    readonly call: CurrentHistoryReaders['call']
  }): Promise<{ readonly released: true } | { readonly unavailable: true }> {
    const writes = [...this.#writes]
    for (const write of writes) {
      try {
        write.task.requestStop()
      } catch {
        // The actual stopped promise remains authoritative.
      }
    }
    for (const write of writes) {
      try {
        await write.task.stopped
      } catch {
        continue
      }
      // The original writer still owns the only registration when concurrent=1.
      // Reuse it for recognition instead of waiting for a second owner grant.
      const priorReads = await Promise.allSettled([...write.readTasks].map(task => task.stopped))
      if (priorReads.some(result => result.status === 'rejected')) continue
      write.readTasks.clear()
      let read: Awaited<ReturnType<typeof readSettlementPrefix>>
      try {
        read = await readSettlementPrefix({
          binding: write.binding,
          registration: {
            start(kind, operation) {
              const task = write.registration.start(kind, operation)
              write.readTasks.add(task)
              return task
            },
            release: write.registration.release,
          },
        })
      } catch {
        continue
      }
      const stopped = await Promise.allSettled([...write.readTasks].map(task => task.stopped))
      if (stopped.some(result => result.status === 'rejected')) continue
      write.readTasks.clear()
      if ('unavailable' in read) continue
      let recognized: ReturnType<CurrentHistoryReaders['call']>
      try {
        recognized = input.call(read.prefix, write.key.callId)
      } catch {
        continue
      }
      if ('unavailable' in recognized) continue
      try {
        write.registration.release()
        this.#writes.delete(write)
      } catch {
        // A failed writer release remains owned for a later close attempt.
      }
    }
    return this.#writes.size === 0 ? { released: true } : { unavailable: true }
  }
}

export function boundSession(session: SessionRuntimeBinding, request: OpenCallInput): boolean {
  return (
    session.log.session === request.session &&
    session.selection.binding.session === request.session &&
    tenantIdEquals(session.log.tenant, session.selection.binding.tenant) &&
    session.log.generation === session.selection.binding.generation &&
    settlementGenerationCurrent(session.log)
  )
}

export interface ServiceCalls {
  readonly openCall: (input: OpenCallInput) => Promise<OpenCallResult>
  readonly close: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
}

/** RT7 S-28: bind a new noRun call without a durable open record. An already-dispatched
 * call's resume binding must come from its original MS6 record, never the latest catalog. */
export function createServiceCalls<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  borrowedScopes?: PlanReuseScopes,
): ServiceCalls {
  const scopes = borrowedScopes ?? createPlanReuseScopes(runtime)
  const retainedReads = new OwnedReadTracker()
  const appends = new OwnedAppendTracker()
  const unknownWrites = new UnknownAppendTracker()
  const preparations = new Set<CallPreparationOwner<P, R>>()
  const planningTasks = new Set<Promise<void>>()
  let closing = false
  async function historyFor(
    session: SessionRuntimeBinding,
    callId: NonNullable<OpenCallInput['callId']>,
  ): Promise<CallHistoryResult> {
    const read = await withOwnedReads(
      session.selection.owner,
      runtime.settlementContention.limits.concurrent,
      retainedReads,
      async registration => {
        const prefix = await readSettlementPrefix({ binding: session.log, registration })
        return 'unavailable' in prefix
          ? ({ unavailable: true, reason: 'prefix' } as const)
          : runtime.history.call(prefix.prefix, callId)
      },
    )
    return 'unavailable' in read ? { unavailable: true, reason: 'prefix' } : read.ok
  }
  function authorizeObserver(
    session: SessionRuntimeBinding,
    request: OpenCallInput,
    callId: NonNullable<OpenCallInput['callId']>,
  ):
    | { readonly observer: Omit<CallObserverBinding, 'queue'> }
    | ServiceInvalidInput
    | { readonly unavailable: true } {
    if (request.observer === undefined || session.observers === undefined)
      return { unavailable: true }
    try {
      const result = session.observers.authorize({
        request: request.observer,
        session: request.session,
        tenant: session.log.tenant,
        callId,
      })
      if (!('observer' in result)) return result
      if (
        result.observer === null ||
        typeof result.observer !== 'object' ||
        typeof result.observer.check !== 'function' ||
        typeof result.observer.open !== 'function' ||
        typeof result.observer.close !== 'function'
      )
        return { unavailable: true }
      return { observer: { request: request.observer, authorization: result.observer } }
    } catch {
      return { unavailable: true }
    }
  }
  const openCall = async (input: OpenCallInput): Promise<OpenCallResult> => {
    if (closing) return { runtimeStopped: true }
    const owned = ownOpenCallInput(input)
    if ('invalidInput' in owned) return owned
    const request = owned.request
    let callId = request.callId
    if (callId === undefined) {
      try {
        callId = runtime.identities.call()
      } catch {
        return { unavailable: true }
      }
      if (!('ok' in judgeAccountValue('ModelCallId', callId))) return { unavailable: true }
    }
    const key = { session: request.session, callId }
    const existing = request.callId === undefined ? undefined : runtime.calls.find(key)
    const prepared =
      existing === undefined ? createCallPreparationOwner<P, R>(request.host) : undefined
    if (prepared !== undefined && !('owner' in prepared)) return prepared
    const preparation = prepared?.owner
    if (preparation !== undefined) preparations.add(preparation)
    let preparationAttached = false
    let published = false
    const execute = async (): Promise<OpenCallResult> => {
      let bound: Awaited<ReturnType<RuntimeConstruction<P, R>['sessions']['bind']>>
      try {
        bound = await runtime.sessions.bind(request.session)
      } catch {
        return preparation?.stopping() ? { runtimeStopped: true } : { unavailable: true }
      }
      if (preparation?.stopping()) return { runtimeStopped: true }
      if ('failure' in bound)
        return bound.failure === 'invalidInput'
          ? { invalidInput: { reason: 'malformed' } }
          : { unavailable: true }
      const session = bound.binding
      if (!boundSession(session, request)) return { unavailable: true }
      if (session.selection.owner.admission() !== 'open') return { runtimeStopped: true }
      if (preparation?.stopping() || request.host.signal.aborted || request.host.stopping())
        return { runtimeStopped: true }
      let observer: Omit<CallObserverBinding, 'queue'> | undefined
      if (existing === undefined && request.observer !== undefined) {
        const authorized = authorizeObserver(session, request, callId)
        if (!('observer' in authorized)) return authorized
        if (preparation === undefined) return { unavailable: true }
        observer = {
          request: authorized.observer.request,
          authorization: preparation.retainObserver(authorized.observer.authorization),
        }
      }
      const gate = await runtime.calls.waitReserve(key, {
        policy: runtime.reservationWaitPolicy,
        scheduler: runtime.settlementScheduler,
        signal: preparation?.signal ?? request.host.signal,
      })
      if ('unavailable' in gate)
        return preparation?.stopping() || request.host.signal.aborted
          ? { runtimeStopped: true }
          : { unavailable: true }
      const reservation = gate.reservation
      try {
        if (closing) return { runtimeStopped: true }
        const local = reservation.view()
        if (request.callId !== undefined && local !== undefined) {
          if (preparation !== undefined) return { unavailable: true }
          if (
            local.session !== session ||
            local.request.session !== request.session ||
            local.request.host !== request.host
          )
            return { unavailable: true }
          const history = await historyFor(session, callId)
          if ('unavailable' in history) return { unavailable: true }
          if ('absent' in history) return { wrongPhase: { phase: 'open' } }
          if (history.known.phase !== 'resumable')
            return { wrongPhase: { phase: history.known.phase ?? 'in_flight' } }
          if (local.operation.phase !== 'ready') return { unavailable: true }
          const resolved = await resolveCallTools(request, session.tools)
          if ('failure' in resolved)
            return resolved.failure === 'unavailable'
              ? { unavailable: true }
              : { invalidInput: { reason: resolved.reason ?? 'malformed' } }
          if (local.observerReplacementPending) {
            const refreshed = await reservation.refreshObserverReplacement()
            if (!('ready' in refreshed)) return { unavailable: true }
          }
          if (!sameObserverRequest(local.observer?.request, request.observer)) {
            let next: Omit<CallObserverBinding, 'queue'> | undefined
            if (request.observer !== undefined) {
              const authorized = authorizeObserver(session, request, callId)
              if (!('observer' in authorized)) return authorized
              next = authorized.observer
            }
            // The container adopts a new authorization before closing old resources.
            const replaced = await reservation.replaceObserverBinding(next)
            if (!('replaced' in replaced)) return { unavailable: true }
          }
          if (closing) return { runtimeStopped: true }
          reservation.updateRequest(request)
          return { callId, state: 'resumable' }
        }
        if (local !== undefined) return { unavailable: true }
        if (existing !== undefined) return { unavailable: true }
        if (request.callId !== undefined) {
          const history = await historyFor(session, callId)
          if ('unavailable' in history) return { unavailable: true }
          if ('absent' in history) return { callNotFound: true }
          if (history.known.phase !== 'resumable')
            return { wrongPhase: { phase: history.known.phase ?? 'in_flight' } }
          const last = history.known.dispatches.at(-1)
          if (last === undefined) return { unavailable: true }
          const resolved = await resolveCallTools(request, session.tools)
          if ('failure' in resolved)
            return resolved.failure === 'unavailable'
              ? { unavailable: true }
              : { invalidInput: { reason: resolved.reason ?? 'malformed' } }
          const anchor = last.record
          if (
            anchor.adaptation.definition.modelId !== anchor.profile.routeName ||
            anchor.profileSnapshot.adaptation.definition.modelId !== anchor.profile.routeName
          )
            return { unavailable: true }
          const acquired = runtime.transport.acquire(anchor.adaptation, anchor.profile.routeName)
          if ('invalidInput' in acquired) {
            observeAcquireRefusal(runtime, session, callId, 'rejected')
            return acquired
          }
          if ('unavailable' in acquired) {
            observeAcquireRefusal(runtime, session, callId, 'unavailable')
            return { unavailable: true }
          }
          const lease = observeLease(runtime, session, callId, anchor.profile, acquired.lease)
          let transferred = false
          try {
            const coordinator = createSettlementCoordinator({
              binding: session.log,
              owner: session.selection.owner,
              run: runtime.history.run,
              settlementContention: runtime.settlementContention,
              settlementScheduler: runtime.settlementScheduler,
              diagnostic: event => runtime.policy.diagnostic(event),
            })
            const container = createCallContainer({
              key,
              session,
              request,
              systemStop: createOriginalSystemStop(
                runtime,
                key,
                (binding, originalOwner, registration, task) =>
                  unknownWrites.keep(key, binding, originalOwner, registration, task),
              ),
              ...(observer === undefined ? {} : { observer }),
              binding: {
                profile: anchor.profile,
                snapshot: anchor.profileSnapshot,
                parameters: anchor.parameters,
                selectedBy: anchor.selectedBy,
                lease,
              },
              owner: session.selection.owner,
              coordinator,
            })
            if (closing || preparation?.stopping()) return { runtimeStopped: true }
            preparation?.attach(container)
            preparationAttached = true
            transferred = true
            if (!runtime.calls.insert(reservation, container)) return { unavailable: true }
            published = true
            return { callId, state: 'resumable' }
          } finally {
            if (!transferred) lease.release()
          }
        }
        const resolved = await resolveCallTools(request, session.tools)
        if ('failure' in resolved)
          return resolved.failure === 'unavailable'
            ? { unavailable: true }
            : { invalidInput: { reason: resolved.reason ?? 'malformed' } }
        const owner = session.selection.owner
        const facts = await withOwnedReads(
          owner,
          runtime.settlementContention.limits.concurrent,
          retainedReads,
          async registration => {
            const holding = await registration.start(
              'read',
              async () => await session.selection.sessionTenancy.holdingTenant(request.session),
            ).completion
            if (!('tenant' in holding) || !tenantIdEquals(holding.tenant, session.log.tenant))
              return { unavailable: true } as const
            const rawRows = await registration.start(
              'read',
              async () => await session.catalog.listProfiles(holding.tenant),
            ).completion
            const rows = readRows(rawRows)
            if (rows === undefined) return { unavailable: true } as const
            const matching = rows.filter(row => row.ref.routeName === request.target)
            if (matching.length === 0) return { profileNotFound: true } as const
            const winner = winningRow(rows, request.target, [request.target])
            if (winner === undefined) return { undispatched: 'withdrawn' } as const
            const prefix = await readSettlementPrefix({ binding: session.log, registration })
            if ('unavailable' in prefix) return { unavailable: true } as const
            const projection = await registration.start(
              'read',
              async () => await session.selection.projection(prefix.prefix),
            ).completion
            if ('unknown' in projection) return { unavailable: true } as const
            const compatible = session.selection.compatible(winner.profile, projection.known)
            if ('invalidInput' in compatible || 'unavailable' in compatible)
              return { unavailable: true } as const
            if ('blocked' in compatible) return { undispatched: 'modality_mismatch' } as const
            const present = await registration.start(
              'read',
              async () =>
                await session.catalog.credentialPresent(session.log.tenant, winner.ref.origin),
            ).completion
            if ('failure' in present) return { unavailable: true } as const
            if (!present.present) return { undispatched: 'credential_unavailable' } as const
            const calibrated = authorizedCalibration(
              prefix.prefix,
              request.messages,
              {
                callId,
                dispatch: 1,
                ...(request.run === undefined
                  ? {}
                  : { run: request.run, attempt: request.attempt }),
              },
              runtime.history.calibration,
            )
            return 'unavailable' in calibrated
              ? ({ unavailable: true } as const)
              : ({
                  winner,
                  calibration: calibrated.calibration,
                  outputHistory: calibrated.outputHistory,
                } as const)
          },
        )
        if ('unavailable' in facts || 'unavailable' in facts.ok) return { unavailable: true }
        const checked = facts.ok
        if ('profileNotFound' in checked) return { profileNotFound: true }
        if ('undispatched' in checked) {
          if (closing) return { runtimeStopped: true }
          const written = await appendControlRecord({
            trackTask: task => appends.track(task),
            binding: session.log,
            owner,
            concurrent: runtime.settlementContention.limits.concurrent,
            ...(request.run === undefined ? {} : { run: request.run, attempt: request.attempt }),
            record: {
              kind: 'model_call_ended',
              call: callId,
              ending: 'undispatched',
              cause: checked.undispatched,
            },
            retainUnknown(registration, task) {
              unknownWrites.keep(key, session.log, owner, registration, task)
            },
          })
          return 'appended' in written
            ? { callId, state: 'handed_up', undispatched: checked.undispatched }
            : { unavailable: true }
        }
        const { winner } = checked
        const snapshot = snapshotOf(winner.profile)
        if (snapshot === undefined) return { unavailable: true }
        const merged = mergedParameters(winner.profile, request.parameters)
        if ('invalidInput' in merged) return merged
        if (snapshot.adaptation.definition.modelId !== request.target)
          return { invalidInput: { reason: 'malformed' } }
        const acquired = runtime.transport.acquire(snapshot.adaptation, request.target)
        if ('invalidInput' in acquired) {
          observeAcquireRefusal(runtime, session, callId, 'rejected')
          return acquired
        }
        if ('unavailable' in acquired) {
          observeAcquireRefusal(runtime, session, callId, 'unavailable')
          return { unavailable: true }
        }
        const lease = observeLease(runtime, session, callId, winner.ref, acquired.lease)
        let transferred = false
        try {
          const scoped = scopes.acquire(session.log)
          if ('unavailable' in scoped) return { unavailable: true }
          const scopeLease = scoped.lease
          let planning
          try {
            const completion = lease.transport.plan(
              {
                calibration: checked.calibration,
                outputHistory: checked.outputHistory,
                tokenMargin: runtime.tokenMargin,
                target: { kind: 'model_call', callId, dispatch: 1 },
                routeName: request.target,
                provider: snapshot.providers[0] ?? '',
                snapshot,
                parameters: merged.parameters,
                messages: request.messages,
                tools: resolved.tools,
              },
              {
                signal: AbortSignal.any([lease.signal, preparation?.signal ?? request.host.signal]),
                ...(scopeLease.reuseScope === undefined
                  ? {}
                  : { reuseScope: scopeLease.reuseScope }),
              },
            )
            try {
              planning = lease.track(completion)
            } catch (error) {
              // A broken tracker cannot shorten the actual provider task.
              planning = completion.then(
                () => {
                  throw error
                },
                () => {
                  throw error
                },
              )
            }
          } catch (error) {
            scopeLease.release()
            throw error
          }
          const stopped = planning.then(
            () => undefined,
            () => undefined,
          )
          planningTasks.add(stopped)
          preparation?.retainStopped(stopped)
          const planned = await planning.finally(() => {
            planningTasks.delete(stopped)
            scopeLease.release()
          })
          if (closing || preparation?.stopping() || request.host.signal.aborted)
            return { runtimeStopped: true }
          if ('rejected' in planned) {
            if (planned.rejected === 'unavailable') return { unavailable: true }
            if (planned.rejected === 'modality_not_carried') {
              if (closing) return { runtimeStopped: true }
              const written = await appendControlRecord({
                trackTask: task => appends.track(task),
                binding: session.log,
                owner,
                concurrent: runtime.settlementContention.limits.concurrent,
                ...(request.run === undefined
                  ? {}
                  : { run: request.run, attempt: request.attempt }),
                record: {
                  kind: 'model_call_ended',
                  call: callId,
                  ending: 'undispatched',
                  cause: 'modality_mismatch',
                },
                retainUnknown(registration, task) {
                  unknownWrites.keep(key, session.log, owner, registration, task)
                },
              })
              return 'appended' in written
                ? { callId, state: 'handed_up', undispatched: 'modality_mismatch' }
                : { unavailable: true }
            }
            if (planned.rejected === 'invalidInput') {
              if (
                planned.reason === 'input_limit_missing' ||
                planned.reason === 'input_size_unavailable'
              )
                return { invalidInput: { reason: planned.reason, metrics: planned.metrics } }
              if (planned.reason === 'input_limit_exceeded')
                return planned.basis === 'exact'
                  ? {
                      invalidInput: {
                        reason: planned.reason,
                        basis: 'exact',
                        metric: planned.metric,
                        actual: planned.actual,
                        limit: planned.limit,
                      },
                    }
                  : {
                      invalidInput: {
                        reason: planned.reason,
                        basis: 'estimated',
                        metric: planned.metric,
                        estimatedTokens: planned.estimatedTokens,
                        admissionTokens: planned.admissionTokens,
                        limit: planned.limit,
                      },
                    }
            }
            return {
              invalidInput: {
                reason: 'malformed',
              },
            }
          }
          const coordinator = createSettlementCoordinator({
            binding: session.log,
            owner,
            run: runtime.history.run,
            settlementContention: runtime.settlementContention,
            settlementScheduler: runtime.settlementScheduler,
            diagnostic: event => runtime.policy.diagnostic(event),
          })
          const container = createCallContainer({
            key,
            session,
            request: { ...request, callId },
            systemStop: createOriginalSystemStop(
              runtime,
              key,
              (binding, originalOwner, registration, task) =>
                unknownWrites.keep(key, binding, originalOwner, registration, task),
            ),
            ...(observer === undefined ? {} : { observer }),
            binding: {
              profile: winner.ref,
              snapshot,
              parameters: merged.parameters,
              selectedBy:
                request.targetChangedBy === undefined
                  ? request.basis.selectedBy
                  : { extension: capabilityCanonicalString(request.targetChangedBy) },
              lease,
            },
            owner,
            coordinator,
          })
          if (closing || preparation?.stopping()) return { runtimeStopped: true }
          preparation?.attach(container)
          preparationAttached = true
          transferred = true
          if (!runtime.calls.insert(reservation, container)) return { unavailable: true }
          published = true
          return { callId, state: 'open' }
        } finally {
          if (!transferred) lease.release()
        }
      } catch {
        return { unavailable: true }
      } finally {
        reservation.release()
      }
    }
    let result: OpenCallResult
    try {
      result = await execute()
    } catch {
      result = { unavailable: true }
    }
    if (preparation !== undefined && !published) {
      const cleaned = preparationAttached ? await preparation.close() : await preparation.discard()
      if ('unavailable' in cleaned) return { unavailable: true }
    }
    if (preparation !== undefined) preparations.delete(preparation)
    if (request.host.signal.aborted || request.host.stopping()) return { runtimeStopped: true }
    return result
  }
  const close = async () => {
    closing = true
    const [reads, appendResult, prepared] = await Promise.all([
      retainedReads.close(),
      appends.close(),
      Promise.all(
        [...preparations].map(async owner => {
          try {
            const result = await owner.close()
            if ('released' in result) preparations.delete(owner)
            return result
          } catch {
            return { unavailable: true } as const
          }
        }),
      ),
    ])
    await Promise.all([...planningTasks])
    const writes = await unknownWrites.close({
      concurrent: runtime.settlementContention.limits.concurrent,
      call: runtime.history.call,
    })
    return 'released' in reads &&
      'released' in appendResult &&
      'released' in writes &&
      prepared.every(result => 'released' in result) &&
      preparations.size === 0 &&
      (borrowedScopes !== undefined || 'released' in scopes.close())
      ? ({ released: true } as const)
      : ({ unavailable: true } as const)
  }
  return Object.freeze({ openCall, close })
}
