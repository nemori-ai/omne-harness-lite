import type {
  EffectiveModel,
  ModelObserverRequest,
  OpenCallInput,
  OpenCallResult,
  ServiceInvalidInput,
  PlanFailure,
  PlanResult,
  PreparedModelCreation,
} from '@omne-harness-lite/model-request-runtime'
import { retainRuntimeProjection, type ProjectedComponent } from './runtime-projection.ts'
import { createPlanReuseScopes, type PlanReuseScopes } from './plan-reuse-scopes.ts'
import { randomUUID } from 'node:crypto'
import { ExactDecimal, judgeAccountValue } from '@omne-harness-lite/call-accounts'
import {
  validate as contentShape,
  copyJsonValue,
  isJsonNumber,
  isNonNegativeJsonInteger,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  judgeMessage,
  judgeModelCallSemanticDigest,
  type ModelCallCreatedPayload,
} from '@omne-harness-lite/messages'
import { runtimeCustody, type AcknowledgementCustody } from './acknowledgement-custody.ts'
import {
  judgeModelProfileDocument,
  type ModelProfileRef,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import { validate as toolShape } from '@omne-harness-lite/tool-definition'
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
import {
  createModelCallCreationInput,
  readSettlementPrefix,
  settlementGenerationCurrent,
} from '@omne-harness-lite/model-request-runtime'
import {
  acknowledgedAsTerminal,
  type UnacknowledgedCallHistory,
} from '@omne-harness-lite/model-request-runtime'
import type { SessionRuntimeBinding } from '@omne-harness-lite/model-request-runtime'
import type {
  CallPreparationOwner,
  CallReservation,
  CreateCallContainerInput,
  CallObserverBinding,
  RuntimeConstruction,
  ExactTransportLease,
} from './service-types.ts'
import type {
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
} from '@omne-harness-lite/model-request-runtime'
import type { AppendResult } from '@omne-harness-lite/session-log'
import type { CallKey } from '@omne-harness-lite/messages'
import type { CurrentHistoryReaders } from '@omne-harness-lite/model-request-runtime'
import type { SettlementLogBinding } from '@omne-harness-lite/model-request-runtime'
import type { PlannedSemantics } from '@omne-harness-lite/model-request-runtime'
import type { AcknowledgedCallFacts } from '@omne-harness-lite/model-request-runtime'
import type { ModelCallPublishPermit } from './reference-types.ts'
import { requestStopAndWait } from '@omne-harness-lite/model-request-runtime'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import type { ModelCreationPublication } from '@omne-harness-lite/model-request-runtime'

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

function validOpenIdentity(input: OpenCallInput): boolean {
  return !(
    !('ok' in parseOpaqueIdentifier(input.session, 'SessionRef')) ||
    !('ok' in parseOpaqueIdentifier(input.creationKey, 'CreationKey')) ||
    (input.callId !== undefined && !('ok' in judgeAccountValue('ModelCallId', input.callId))) ||
    !(
      'ok' in
      judgeModelProfileDocument('ModelProfileRef', { origin: 'official', routeName: input.target })
    ) ||
    (input.targetChangedBy !== undefined &&
      !contentShape('CapabilityId', input.targetChangedBy).valid)
  )
}
function validOpenHost(input: OpenCallInput): boolean {
  return !(
    input.host === null ||
    typeof input.host !== 'object' ||
    !(input.host.signal instanceof AbortSignal) ||
    typeof input.host.stopping !== 'function' ||
    typeof input.host.register !== 'function' ||
    !Array.isArray(input.messages) ||
    !Array.isArray(input.tools)
  )
}
function validOpenObserver(observer: ModelObserverRequest): boolean {
  return !(
    !object(observer) ||
    !('ok' in parseOpaqueIdentifier(observer.session, 'SessionRef')) ||
    !object(observer.endpoint) ||
    typeof observer.endpoint.open !== 'function' ||
    !isNonNegativeJsonInteger(observer.observer_max_buffered_events) ||
    ExactDecimal.from(observer.observer_max_buffered_events).compare(ExactDecimal.from(0)) <= 0 ||
    !isNonNegativeJsonInteger(observer.observer_max_buffered_bytes) ||
    ExactDecimal.from(observer.observer_max_buffered_bytes).compare(ExactDecimal.from(0)) <= 0
  )
}
function inspectOpenObserver(
  input: OpenCallInput,
): { readonly observer: ModelObserverRequest | undefined } | ServiceInvalidInput {
  const observer = input.observer
  if (observer !== undefined) {
    if (!validOpenObserver(observer)) return { invalidInput: { reason: 'malformed' } }
    if (observer.session !== input.session)
      return { invalidInput: { reason: 'observer_scope_mismatch' } }
  }
  return { observer }
}
function validOpenRun(input: OpenCallInput): boolean {
  return !(
    (input.run === undefined) !== (input.attempt === undefined) ||
    (input.run === undefined) !== (input.report === undefined) ||
    (input.run !== undefined && !('ok' in judgeAccountValue('RunId', input.run))) ||
    (input.attempt !== undefined && !('ok' in judgeAccountValue('AttemptId', input.attempt)))
  )
}
function validOpenAssociation(input: OpenCallInput): boolean {
  if (input.targetChangedBy === undefined && input.target !== input.basis?.routeName) return false
  return validOpenRun(input)
}
function ownOpenParameters(
  input: OpenCallInput,
): { readonly parameters: ModelRequestParameters | undefined } | ServiceInvalidInput {
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
  return { parameters }
}
function validOpenReport(input: OpenCallInput, report: JsonValue | undefined): boolean {
  return !(
    !object(report) ||
    report.session !== input.session ||
    report.runId !== input.run ||
    !isJsonNumber(report.attempt) ||
    !('ok' in judgeAccountValue('AttemptId', report.attempt)) ||
    input.attempt === undefined ||
    ExactDecimal.from(report.attempt).compare(ExactDecimal.from(input.attempt)) !== 0
  )
}
function ownOpenReport(
  input: OpenCallInput,
): { readonly report: JsonValue | undefined } | ServiceInvalidInput {
  const clonedReport = input.report === undefined ? undefined : copyJsonValue(input.report)
  if (clonedReport !== undefined && !('ok' in clonedReport))
    return { invalidInput: { reason: 'malformed' } }
  if (input.run !== undefined) {
    const report = clonedReport?.ok
    if (!validOpenReport(input, report)) return { invalidInput: { reason: 'malformed' } }
  }
  return { report: clonedReport?.ok }
}
interface CapturedOpenJson {
  readonly basis: EffectiveModel
  readonly parameters: ModelRequestParameters | undefined
  readonly report: JsonValue | undefined
}
function ownOpenJson(input: OpenCallInput): CapturedOpenJson | ServiceInvalidInput {
  const clonedBasis = copyJsonValue(input.basis)
  if (!('ok' in clonedBasis) || !basis(clonedBasis.ok))
    return { invalidInput: { reason: 'malformed' } }
  const parameters = ownOpenParameters(input)
  if ('invalidInput' in parameters) return parameters
  const report = ownOpenReport(input)
  if ('invalidInput' in report) return report
  return { basis: clonedBasis.ok, parameters: parameters.parameters, report: report.report }
}
function indexOpenMessagePairs(
  message: OpenCallInput['messages'][number],
  calls: Map<string, number>,
  results: Map<string, number>,
): void {
  if (message.type === 'assistant')
    for (const block of message.blocks)
      if (block.kind === 'tool_call' && block.complete)
        calls.set(block.callId, (calls.get(block.callId) ?? 0) + 1)
  if (message.type === 'tool') results.set(message.callId, (results.get(message.callId) ?? 0) + 1)
}
function ownOpenMessages(input: OpenCallInput): OpenCallInput['messages'][number][] | undefined {
  const messages: OpenCallInput['messages'][number][] = []
  const calls = new Map<string, number>(),
    results = new Map<string, number>()
  for (const item of input.messages) {
    const judged = judgeMessage(item)
    if ('rejected' in judged || judged.ok.type === 'tool_internal') return undefined
    messages.push(judged.ok)
    indexOpenMessagePairs(judged.ok, calls, results)
  }
  if (
    [...calls].some(([id, count]) => count !== 1 || results.get(id) !== 1) ||
    [...results].some(([id, count]) => count !== 1 || calls.get(id) !== 1)
  )
    return undefined
  return messages
}
function ownOpenTools(input: OpenCallInput): OpenCallInput['tools'][number][] | undefined {
  const tools: OpenCallInput['tools'][number][] = []
  for (const item of input.tools) {
    if (!toolShape('ModelToolName', item).valid || tools.includes(item)) return undefined
    tools.push(item)
  }
  return tools
}
function projectOpenRequest(
  input: OpenCallInput,
  json: CapturedOpenJson,
  observer: ModelObserverRequest | undefined,
  messages: OpenCallInput['messages'][number][],
  tools: OpenCallInput['tools'][number][],
): OpenCallInput {
  const common = {
    creationKey: input.creationKey,
    session: input.session,
    ...(input.callId === undefined ? {} : { callId: input.callId }),
    target: input.target,
    ...(input.targetChangedBy === undefined ? {} : { targetChangedBy: input.targetChangedBy }),
    basis: json.basis,
    ...(json.parameters === undefined ? {} : { parameters: json.parameters }),
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
      : Object.freeze({ ...common, run: input.run, attempt: input.attempt, report: json.report })
  return request
}
function captureOpenRequest(
  input: OpenCallInput,
  observer: ModelObserverRequest | undefined,
): { readonly request: OpenCallInput } | ServiceInvalidInput {
  const json = ownOpenJson(input)
  if ('invalidInput' in json) return json
  const messages = ownOpenMessages(input)
  if (messages === undefined) return { invalidInput: { reason: 'malformed' } }
  const tools = ownOpenTools(input)
  if (tools === undefined) return { invalidInput: { reason: 'malformed' } }
  return { request: projectOpenRequest(input, json, observer, messages, tools) }
}

/** Capture request-owned JSON before asynchronous preparation; host/endpoint remain capability refs. */
export function ownOpenCallInput(
  input: OpenCallInput,
): { readonly request: OpenCallInput } | ServiceInvalidInput {
  if (
    input === null ||
    typeof input !== 'object' ||
    !validOpenIdentity(input) ||
    !validOpenHost(input)
  )
    return { invalidInput: { reason: 'malformed' } }
  const inspected = inspectOpenObserver(input)
  if ('invalidInput' in inspected) return inspected
  if (!validOpenAssociation(input)) return { invalidInput: { reason: 'malformed' } }
  return captureOpenRequest(input, inspected.observer)
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
  readonly call: CurrentHistoryReaders['call']
  /** RT12 S-98: a content publish permit held until this original batch is recognized. */
  readonly permit?: ModelCallPublishPermit
}

function requestUnknownWriteStops(writes: readonly UnknownAppend[]): void {
  for (const write of writes) {
    try {
      write.task.requestStop()
    } catch {
      // The actual stopped promise remains authoritative.
    }
  }
}

function recognizedUnknownCall(
  write: UnknownAppend,
  prefix: Parameters<CurrentHistoryReaders['call']>[0],
): boolean {
  let recognized: ReturnType<CurrentHistoryReaders['call']>
  try {
    recognized = write.call(prefix, write.key.callId)
  } catch {
    return false
  }
  return !('unavailable' in recognized)
}

function releaseUnknownWrite(write: UnknownAppend, retained: Set<UnknownAppend>): void {
  try {
    write.registration.release()
    retained.delete(write)
  } catch {
    // A failed writer release remains owned for a later close attempt.
  }
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
    call: CurrentHistoryReaders['call'],
    permit?: ModelCallPublishPermit,
  ): void {
    this.#writes.add({
      key,
      binding,
      owner,
      registration,
      task,
      call,
      readTasks: new Set(),
      ...(permit === undefined ? {} : { permit }),
    })
  }

  close(): Promise<{ readonly released: true } | { readonly unavailable: true }> {
    if (this.#closing !== undefined) return this.#closing
    const attempt = this.#closeOnce()
    this.#closing = attempt
    const finish = () => {
      if (this.#closing === attempt) this.#closing = undefined
    }
    void attempt.then(finish, finish)
    return attempt
  }

  async #closeOnce(): Promise<{ readonly released: true } | { readonly unavailable: true }> {
    const writes = [...this.#writes]
    requestUnknownWriteStops(writes)
    for (const write of writes) {
      try {
        await write.task.stopped
      } catch {
        continue
      }
      // The original writer still owns the only registration when concurrent=1.
      // Reuse it for recognition instead of waiting for a second owner grant.
      const priorReads = await Promise.allSettled([...write.readTasks].map(requestStopAndWait))
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
      const stopped = await Promise.allSettled([...write.readTasks].map(requestStopAndWait))
      if (stopped.some(result => result.status === 'rejected')) continue
      write.readTasks.clear()
      if ('unavailable' in read) continue
      if (!recognizedUnknownCall(write, read.prefix)) continue
      // The original batch is now determined and its writer stopped: its content permit ends.
      if (write.permit !== undefined && !('released' in (await write.permit.release()))) continue
      releaseUnknownWrite(write, this.#writes)
    }
    return this.#writes.size === 0 ? { released: true } : { unavailable: true }
  }
}

function creationValueOf(request: OpenCallInput, session: SessionRuntimeBinding) {
  return {
    origin: {
      tenant: session.log.tenant,
      session: session.log.session,
      ...(request.run === undefined ? {} : { run: request.run, attempt: request.attempt }),
    },
    input: createModelCallCreationInput(request, session.sourceVersions),
  }
}

interface CreationAttempt {
  readonly binding: SessionRuntimeBinding
  readonly value: JsonValue
  busy: boolean
  publication?: ModelCreationPublication
}

function sameCreationAssociation(
  origin: ModelCallCreatedPayload['origin'],
  session: SessionRuntimeBinding,
  request: OpenCallInput,
): boolean {
  return (
    origin.session === session.log.session &&
    tenantIdEquals(origin.tenant, session.log.tenant) &&
    origin.run === request.run &&
    (origin.attempt === undefined) === (request.attempt === undefined) &&
    (origin.attempt === undefined ||
      request.attempt === undefined ||
      ExactDecimal.from(origin.attempt).compare(ExactDecimal.from(request.attempt)) === 0)
  )
}

function matchesPreparedCreation(
  prepared: PreparedModelCreation,
  key: CallKey,
  session: SessionRuntimeBinding,
  request: OpenCallInput,
): boolean {
  const content = prepared.content
  return (
    modelLogJsonEqual(content.ref, key) &&
    content.creationKey === request.creationKey &&
    sameCreationAssociation(content.origin, session, request) &&
    modelLogJsonEqual(content.input, createModelCallCreationInput(request, session.sourceVersions))
  )
}

/** S-85/S-101: only authoritative absence permits a new creation and adoption. */
async function recognizeCreation<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  custody: AcknowledgementCustody | undefined,
  session: SessionRuntimeBinding,
  request: OpenCallInput,
): Promise<OpenCallResult | undefined> {
  let found: Awaited<ReturnType<typeof runtime.callFacts.creation>>
  try {
    found = await runtime.callFacts.creation({
      binding: session.log,
      creationKey: request.creationKey,
    })
  } catch {
    return { unavailable: true }
  }
  if ('callNotFound' in found) return undefined
  if ('unavailable' in found) return found
  if ('payload' in found) {
    const { payload, view } = found
    if (
      !sameCreationAssociation(payload.origin, session, request) ||
      !modelLogJsonEqual(
        payload.input,
        createModelCallCreationInput(request, session.sourceVersions),
      )
    )
      return { creationConflict: true }
    return { ref: view.ref, callId: view.ref.callId, state: view.state }
  }
  return await recognizeAcknowledgedCreation(custody, session, request, found.acknowledged)
}

/** S-101: released creation content is replaced by the original ACK digest, never re-adopted. */
async function recognizeAcknowledgedCreation(
  custody: AcknowledgementCustody | undefined,
  session: SessionRuntimeBinding,
  request: OpenCallInput,
  facts: AcknowledgedCallFacts,
): Promise<OpenCallResult> {
  const sameAssociation =
    facts.ref.session === request.session && sameCreationAssociation(facts.origin, session, request)
  const digest = judgeModelCallSemanticDigest(
    'model-call-creation-semantic-sha256/v1',
    createModelCallCreationInput(request, session.sourceVersions),
    facts.record.creationInput,
  )
  // A differing value is a conflict and discloses nothing of the original.
  if (!sameAssociation || !('ok' in digest)) return { creationConflict: true }
  if (custody === undefined) return { unavailable: true }
  const view = await custody.view(session.log, facts)
  if ('unavailable' in view) return { unavailable: true }
  return { ref: facts.ref, callId: facts.ref.callId, acknowledged: view }
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
  readonly closeAdmission: () => void
  readonly close: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
}

/** RT7 S-28: bind a new noRun call without a durable open record. An already-dispatched
 * call's resume binding must come from its original MS6 record, never the latest catalog. */
export function createServiceCalls<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  borrowedScopes?: PlanReuseScopes,
  sharedCustody?: AcknowledgementCustody,
): ProjectedComponent<ServiceCalls, RuntimeConstruction<P, R>> {
  return buildServiceCalls(runtime, borrowedScopes, sharedCustody)
}

