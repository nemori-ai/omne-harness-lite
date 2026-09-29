import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { ModelCallId } from '@omne-harness-lite/call-accounts'
import type { PositionedSubject } from '@omne-harness-lite/loop-extension'
import {
  readRunnerRetryConclusions,
  type LoopExtensionRunnerService,
  type RunnerDispatchRequest,
  type RunnerExecutionPorts,
  type RunnerReadScope,
  type RunnerReplayRequest,
  type RunnerServiceHost,
} from '@omne-harness-lite/loop-extension-runner'
import {
  interpretCallHistory,
  readSettlementPrefix,
  type CurrentHistoryReaders,
  type SettlementPrefix,
  type ModelRuntimeService,
  type SettlementLogBinding,
  type SettlementRegistration,
} from '@omne-harness-lite/model-request-runtime'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import type { AssemblyManifestStore } from '@omne-harness-lite/assembly-manifest-store'
import type { RegistryHistoryReader } from '@omne-harness-lite/evaluation-input-store/registry-history'
import type { SessionTenancyService } from '@omne-harness-lite/session-tenancy-table'
import { messagePrefix, type ControlledSingleRunSelection } from './model-request-text.ts'
import type { AuthenticatedActor } from './types.ts'
import type { createDemoRunnerHost } from './runner-host.ts'

export type DemoRunnerExternalExecution = Pick<
  RunnerExecutionPorts,
  | 'readAskState'
  | 'openHandles'
  | 'mintReminder'
  | 'fallbackNeedsProjection'
  | 'commandPresence'
  | 'invokeCommand'
>

interface AuthorizedRunnerScope {
  readonly actor: AuthenticatedActor
  readonly binding: SettlementLogBinding
}

/** This port is supplied only by an actual external Run/environment owner. */
export interface DemoRunnerServiceHostDependencies {
  readonly runnerHost: ReturnType<typeof createDemoRunnerHost>
  readonly model: ModelRuntimeService
  readonly manifest: AssemblyManifestStore
  readonly history: RegistryHistoryReader
  readonly sessionTenancy: SessionTenancyService
  readonly authorize: (
    session: string,
  ) => Promise<AuthorizedRunnerScope | { readonly unavailable: true }>
  readonly external?: (
    actor: AuthenticatedActor,
    request: RunnerDispatchRequest,
    signal: AbortSignal,
  ) => Promise<DemoRunnerExternalExecution | { readonly unavailable: true }>
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

/** Borrows real authenticated scope and the shared physical SL3 task owner. */
export function createDemoRunnerServiceHost(
  dependencies: DemoRunnerServiceHostDependencies,
): RunnerServiceHost {
  async function acquire(request: RunnerReplayRequest): Promise<
    | {
        readonly scope: RunnerReadScope
        readonly settlement: SettlementLogBinding
        readonly actor: AuthenticatedActor
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
      actor: authorized.actor,
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

  return Object.freeze<RunnerServiceHost>({
    async acquireReplay(request) {
      const acquired = await acquire(request)
      return 'failure' in acquired ? acquired : acquired.scope
    },
    async acquireDispatch(request, signal) {
      const acquired = await acquire(request)
      if ('failure' in acquired) return acquired
      const { scope, actor, settlement } = acquired
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
      let consumed: Awaited<ReturnType<typeof dependencies.model.readAttempts>>
      try {
        consumed = await dependencies.model.readAttempts(
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
        external = await dependencies.external(actor, request, signal)
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
            const guarded = await dependencies.model.canDispatchAgain({
              session: settlement.session,
              callId,
              plan: output.plan,
            })
            if (!scope.isActive()) return { kind: 'unavailable' }
            if ('allowed' in guarded) return { kind: 'accepted' }
            if ('refused' in guarded) return { kind: 'rejected', reason: guarded.refused.why }
            if ('alreadyEnded' in guarded) return { kind: 'rejected', reason: 'alreadyEnded' }
            if ('callNotFound' in guarded) return { kind: 'rejected', reason: 'callNotFound' }
            if ('wrongPhase' in guarded) return { kind: 'rejected', reason: 'wrongPhase' }
            if ('invalidInput' in guarded) return { kind: 'invalidInput' }
            return { kind: 'unavailable' }
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
