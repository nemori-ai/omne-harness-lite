import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import type { ModelCallId } from '@omne-harness-lite/call-accounts'
import type { PositionedSubject } from '@omne-harness-lite/loop-extension'
import { judgeDefinition } from '@omne-harness-lite/loop-extension'
import {
  readRunnerRetryConclusions,
  type LoopExtensionRunnerService,
  type RunnerDispatchRequest,
  type RunnerExecutionPorts,
  type RunnerCapabilityResult,
  type RunnerReadScope,
  type RunnerReplayRequest,
  type RunnerServiceHost,
  type RunnerActionRequest,
  type RunnerDispatchScope,
  inspectRunnerConclusion,
  type RunnerAnyDispatchRequest,
  type RunnerPiece,
} from '@omne-harness-lite/loop-extension-runner'
import {
  interpretCallHistory,
  readSettlementPrefix,
  type CurrentHistoryReaders,
  type SettlementPrefix,
  type ModelRuntimeOperations,
  type CanDispatchAgainResult,
  type SettlementLogBinding,
  type SettlementRegistration,
} from '@omne-harness-lite/model-request-runtime'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import type { AssemblyManifestStore } from '@omne-harness-lite/assembly-manifest-store'
import type { SessionTenancyService } from '@omne-harness-lite/session-tenancy'
import { messagePrefix, type ControlledSingleRunSelection } from './model-request-text.ts'
import type { AuthenticatedActor } from './types.ts'
import type { createDemoRunnerHost } from './runner-host.ts'
import { readToolActionSource, type ToolActionAuthority } from './tool-action-source.ts'
import { checkAppendInput, type SessionLogOwnerOperations } from '@omne-harness-lite/session-log'
import type { SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import { readToolDriverHistory } from './tool-driver-history.ts'
import type { LoggedMessage } from '@omne-harness-lite/messages'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import { projectToolJournal } from '@omne-harness-lite/tool-execution-runtime'
import { afterEachSubject, toolDeliveryMessage } from './tool-delivery-subject.ts'
import { toolBatch } from './tool-batch.ts'
import { toolDenialSource } from './tool-denial-source.ts'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'

export type DemoRunnerExternalExecution = Pick<
  RunnerExecutionPorts,
  | 'readAskState'
  | 'openHandles'
  | 'mintReminder'
  | 'fallbackNeedsProjection'
  | 'commandPresence'
  | 'invokeCommand'
>

export type AuthorizedRunnerScope = { readonly binding: SettlementLogBinding } & (
  | { readonly actor: AuthenticatedActor }
  | {
      /** Application-private delivery authority. It cannot admit actions or model retries. */
      readonly maintenance: {
        readonly scope: SessionScope
        readonly access: RecoveryAccess
        readonly external: (signal: AbortSignal) => DemoRunnerExternalExecution
      }
    }
)

/** This port is supplied only by an actual external Run/environment owner. */
export interface DemoRunnerServiceHostDependencies {
  readonly runnerHost: ReturnType<typeof createDemoRunnerHost>
  readonly model: (actor: AuthenticatedActor) => ModelRuntimeOperations
  readonly manifest: AssemblyManifestStore
  readonly history: RunnerReadScope['sources']['history']
  readonly sessionTenancy: SessionTenancyService
  readonly authorize: (
    session: string,
  ) => Promise<AuthorizedRunnerScope | { readonly unavailable: true }>
  readonly external?: (
    actor: AuthenticatedActor,
    request: RunnerDispatchRequest,
    signal: AbortSignal,
  ) => Promise<DemoRunnerExternalExecution | { readonly unavailable: true }>
  /** Actual coordinator/access owners and execution facilities for the independent tool driver. */
  readonly actions?: {
    readonly owner: SessionLogOwnerOperations
    readonly authorization: SessionAccessOperations
    readonly authorize: (
      actor: AuthenticatedActor,
      session: string,
    ) => Promise<ToolActionAuthority | { readonly unavailable: true }>
    readonly external: (
      actor: AuthenticatedActor,
      request: RunnerAnyDispatchRequest,
      signal: AbortSignal,
    ) => Promise<DemoRunnerExternalExecution | { readonly unavailable: true }>
  }

  readonly now: () => string | { readonly unavailable: true }
  /** The application-selected local Run chain; request values alone are not a source. */
  readonly selectedRun: (
    session: string,
    run: string,
    attempt: JsonNumber,
  ) => ControlledSingleRunSelection | undefined
}

function failureCall(request: RunnerDispatchRequest): string | undefined {
  if (!failurePosition(request) || request.run === undefined || request.attempt === undefined)
    return undefined
  const record = request.subject.dispatches.at(-1)
  const parsed = parseOpaqueIdentifier(record?.call, 'ModelCallId')
  return 'ok' in parsed ? parsed.ok : undefined
}

function failurePosition(
  value: PositionedSubject,
): value is Extract<
  PositionedSubject,
  { readonly position: 'after_model_call'; readonly dimension: { readonly ending: 'failure' } }
> {
  return (
    value.position === 'after_model_call' &&
    value.dimension.ending === 'failure' &&
    'dispatches' in value.subject
  )
}

/** Keep the runtime guard's closed result and original refusal reason at the runner boundary. */
export function projectRunnerRetryGuard(guarded: CanDispatchAgainResult): RunnerCapabilityResult {
  if ('allowed' in guarded) return { kind: 'accepted' }
  if ('refused' in guarded) return { kind: 'rejected', reason: guarded.refused.why }
  if ('alreadyEnded' in guarded) return { kind: 'rejected', reason: 'alreadyEnded' }
  if ('callNotFound' in guarded) return { kind: 'rejected', reason: 'callNotFound' }
  if ('wrongPhase' in guarded) return { kind: 'rejected', reason: 'wrongPhase' }
  if ('invalidInput' in guarded) return { kind: 'invalidInput' }
  return { kind: 'unavailable' }
}

/** Borrows real authenticated scope and the shared physical SL3 task owner. */
export function createDemoRunnerServiceHost(
  dependencies: DemoRunnerServiceHostDependencies,
): RunnerServiceHost {
  async function acquire(request: Pick<RunnerReplayRequest, 'manifest'>): Promise<
    | {
        readonly scope: RunnerReadScope
        readonly settlement: SettlementLogBinding
        readonly authorization: AuthorizedRunnerScope
      }
    | { readonly failure: 'unavailable' }
  > {
    const authorized = await dependencies.authorize(request.manifest)
    if ('unavailable' in authorized) return { failure: 'unavailable' }
    const borrowed = dependencies.runnerHost.borrow(authorized.binding)
    if ('unavailable' in borrowed) return { failure: 'unavailable' }
    let released = false
    const active = () => !released && borrowed.isActive()
    return {
      authorization: authorized,
      settlement: authorized.binding,
      scope: {
        binding: borrowed.binding,
        owner: borrowed.owner,
        sources: {
          sessionTenancy: dependencies.sessionTenancy,
          manifest: dependencies.manifest,
          history: dependencies.history,
          isActive: active,
        },
        isActive: active,
        release() {
          released = true
        },
      },
    }
  }

  async function acquireTool(
    request: RunnerDispatchRequest,
    acquired: Extract<Awaited<ReturnType<typeof acquire>>, { readonly scope: RunnerReadScope }>,
    signal: AbortSignal,
  ): Promise<RunnerDispatchScope | { readonly failure: 'unavailable' | 'invalidInput' }> {
    const { scope, authorization } = acquired,
      actions = dependencies.actions
    let handedOff = false
    try {
      if (!actions) return { failure: 'unavailable' }
      const authority =
        'maintenance' in authorization
          ? {
              scope: authorization.maintenance.scope,
              coordinator: authorization.maintenance.access,
            }
          : await actions.authorize(authorization.actor, scope.binding.session)
      if ('unavailable' in authority) return { failure: 'unavailable' }
      const prefix = await actions.owner.readPrefix(authority.coordinator, authority.scope)
      if (prefix.kind !== 'prefix' || !scope.isActive()) return { failure: 'unavailable' }
      const history = readToolDriverHistory(prefix.prefix),
        tools = projectToolJournal(authority.scope, prefix.prefix.entries)
      if ('unavailable' in history || 'invalid' in tools) return { failure: 'unavailable' }
      let initial: PositionedSubject
      let selectedChain: readonly RunnerPiece[] | undefined
      if (request.position === 'after_action' && request.dimension.scope === 'batch') {
        if ('maintenance' in authorization) return { failure: 'unavailable' }
        if (request.run === undefined || request.attempt === undefined)
          return { failure: 'invalidInput' }
        const batches = [...history.models.replies.values()].flatMap(reply => {
          if (
            reply.entry.run !== request.run ||
            reply.entry.attempt === undefined ||
            ExactDecimal.from(reply.entry.attempt).compare(ExactDecimal.from(request.attempt!)) !==
              0
          )
            return []
          const batch = toolBatch(history, {
            run: request.run!,
            attempt: request.attempt!,
            assistantMessage: reply.message.id,
          })
          return batch?.anchor === request.anchor ? [batch] : []
        })
        if (batches.length !== 1 || !modelLogJsonEqual(batches[0]!.subject, request.subject))
          return { failure: 'invalidInput' }
        initial = {
          position: 'after_action',
          dimension: { scope: 'batch' },
          subject: batches[0]!.subject,
        }
      } else {
        const callId =
          request.position === 'after_action' && 'callId' in request.subject
            ? request.subject.callId
            : request.position === 'before_persist_message' &&
                request.subject.message.type === 'tool'
              ? request.subject.message.blocks[0].callId
              : undefined
        if (!callId) return { failure: 'invalidInput' }
        const execution = tools.executions.get(callId),
          facts = history.calls.get(callId)
        if (!facts) return { failure: 'unavailable' }
        if (
          request.run !== facts.origin.run ||
          request.attempt === undefined ||
          ExactDecimal.from(request.attempt).compare(ExactDecimal.from(facts.origin.attempt)) !== 0
        )
          return { failure: 'invalidInput' }
        const denial = toolDenialSource(history, callId)
        if (denial) {
          if ('maintenance' in authorization) return { failure: 'unavailable' }
          if (
            request.position === 'after_action' &&
            request.dimension.scope === 'each' &&
            request.anchor === denial.anchor &&
            modelLogJsonEqual(request.subject, denial.subject)
          )
            initial = {
              position: 'after_action',
              dimension: { scope: 'each' },
              subject: denial.subject,
            }
          else if (
            request.position === 'before_persist_message' &&
            request.anchor === `${denial.anchor}:persist` &&
            request.subject.producer === 'tool' &&
            modelLogJsonEqual(request.subject.message, denial.message)
          )
            initial = {
              position: 'before_persist_message',
              subject: { producer: 'tool', message: denial.message },
            }
          else return { failure: 'invalidInput' }
        } else {
          if (!execution?.terminal) return { failure: 'unavailable' }
          if (request.position === 'after_action' && request.dimension.scope === 'each') {
            const subject = afterEachSubject(execution)
            if (
              !subject ||
              request.anchor !== execution.terminal.value.delivery.pass ||
              !modelLogJsonEqual(subject, request.subject)
            )
              return { failure: 'invalidInput' }
            initial = { position: 'after_action', dimension: { scope: 'each' }, subject }
          } else if (request.position === 'before_persist_message') {
            const message = toolDeliveryMessage(execution)
            if (
              !message ||
              request.anchor !== `${execution.terminal.value.delivery.pass}:persist` ||
              request.subject.producer !== 'tool' ||
              !modelLogJsonEqual(message, request.subject.message)
            )
              return { failure: 'invalidInput' }
            initial = { position: 'before_persist_message', subject: { producer: 'tool', message } }
          } else return { failure: 'invalidInput' }
          const captured = copyJsonValue(execution.terminal.value.delivery.selectedChain)
          if ('failed' in captured || !Array.isArray(captured.ok)) return { failure: 'unavailable' }
          const chain = captured.ok as unknown as readonly RunnerPiece[]
          if (chain.some(piece => !piece || !('ok' in judgeDefinition(piece.definition))))
            return { failure: 'unavailable' }
          if (initial.position === 'after_action') selectedChain = chain
        }
      }
      const external =
        'maintenance' in authorization
          ? authorization.maintenance.external(signal)
          : await actions.external(authorization.actor, request, signal)
      if ('unavailable' in external || !scope.isActive()) return { failure: 'unavailable' }
      handedOff = true
      return {
        ...scope,
        ...('maintenance' in authorization ? { recordFence: { kind: 'unfenced' as const } } : {}),
        ...(selectedChain === undefined ? {} : { selectedChain }),
        ports: {
          ...external,
          now: dependencies.now,
          verifyFailure: async () => ({ kind: 'invalidInput' }),
          judgeCapabilities: async (input, output) =>
            scope.isActive() &&
            (input.position === 'after_action' || input.position === 'before_persist_message') &&
            ['observed', 'rewrite', 'inject', 'veto', 'stop', 'ask'].includes(output.kind)
              ? { kind: 'accepted' }
              : { kind: 'invalidInput' },
        },
        subjectForCandidate: () => initial,
        async readMessagePrefix() {
          const read = await actions.owner.readPrefix(authority.coordinator, authority.scope)
          if (read.kind !== 'prefix' || !scope.isActive()) return { unavailable: true }
          const current = readToolDriverHistory(read.prefix)
          if ('unavailable' in current) return { unavailable: true }
          return current.models.entries.flatMap(record =>
            record.captured.message !== null && record.captured.message.type !== 'system'
              ? [record.captured.message]
              : [],
          )
        },
      }
    } finally {
      if (!handedOff) scope.release()
    }
  }

  async function acquireAction(
    request: RunnerActionRequest,
    acquired: Extract<Awaited<ReturnType<typeof acquire>>, { scope: RunnerReadScope }>,
    signal: AbortSignal,
  ): Promise<
    | RunnerDispatchScope
    | { readonly failure: 'unavailable' | 'invalidInput' | 'attemptSuperseded' | 'manifestMissing' }
  > {
    const { scope, authorization } = acquired,
      actions = dependencies.actions
    if (actions === undefined || 'maintenance' in authorization) {
      scope.release()
      return { failure: 'unavailable' }
    }
    let handedOff = false
    try {
      const authority = await actions.authorize(authorization.actor, scope.binding.session)
      if ('unavailable' in authority) return { failure: 'unavailable' }
      const read = await readToolActionSource({
        ...actions,
        authority,
        origin: {
          run: request.run,
          attempt: request.attempt,
          assistantMessage: request.assistantMessage,
        },
      })
      if ('failure' in read) return read
      const external = await actions.external(authorization.actor, request, signal)
      if ('unavailable' in external || !scope.isActive()) return { failure: 'unavailable' }
      const original = read.request.actions
      handedOff = true
      return {
        ...scope,
        action: read.source,
        ports: {
          ...external,
          now: dependencies.now,
          async verifyFailure() {
            return { kind: 'invalidInput' }
          },
          async judgeCapabilities(input, output) {
            if (
              input.position !== 'before_action' ||
              !['observed', 'rewrite', 'veto', 'ask', 'inject'].includes(output.kind)
            )
              return { kind: 'invalidInput' }
            // These action outputs consume no model-retry capability. Their shapes and powers
            // are judged by the runner; current Run authority is still checked at this boundary.
            const current = await actions.authorization.authorize(
              authority.access,
              authority.scope,
              'run.advance',
            )
            return current.kind === 'authorized' && scope.isActive()
              ? { kind: 'accepted' }
              : { kind: 'unavailable' }
          },
        },
        subjectForCandidate(entry) {
          if (!scope.isActive()) return { unavailable: true }
          const owned = checkAppendInput(
            read.source.scope.session,
            [entry],
            { kind: 'unfenced' },
            { kind: 'unconditional' },
          )
          if ('failure' in owned || owned.ok.entries[0] === undefined) return { unavailable: true }
          const inspected = inspectRunnerConclusion({
            ...read.source.scope,
            entry: { ...owned.ok.entries[0], session: read.source.scope.session, position: 1 },
          })
          if (!('conclusion' in inspected) || inspected.conclusion.position !== 'before_action')
            return { unavailable: true }
          const subject = original.find(item => item.call.callId === inspected.conclusion.callId)
          return subject === undefined
            ? { unavailable: true }
            : { position: 'before_action', subject }
        },
        async readMessagePrefix() {
          if (!scope.isActive()) return { unavailable: true }
          const current = await actions.owner.readPrefix(authority.coordinator, authority.scope)
          if (current.kind !== 'prefix' || !scope.isActive()) return { unavailable: true }
          const history = readToolDriverHistory(current.prefix)
          if ('unavailable' in history) return { unavailable: true }
          const messages: LoggedMessage[] = []
          for (const item of history.models.entries) {
            const message = item.captured.message
            if (message !== null && message.type !== 'system') messages.push(message)
          }
          return messages
        },
      }
    } finally {
      if (!handedOff) scope.release()
    }
  }

  return Object.freeze<RunnerServiceHost>({
    async acquireReplay(request) {
      const acquired = await acquire(request)
      return 'failure' in acquired ? acquired : acquired.scope
    },
    async acquireDispatch(request, signal) {
      const acquired = await acquire(request)
      if ('failure' in acquired) return acquired
      if (request.position === 'before_action') return acquireAction(request, acquired, signal)
      if (
        request.position === 'after_action' ||
        (request.position === 'before_persist_message' && request.subject.producer === 'tool')
      )
        return acquireTool(request, acquired, signal)
      const { scope, authorization, settlement } = acquired
      if ('maintenance' in authorization) {
        scope.release()
        return { failure: 'unavailable' }
      }
      if (!failurePosition(request)) {
        scope.release()
        return { failure: 'unavailable' }
      }
      if (request.run === undefined || request.attempt === undefined) {
        scope.release()
        return { failure: 'invalidInput' }
      }
      const callId = failureCall(request)
      if (callId === undefined || dependencies.external === undefined) {
        scope.release()
        return { failure: 'unavailable' }
      }
      const model = dependencies.model(authorization.actor)
      let consumed: Awaited<ReturnType<typeof model.readAttempts>>
      try {
        consumed = await model.readAttempts(
          { session: settlement.session, callId },
          { consumeFailure: true },
        )
      } catch (error) {
        scope.release()
        throw error
      }
      if (consumed.consumption.kind !== 'failure' || !scope.isActive()) {
        if (consumed.consumption.kind === 'failure') consumed.consumption.source.release()
        scope.release()
        return { failure: 'unavailable' }
      }
      const source = consumed.consumption.source
      if (source.subject.dispatches.some(dispatch => dispatch.call !== callId)) {
        source.release()
        scope.release()
        return { failure: 'unavailable' }
      }
      const preparedExecution = { run: request.run, attempt: request.attempt }
      const verifiedRequest = source.verify(request.subject, preparedExecution)
      if ('invalidInput' in verifiedRequest || 'unavailable' in verifiedRequest) {
        source.release()
        scope.release()
        return { failure: 'invalidInput' in verifiedRequest ? 'invalidInput' : 'unavailable' }
      }
      let external: DemoRunnerExternalExecution | { readonly unavailable: true }
      try {
        external = await dependencies.external(authorization.actor, request, signal)
      } catch (error) {
        source.release()
        scope.release()
        throw error
      }
      if ('unavailable' in external || !scope.isActive()) {
        source.release()
        scope.release()
        return { failure: 'unavailable' }
      }
      const originalRelease = scope.release
      const release = () => {
        source.release()
        originalRelease()
      }
      const registration: SettlementRegistration = {
        start(kind, execute) {
          if (kind !== 'read') throw new Error('runner prefix registration is read-only')
          const started = scope.owner.start({ kind: 'read', execute: () => execute(signal) })
          if ('unavailable' in started) throw new Error('runner read admission closed')
          return {
            completion: started.completion,
            stopped: started.completion.then(
              () => undefined,
              () => undefined,
            ),
            requestStop() {},
          }
        },
        release() {},
      }
      return {
        ...scope,
        release,
        subjectForCandidate: (): PositionedSubject => ({
          position: 'after_model_call',
          dimension: { ending: 'failure' },
          subject: source.subject,
        }),
        async readMessagePrefix() {
          if (!scope.isActive()) return { unavailable: true }
          const prefix = await readSettlementPrefix({ binding: settlement, registration })
          if ('unavailable' in prefix) return { unavailable: true }
          const selected = dependencies.selectedRun(
            settlement.session,
            preparedExecution.run,
            preparedExecution.attempt,
          )
          if (selected === undefined) return { unavailable: true }
          const decoded = messagePrefix(prefix.prefix, selected)
          return 'unavailable' in decoded ? decoded : decoded.messages
        },
        ports: {
          ...external,
          now: dependencies.now,
          async verifyFailure(subject, binding, execution) {
            if (!scope.isActive() || binding !== scope.binding || !failurePosition(subject))
              return { kind: 'unavailable' }
            if (
              execution.kind !== 'withRun' ||
              execution.run !== preparedExecution.run ||
              ExactDecimal.from(execution.attempt).compare(
                ExactDecimal.from(preparedExecution.attempt),
              ) !== 0
            )
              return { kind: 'invalidInput' }
            const verified = source.verify(subject.subject, {
              run: execution.run,
              attempt: execution.attempt,
            })
            if ('unavailable' in verified) return { kind: 'unavailable' }
            if ('invalidInput' in verified) return { kind: 'invalidInput' }
            return {
              kind: 'verified',
              subject: {
                position: 'after_model_call',
                dimension: { ending: 'failure' },
                subject: verified.authoritativeSubject,
              },
              release() {},
            }
          },
          async judgeCapabilities(input, output) {
            if (!scope.isActive() || !failurePosition(input) || output.kind !== 'retry')
              return { kind: 'unavailable' }
            const guarded = await model.canDispatchAgain({
              session: settlement.session,
              callId,
              plan: output.plan,
            })
            if (!scope.isActive()) return { kind: 'unavailable' }
            return projectRunnerRetryGuard(guarded)
          },
        },
      }
    },
  })
}

export type DemoRunnerService = LoopExtensionRunnerService

/** Runtime's same-prefix failure projection includes the runner's durable retry decisions. */
export function readDemoRunnerFailure(
  prefix: SettlementPrefix,
  callId: ModelCallId,
): ReturnType<CurrentHistoryReaders['failure']> {
  const history = interpretCallHistory({ prefix, callId })
  if (!('known' in history) || history.known.dispatches.length === 0) return { unavailable: true }
  const retry = readRunnerRetryConclusions({
    session: prefix.binding.session,
    tenant: prefix.binding.tenant,
    callId,
    entries: prefix.entries,
    tail: prefix.tail,
  })
  if ('unavailable' in retry) return retry
  const dispatches = history.known.dispatches
  const last = dispatches.at(-1)
  if (last?.response === null || last?.response === undefined) return { unavailable: true }
  const value = last.response.value
  if (!('ok' in judgeModelResponse(value))) return { unavailable: true }
  const response = value as unknown as ModelResponse
  if (response.outcome !== 'failed') return { unavailable: true }
  const first = dispatches[0]
  if (first === undefined) return { unavailable: true }
  const common = {
    failure: response.failure.cause,
    profile: last.record.profileSnapshot,
    dispatches: [first.record, ...dispatches.slice(1).map(item => item.record)] as const,
    retryConclusions: retry.conclusions,
  }
  return response.failure.inBand === true
    ? { subject: { ...common, inBand: true, statusCode: response.failure.statusCode } }
    : response.failure.statusCode === undefined
      ? { subject: common }
      : { subject: { ...common, statusCode: response.failure.statusCode } }
}