class ServiceCallsState<P extends PlannedSemantics, R> {
  readonly retainedReads = new OwnedReadTracker()
  readonly appends = new OwnedAppendTracker()
  readonly unknownWrites = new UnknownAppendTracker()
  readonly preparations = new Set<CallPreparationOwner<P, R>>()
  readonly planningTasks = new Set<Promise<void>>()
  readonly creations = new Map<string, CreationAttempt>()
  closing = false
  admissionClosed = false
}

function buildServiceCalls<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  borrowedScopes?: PlanReuseScopes,
  sharedCustody?: AcknowledgementCustody,
  physical: ServiceCallsState<P, R> = new ServiceCallsState<P, R>(),
): ProjectedComponent<ServiceCalls, RuntimeConstruction<P, R>> {
  const ownCustody = sharedCustody === undefined ? runtimeCustody(runtime) : undefined
  const custody = sharedCustody ?? ownCustody
  const scopes = borrowedScopes ?? createPlanReuseScopes(runtime)

  async function historyFor(
    session: SessionRuntimeBinding,
    callId: NonNullable<OpenCallInput['callId']>,
  ): Promise<UnacknowledgedCallHistory> {
    const read = await withOwnedReads(
      session.selection.owner,
      runtime.settlementContention.limits.concurrent,
      physical.retainedReads,
      async registration => {
        const history = await runtime.requestPreparation.readCall({
          binding: session.log,
          registration,
          callId,
          interpret: runtime.history.call.bind(runtime.history),
        })
        // RT12 S-100: an acknowledged call is terminal, never resumable (wrongPhase).
        return acknowledgedAsTerminal(history)
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
    if (physical.closing) return { runtimeStopped: true }
    const owned = ownOpenCallInput(input)
    if ('invalidInput' in owned) return owned
    const request = owned.request
    const existing =
      request.callId === undefined
        ? undefined
        : runtime.calls.find({ session: request.session, callId: request.callId })
    const prepared = prepareCallOwner()
    if (!('preparation' in prepared)) return prepared
    const preparation = prepared.preparation
    let preparationAttached = false
    let published = false
    let creation: CreationAttempt | undefined
    let creationSlot: string | undefined
    let creationSession: SessionRuntimeBinding | undefined
    function prepareCallOwner():
      { preparation: CallPreparationOwner<P, R> | undefined } | OpenCallResult {
      const prepared =
        existing === undefined ? createCallPreparationOwner<P, R>(request.host) : undefined
      if (prepared !== undefined && !('owner' in prepared)) return prepared
      const preparation = prepared?.owner
      if (preparation !== undefined) physical.preparations.add(preparation)
      return { preparation }
    }
    type Bound = Awaited<ReturnType<RuntimeConstruction<P, R>['sessions']['bind']>>
    type Reservation = CallReservation<P, R>
    type Local = NonNullable<ReturnType<Reservation['view']>>
    type ToolResult = Awaited<
      ReturnType<RuntimeConstruction<P, R>['requestPreparation']['resolveTools']>
    >
    type ReservedInput = {
      key: CallKey
      callId: CallKey['callId']
      observer: Omit<CallObserverBinding, 'queue'> | undefined
    }
    type RecognitionDecision = { kind: 'continue' } | { kind: 'return'; result: OpenCallResult }
    type ReservationRoute =
      | { kind: 'local'; local: Local }
      | { kind: 'persisted' }
      | { kind: 'fresh' }
      | { kind: 'refused' }
    function judgeBoundSession(bound: Bound): { session: SessionRuntimeBinding } | OpenCallResult {
      if (preparation?.stopping()) return { runtimeStopped: true }
      if ('failure' in bound)
        return bound.failure === 'invalidInput'
          ? { invalidInput: { reason: 'malformed' } }
          : { unavailable: true }
      const session = bound.binding
      if (!boundSession(session, request)) return { unavailable: true }
      if (session.selection.owner.admission() !== 'open') return { runtimeStopped: true }
      return { session }
    }
    function claimCreation(
      session: SessionRuntimeBinding,
    ): { attempt: CreationAttempt } | OpenCallResult {
      creationSession = session
      const slot = JSON.stringify([
        session.log.tenant.organization,
        session.log.tenant.account,
        session.log.session,
        request.creationKey,
      ])
      const prior = physical.creations.get(slot)
      if (prior?.busy) return { unavailable: true }
      const value = creationValueOf(request, session)
      if (prior !== undefined && !modelLogJsonEqual(prior.value, value))
        return { creationConflict: true }
      if (prior !== undefined && prior.binding.log.generation !== session.log.generation)
        return { unavailable: true }
      const copied = copyJsonValue(value)
      if (!('ok' in copied)) return { unavailable: true }
      creation = prior ?? { binding: session, value: copied.ok, busy: false }
      creationSlot = slot
      creation.busy = true
      physical.creations.set(slot, creation)
      return { attempt: creation }
    }
    function judgeRecognitionEligibility(
      session: SessionRuntimeBinding,
    ): OpenCallResult | undefined {
      if (
        physical.closing ||
        preparation?.stopping() ||
        request.host.signal.aborted ||
        request.host.stopping()
      )
        return { runtimeStopped: true }
      if (!boundSession(session, request)) return { unavailable: true }
      if (session.selection.owner.admission() !== 'open') return { runtimeStopped: true }
    }
    function publicationRetryAllowed(session: SessionRuntimeBinding): boolean {
      return (
        !physical.closing &&
        !preparation?.stopping() &&
        !request.host.signal.aborted &&
        !request.host.stopping() &&
        boundSession(session, request)
      )
    }
    async function recognizeAttempt(session: SessionRuntimeBinding): Promise<RecognitionDecision> {
      const claimed = claimCreation(session)
      if (!('attempt' in claimed)) return { kind: 'return', result: claimed }
      const attempt = claimed.attempt
      // Unknown ownership precedes even a visible marker: completion is not actual stop.
      if (attempt.publication !== undefined) {
        const recovered = await attempt.publication.retry(() => publicationRetryAllowed(session))
        if (!('published' in recovered)) return { kind: 'return', result: { unavailable: true } }
      }
      const recognized = await recognizeCreation(runtime, custody, session, request)
      const refused = judgeRecognitionEligibility(session)
      if (refused !== undefined) return { kind: 'return', result: refused }
      if (recognized !== undefined) {
        if (!('unavailable' in recognized)) delete attempt.publication
        return { kind: 'return', result: recognized }
      }
      if (attempt.publication !== undefined)
        return { kind: 'return', result: { unavailable: true } }
      if (physical.admissionClosed) return { kind: 'return', result: { runtimeStopped: true } }
      return { kind: 'continue' }
    }
    function reservationStopped(): boolean {
      return (
        preparation?.stopping() === true || request.host.signal.aborted || request.host.stopping()
      )
    }
    function reservationInput(session: SessionRuntimeBinding): ReservedInput | OpenCallResult {
      if (reservationStopped()) return { runtimeStopped: true }
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
      return { key, callId, observer }
    }
    function reservationRoute(local: Local | undefined): ReservationRoute {
      if (request.callId !== undefined && local !== undefined) return { kind: 'local', local }
      if (local !== undefined) return { kind: 'refused' }
      if (existing !== undefined) return { kind: 'refused' }
      return request.callId !== undefined ? { kind: 'persisted' } : { kind: 'fresh' }
    }
    function toolRefusal(resolved: Extract<ToolResult, { failure: unknown }>): OpenCallResult {
      return resolved.failure === 'unavailable'
        ? { unavailable: true }
        : { invalidInput: { reason: resolved.reason ?? 'malformed' } }
    }
    function judgeLocalIdentity(
      session: SessionRuntimeBinding,
      local: Local,
    ): OpenCallResult | undefined {
      if (preparation !== undefined) return { unavailable: true }
      if (
        local.session !== session ||
        local.request.session !== request.session ||
        local.request.host !== request.host
      )
        return { unavailable: true }
    }
    function judgeLocalHistory(
      history: UnacknowledgedCallHistory,
      local: Local,
    ): OpenCallResult | undefined {
      if ('unavailable' in history) return { unavailable: true }
      if (physical.admissionClosed) return { runtimeStopped: true }
      if ('absent' in history) return { wrongPhase: { phase: 'open' } }
      if (history.known.phase !== 'resumable')
        return { wrongPhase: { phase: history.known.phase ?? 'in_flight' } }
      if (local.operation.phase !== 'ready') return { unavailable: true }
    }
    function replacementAuthorization(
      session: SessionRuntimeBinding,
      callId: CallKey['callId'],
    ): { observer: Omit<CallObserverBinding, 'queue'> | undefined } | OpenCallResult {
      let next: Omit<CallObserverBinding, 'queue'> | undefined
      if (request.observer !== undefined) {
        const authorized = authorizeObserver(session, request, callId)
        if (!('observer' in authorized)) return authorized
        next = authorized.observer
      }
      return { observer: next }
    }
    async function reopenLocal(
      session: SessionRuntimeBinding,
      input: ReservedInput,
      reservation: Reservation,
      local: Local,
    ): Promise<OpenCallResult> {
      const { key, callId } = input
      const identityFailure = judgeLocalIdentity(session, local)
      if (identityFailure !== undefined) return identityFailure
      const history = await historyFor(session, callId)
      const historyFailure = judgeLocalHistory(history, local)
      if (historyFailure !== undefined) return historyFailure
      const resolved = await runtime.requestPreparation.resolveTools(request, session.tools)
      if ('failure' in resolved) return toolRefusal(resolved)
      if (local.observerReplacementPending) {
        const refreshed = await reservation.refreshObserverReplacement()
        if (!('ready' in refreshed)) return { unavailable: true }
      }
      if (!sameObserverRequest(local.observer?.request, request.observer)) {
        const authorized = replacementAuthorization(session, callId)
        if (!('observer' in authorized)) return authorized
        const next = authorized.observer
        // The container adopts a new authorization before closing old resources.
        const replaced = await reservation.replaceObserverBinding(next)
        if (!('replaced' in replaced)) return { unavailable: true }
      }
      if (physical.closing) return { runtimeStopped: true }
      reservation.updateRequest(request)
      return { ref: key, callId, state: 'resumable' }
    }
    function judgePersistedHistory(history: UnacknowledgedCallHistory) {
      if ('unavailable' in history) return { unavailable: true } as const
      if ('absent' in history) return { callNotFound: true } as const
      if (physical.admissionClosed) return { runtimeStopped: true } as const
      if (history.known.phase !== 'resumable')
        return { wrongPhase: { phase: history.known.phase ?? 'in_flight' } } as const
      const last = history.known.dispatches.at(-1)
      if (last === undefined) return { unavailable: true } as const
      return { anchor: last.record } as const
    }
    function validPersistedAnchor(
      anchor: Extract<ReturnType<typeof judgePersistedHistory>, { anchor: unknown }>['anchor'],
    ): boolean {
      if (
        anchor.adaptation.definition.modelId !== anchor.profile.routeName ||
        anchor.profileSnapshot.adaptation.definition.modelId !== anchor.profile.routeName
      )
        return false
      return true
    }
    function acquireObservedLease(
      session: SessionRuntimeBinding,
      callId: CallKey['callId'],
      profile: ModelProfileRef,
      binding: Parameters<RuntimeConstruction<P, R>['transport']['acquire']>,
    ): { lease: ExactTransportLease<P, R> } | OpenCallResult {
      const acquired = runtime.transport.acquire(...binding)
      if ('invalidInput' in acquired) {
        observeAcquireRefusal(runtime, session, callId, 'rejected')
        return acquired
      }
      if ('unavailable' in acquired) {
        observeAcquireRefusal(runtime, session, callId, 'unavailable')
        return { unavailable: true }
      }
      const lease = observeLease(runtime, session, callId, profile, acquired.lease)
      return { lease }
    }
    async function reopenPersisted(
      session: SessionRuntimeBinding,
      input: ReservedInput,
      reservation: Reservation,
    ): Promise<OpenCallResult> {
      const { key, callId, observer } = input
      const history = await historyFor(session, callId)
      const checked = judgePersistedHistory(history)
      if (!('anchor' in checked)) return checked
      const resolved = await runtime.requestPreparation.resolveTools(request, session.tools)
      if ('failure' in resolved) return toolRefusal(resolved)
      const anchor = checked.anchor
      if (!validPersistedAnchor(anchor)) return { unavailable: true }
      const acquired = acquireObservedLease(session, callId, anchor.profile, [
        anchor.adaptation,
        anchor.profile.routeName,
      ])
      if (!('lease' in acquired)) return acquired
      const lease = acquired.lease
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
        const container = originalContainer(
          {
            key,
            session,
            request,

            binding: {
              profile: anchor.profile,
              snapshot: anchor.profileSnapshot,
              parameters: anchor.parameters,
              selectedBy: anchor.selectedBy,
              lease,
            },
            owner: session.selection.owner,
            coordinator,
          },
          observer,
        )
        if (!canAttachContainer()) return { runtimeStopped: true }
        preparation?.attach(container)
        preparationAttached = true
        transferred = true
        if (!runtime.calls.insert(reservation, container)) return { unavailable: true }
        published = true
        return { ref: key, callId, state: 'resumable' }
      } finally {
        if (!transferred) lease.release()
      }
    }
    type FreshSelection = PreparedModelCreation
    async function appendUndispatched(
      session: SessionRuntimeBinding,
      key: CallKey,
      cause: 'withdrawn' | 'modality_mismatch' | 'credential_unavailable',
    ): Promise<OpenCallResult> {
      const owner = session.selection.owner
      const callId = key.callId
      const written = await appendControlRecord({
        trackTask: task => physical.appends.track(task),
        binding: session.log,
        owner,
        concurrent: runtime.settlementContention.limits.concurrent,
        ...(request.run === undefined ? {} : { run: request.run, attempt: request.attempt }),
        record: {
          kind: 'model_call_ended',
          call: callId,
          ending: 'undispatched',
          cause,
        },
        retainUnknown(registration, task) {
          physical.unknownWrites.keep(
            key,
            session.log,
            owner,
            registration,
            task,
            runtime.history.call,
          )
        },
      })
      return 'appended' in written
        ? { callId, state: 'handed_up', undispatched: cause }
        : { unavailable: true }
    }
    function mapPlanRefusal(planned: PlanFailure): OpenCallResult {
      if (planned.rejected === 'unavailable') return { unavailable: true }
      if (planned.rejected === 'invalidInput') {
        if (planned.reason === 'input_limit_missing' || planned.reason === 'input_size_unavailable')
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
    async function finishPlanRefusal(
      session: SessionRuntimeBinding,
      key: CallKey,
      planned: PlanFailure,
    ): Promise<OpenCallResult> {
      if (planned.rejected === 'modality_not_carried') {
        if (physical.closing) return { runtimeStopped: true }
        return await appendUndispatched(session, key, 'modality_mismatch')
      }
      return mapPlanRefusal(planned)
    }
    function startOriginalPlanning(
      session: SessionRuntimeBinding,
      callId: CallKey['callId'],
      selection: FreshSelection,
      lease: ExactTransportLease<P, R>,
    ): { planning: Promise<PlanResult<P>> } | { unavailable: true } {
      const scoped = scopes.acquire(session.log)
      if ('unavailable' in scoped) return { unavailable: true } as const
      const scopeLease = scoped.lease
      let planning
      try {
        const completion = lease.transport.plan(
          {
            calibration: selection.calibration,
            outputHistory: selection.outputHistory,
            tokenMargin: runtime.tokenMargin,
            target: { kind: 'model_call', callId, dispatch: 1 },
            routeName: selection.content.adopted.profile.routeName,
            provider: selection.content.adopted.profileSnapshot.providers[0] ?? '',
            snapshot: selection.content.adopted.profileSnapshot,
            parameters: selection.content.adopted.parameters,
            messages: selection.content.adopted.messages,
            tools: selection.content.adopted.tools,
          },
          {
            signal: AbortSignal.any([lease.signal, preparation?.signal ?? request.host.signal]),
            ...(scopeLease.reuseScope === undefined ? {} : { reuseScope: scopeLease.reuseScope }),
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
      physical.planningTasks.add(stopped)
      preparation?.retainStopped(stopped)
      const result = planning.finally(() => {
        physical.planningTasks.delete(stopped)
        scopeLease.release()
      })
      return { planning: result } as const
    }
    function planningStopped(): boolean {
      return physical.closing || preparation?.stopping() === true || request.host.signal.aborted
    }
    function originalContainer(
      input: Omit<CreateCallContainerInput<P, R>, 'observer' | 'systemStop'>,
      observer: ReservedInput['observer'],
    ) {
      return createCallContainer({
        ...input,
        systemStop: createOriginalSystemStop(
          runtime,
          input.key,
          (binding, originalOwner, registration, task) =>
            physical.unknownWrites.keep(
              input.key,
              binding,
              originalOwner,
              registration,
              task,
              runtime.history.call,
            ),
        ),
        ...(observer === undefined ? {} : { observer }),
      })
    }
    function canAttachContainer(): boolean {
      return !(physical.closing || preparation?.stopping())
    }
    function judgeFreshEligibility(
      session: SessionRuntimeBinding,
      owner: SettlementOwner,
    ): OpenCallResult | undefined {
      if (
        physical.closing ||
        preparation?.stopping() ||
        request.host.signal.aborted ||
        request.host.stopping()
      )
        return { runtimeStopped: true }
      if (!boundSession(session, request)) return { unavailable: true }
      if (owner.admission() !== 'open') return { runtimeStopped: true }
    }
    async function createFreshWithLease(
      session: SessionRuntimeBinding,
      input: ReservedInput,
      reservation: Reservation,
      selection: FreshSelection,
    ): Promise<OpenCallResult> {
      const { key, callId, observer } = input
      const { profile, profileSnapshot: snapshot } = selection.content.adopted
      const owner = session.selection.owner
      const acquired = acquireObservedLease(session, callId, profile, [
        snapshot.adaptation,
        request.target,
      ])
      if (!('lease' in acquired)) return acquired
      const lease = acquired.lease
      let transferred = false
      try {
        const planning = startOriginalPlanning(session, callId, selection, lease)
        if ('unavailable' in planning) return planning
        const planned = await planning.planning
        if (planningStopped()) return { runtimeStopped: true }
        if ('rejected' in planned) return await finishPlanRefusal(session, key, planned)
        const coordinator = createSettlementCoordinator({
          binding: session.log,
          owner,
          run: runtime.history.run,
          settlementContention: runtime.settlementContention,
          settlementScheduler: runtime.settlementScheduler,
          diagnostic: event => runtime.policy.diagnostic(event),
        })
        const created = selection.content
        const selectedBy = created.adopted.selectedBy
        const at = await runtime.policy.now()
        const refused = judgeFreshEligibility(session, owner)
        if (refused !== undefined) return refused
        const publication = await runtime.recordPublication({
          binding: session.log,
          owner,
          concurrent: runtime.settlementContention.limits.concurrent,
          read: work =>
            withOwnedReads(
              owner,
              runtime.settlementContention.limits.concurrent,
              physical.retainedReads,
              work,
            ),
          contentStore: runtime.callFacts.content,
          content: { kind: 'created', value: created },
          locator: callId,
          version: 'v1',
          at,
          trackTask: task => physical.appends.track(task),
          retainUnknown(publication) {
            if (creation === undefined) throw new Error('creation owner missing')
            if (publication.kind !== 'created') throw new Error('creation publication expected')
            creation.publication = publication.recovery
          },
        })
        if (!('published' in publication)) return { unavailable: true }
        const container = originalContainer(
          {
            key,
            session,
            request: { ...request, callId },

            binding: {
              profile,
              snapshot,
              parameters: selection.content.adopted.parameters,
              selectedBy,
              lease,
            },
            owner,
            coordinator,
          },
          observer,
        )
        if (!canAttachContainer()) return { runtimeStopped: true }
        preparation?.attach(container)
        preparationAttached = true
        transferred = true
        if (!runtime.calls.insert(reservation, container)) return { unavailable: true }
        published = true
        return { ref: key, callId, state: 'open' }
      } finally {
        if (!transferred) lease.release()
      }
    }
    async function createFresh(
      session: SessionRuntimeBinding,
      input: ReservedInput,
      reservation: Reservation,
    ): Promise<OpenCallResult> {
      const { key } = input
      const resolved = await runtime.requestPreparation.resolveTools(request, session.tools)
      if ('failure' in resolved) return toolRefusal(resolved)
      const owner = session.selection.owner
      const facts = await withOwnedReads(
        owner,
        runtime.settlementContention.limits.concurrent,
        physical.retainedReads,
        registration =>
          runtime.requestPreparation.prepareCreation({
            session,
            request,
            key,
            registration,
            tools: resolved.tools,
            calibration: runtime.history.calibration.bind(runtime.history),
          }),
      )
      if ('unavailable' in facts || 'unavailable' in facts.ok) return { unavailable: true }
      const checked = facts.ok
      if ('profileNotFound' in checked) return { profileNotFound: true }
      if ('undispatched' in checked) {
        if (physical.closing) return { runtimeStopped: true }
        return await appendUndispatched(session, key, checked.undispatched)
      }
      if (!('prepared' in checked)) return checked
      if (!matchesPreparedCreation(checked.prepared, key, session, request))
        return { unavailable: true }
      return await createFreshWithLease(session, input, reservation, checked.prepared)
    }
    function reservationRefusal(): OpenCallResult {
      return preparation?.stopping() || request.host.signal.aborted
        ? { runtimeStopped: true }
        : { unavailable: true }
    }
    async function reserveAndOpen(session: SessionRuntimeBinding): Promise<OpenCallResult> {
      const input = reservationInput(session)
      if (!('key' in input)) return input
      const gate = await runtime.calls.waitReserve(input.key, {
        policy: runtime.reservationWaitPolicy,
        scheduler: runtime.settlementScheduler,
        signal: preparation?.signal ?? request.host.signal,
      })
      if ('unavailable' in gate) return reservationRefusal()
      const reservation = gate.reservation
      try {
        if (physical.closing) return { runtimeStopped: true }
        const route = reservationRoute(reservation.view())
        switch (route.kind) {
          case 'local':
            return await reopenLocal(session, input, reservation, route.local)
          case 'persisted':
            return await reopenPersisted(session, input, reservation)
          case 'fresh':
            return await createFresh(session, input, reservation)
          case 'refused':
            return { unavailable: true }
        }
      } catch {
        return { unavailable: true }
      } finally {
        reservation.release()
      }
    }
    function releaseCreationBusy(): void {
      if (creation !== undefined && creationSlot !== undefined) {
        creation.busy = false
        if (creation.publication === undefined) physical.creations.delete(creationSlot)
      }
    }
    function judgeReturnedResult(result: OpenCallResult): OpenCallResult {
      if (request.host.signal.aborted || request.host.stopping()) return { runtimeStopped: true }
      if (creationSession !== undefined) {
        if (physical.closing || creationSession.selection.owner.admission() !== 'open')
          return { runtimeStopped: true }
        if (!boundSession(creationSession, request)) return { unavailable: true }
      }
      return result
    }
    const execute = async (): Promise<OpenCallResult> => {
      let bound: Bound
      try {
        bound = await runtime.sessions.bind(request.session)
      } catch {
        return preparation?.stopping() ? { runtimeStopped: true } : { unavailable: true }
      }
      const checked = judgeBoundSession(bound)
      if (!('session' in checked)) return checked
      const session = checked.session
      if (request.callId === undefined) {
        const recognized = await recognizeAttempt(session)
        if (recognized.kind === 'return') return recognized.result
      }
      return reserveAndOpen(session)
    }
    let result: OpenCallResult
    try {
      result = await execute()
    } catch {
      result = { unavailable: true }
    } finally {
      releaseCreationBusy()
    }
    if (preparation !== undefined && !published) {
      const cleaned = preparationAttached ? await preparation.close() : await preparation.discard()
      if ('unavailable' in cleaned) return { unavailable: true }
    }
    if (preparation !== undefined) physical.preparations.delete(preparation)
    return judgeReturnedResult(result)
  }
  const close = async () => {
    physical.closing = true
    const closePreparation = async (owner: CallPreparationOwner<P, R>) => {
      try {
        const result = await owner.close()
        if ('released' in result) physical.preparations.delete(owner)
        return result
      } catch {
        return { unavailable: true } as const
      }
    }
    const [reads, appendResult, prepared] = await Promise.all([
      physical.retainedReads.close(),
      physical.appends.close(),
      Promise.all([...physical.preparations].map(closePreparation)),
    ])
    await Promise.all([...physical.planningTasks])
    const writes = await physical.unknownWrites.close()
    const closeCreation = async ([slot, attempt]: [string, CreationAttempt]) => {
      if (attempt.publication === undefined) return { unavailable: true } as const
      const result = await attempt.publication.close()
      if ('released' in result) physical.creations.delete(slot)
      return result
    }
    const creationWrites = await Promise.all([...physical.creations.entries()].map(closeCreation))
    const custodyResult = ownCustody === undefined ? undefined : await ownCustody.close()
    const preparationsReleased = () =>
      prepared.every(result => 'released' in result) && physical.preparations.size === 0
    return 'released' in reads &&
      'released' in appendResult &&
      'released' in writes &&
      creationWrites.every(result => 'released' in result) &&
      (custodyResult === undefined || 'released' in custodyResult) &&
      preparationsReleased() &&
      (borrowedScopes !== undefined || 'released' in scopes.close())
      ? ({ released: true } as const)
      : ({ unavailable: true } as const)
  }
  return retainRuntimeProjection(
    Object.freeze({
      openCall,
      close,
      closeAdmission: () => {
        physical.admissionClosed = true
      },
    }),
    (next: RuntimeConstruction<P, R>) =>
      buildServiceCalls(next, borrowedScopes, sharedCustody, physical),
  )
}
