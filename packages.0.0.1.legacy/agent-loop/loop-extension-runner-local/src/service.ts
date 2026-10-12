import { createAssetEvaluator, type AssetEvaluator } from '@omne-harness-lite/asset-evaluation'
import { captureActionRequest, checkActionSource, isActionDispatch } from './action-request.ts'
import { runActionBatch } from './action-batch.ts'
import { createServicePorts } from './service-ports.ts'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { copyJsonValue, isJsonNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { judgePositionedSubject, type PositionedSubject } from '@omne-harness-lite/loop-extension'
import type { SessionLog } from '@omne-harness-lite/session-log'
import type { SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import type { ToolAdmissionPassSourceOperations } from '@omne-harness-lite/tool-admission'
import { createAdmissionPassSource } from './admission-pass-source.ts'
import { createRunnerImplementationRegistry } from './implementation-registry.ts'
import { type RunnerImplementations } from '@omne-harness-lite/loop-extension-runner'
import {
  RunnerFailureSignal,
  readPassConclusions,
  samePosition,
  validateHistoryScope,
} from './pass-history.ts'
import { passKeys } from '@omne-harness-lite/loop-extension-runner'
import { readRunnerChain } from '@omne-harness-lite/loop-extension-runner'
import { runPass } from './run-pass.ts'
import {
  type RunnerPass,
  type RunnerPiece,
  type RunnerInvocationResult,
} from '@omne-harness-lite/loop-extension-runner'
import type {
  LoopExtensionRunnerService,
  RunnerDispatchRequest,
  RunnerReplayRequest,
  RunnerServiceHost,
  RunnerReadScope,
  RunnerActionRequest,
  RunnerActionResult,
  RunnerPassResult,
} from '@omne-harness-lite/loop-extension-runner'

export interface RunnerServiceInstance {
  readonly runner: LoopExtensionRunnerService
  readonly admissionPassSource: ToolAdmissionPassSourceOperations
  readonly implementations: RunnerImplementations
  readonly closeAdmission: () => void
  /** Waits for this instance's actual invocations; never drains/forgets the host's unknown log owner. */
  readonly drain: () => Promise<void>
}
const unavailable = Object.freeze({ failure: 'unavailable' } as const)
const invalidInput = Object.freeze({ failure: 'invalidInput' } as const)
function request(
  value: RunnerReplayRequest,
  dispatch: boolean,
): { readonly initial: PositionedSubject; readonly request: RunnerDispatchRequest } {
  const copied = copyJsonValue(value)
  if ('failed' in copied) throw new RunnerFailureSignal(invalidInput)
  // Narrow only within this validator; all used members are judged before returning.
  value = copied.ok as unknown as RunnerReplayRequest
  validateRequestShape(value, dispatch)
  const initial = judgePositionedSubject({
    position: value.position,
    subject: value.subject,
    ...(value.dimension === undefined ? {} : { dimension: value.dimension }),
  })
  if ('rejected' in initial)
    throw new RunnerFailureSignal(
      initial.rejected === 'position_unknown' ? { failure: 'positionUnknown' } : invalidInput,
    )
  validateHistoryScope(
    {
      initial: initial.ok,
      anchor: value.anchor,
      ...(value.run === undefined ? {} : { run: value.run }),
    },
    [],
    false,
  )
  if (Object.hasOwn(value, 'run') && value.run === undefined)
    throw new RunnerFailureSignal(invalidInput)
  if (dispatch && initial.ok.position === 'before_action')
    throw new RunnerFailureSignal(invalidInput)
  return { initial: initial.ok, request: value as RunnerDispatchRequest }
}
function validateRequestShape(value: RunnerReplayRequest, dispatch: boolean): void {
  if (
    !value ||
    typeof value !== 'object' ||
    !('ok' in parseOpaqueIdentifier(value.manifest, 'SessionRef')) ||
    Object.keys(value).some(
      key =>
        ![
          'position',
          'dimension',
          'subject',
          'manifest',
          'anchor',
          'run',
          ...(dispatch ? ['attempt'] : []),
        ].includes(key),
    )
  )
    throw new RunnerFailureSignal(invalidInput)
}

function validateAttempt(
  requested: RunnerDispatchRequest,
  attempt: RunnerDispatchRequest['attempt'],
): void {
  if (
    requested.run === undefined
      ? Object.hasOwn(requested, 'attempt')
      : !isJsonNumber(attempt) ||
        !ExactDecimal.from(attempt).isInteger ||
        ExactDecimal.from(attempt).compare(ExactDecimal.from(0)) <= 0
  )
    throw new RunnerFailureSignal(invalidInput)
}

function selected(
  chain: readonly RunnerPiece[],
  initial: PositionedSubject,
): readonly RunnerPiece[] {
  return Object.freeze(chain.filter(item => samePosition(item.definition, initial)))
}
function modelPosition(initial: PositionedSubject): boolean {
  return [
    'before_model_call',
    'after_model_call',
    'before_persist_message',
    'after_persist_message',
    'after_action',
  ].includes(initial.position)
}

/** Shared service assembly. Authorization and physical log ownership remain with the supplied host. */
export function createLoopExtensionRunner(input: {
  readonly evaluator?: AssetEvaluator
  readonly log: SessionLog
  readonly host: RunnerServiceHost
  readonly access: SessionAccessOperations
  readonly isActive: () => boolean
}): RunnerServiceInstance {
  const { log, host, isActive } = input
  const evaluator = input.evaluator ?? createAssetEvaluator()
  const registry = createRunnerImplementationRegistry()
  const stop = new AbortController()
  let admitting = true
  const tasks = new Set<Promise<unknown>>()
  const actualInvocations = new Set<Promise<unknown>>()
  const active = () => admitting && isActive()
  const admissionPasses = createAdmissionPassSource({ access: input.access, isActive: active })
  function track<T>(set: Set<Promise<unknown>>, work: Promise<T>): Promise<T> {
    set.add(work)
    void work.then(
      () => set.delete(work),
      () => set.delete(work),
    )
    return work
  }
  function scopeActive(scope: RunnerReadScope): boolean {
    return active() && scope.isActive() && scope.sources.isActive()
  }
  async function chain(scope: RunnerReadScope, requested: { readonly manifest: string }) {
    if (scope.binding.session !== requested.manifest || !scopeActive(scope))
      throw new RunnerFailureSignal(unavailable)
    if (scope.selectedChain !== undefined) {
      const captured = copyJsonValue(scope.selectedChain)
      if ('failed' in captured || !Array.isArray(captured.ok))
        throw new RunnerFailureSignal(unavailable)
      return captured.ok as unknown as readonly RunnerPiece[]
    }
    const result = await readRunnerChain({
      evaluator,
      session: requested.manifest,
      binding: scope.binding,
      sources: { ...scope.sources, isActive: () => scopeActive(scope) },
    })
    if ('failure' in result) throw new RunnerFailureSignal(result)
    return result
  }
  function startReplayRead(scope: RunnerReadScope, key: string) {
    const session = parseOpaqueIdentifier(scope.binding.session, 'SessionRef')
    if (!('ok' in session) || !scopeActive(scope) || scope.owner.hasUnknown(scope.binding, key))
      throw new RunnerFailureSignal(unavailable)
    const read = scope.owner.start({
      kind: 'read',
      execute: () => log.readByKey(session.ok, key),
    })
    if ('unavailable' in read) throw new RunnerFailureSignal(unavailable)
    return read
  }
  const single = Object.freeze<{
    dispatch: (request: RunnerDispatchRequest, signal: AbortSignal) => Promise<RunnerPassResult>
    replay: LoopExtensionRunnerService['replay']
  }>({
    dispatch(supplied, callerSignal) {
      return track(
        tasks,
        (async () => {
          try {
            const parsed = request(supplied, true)
            const requested = parsed.request
            const attempt = requested.attempt
            validateAttempt(requested, attempt)
            if (!active()) return unavailable
            if (callerSignal.aborted) return { failure: 'cancelled' as const }
            if (!modelPosition(parsed.initial)) return unavailable
            const pass: RunnerPass = Object.freeze({
              initial: parsed.initial,
              anchor: requested.anchor,
              execution: Object.freeze(
                requested.run === undefined
                  ? { kind: 'noRun' as const }
                  : { kind: 'withRun' as const, run: requested.run, attempt: attempt! },
              ),
            })
            const signal = AbortSignal.any([callerSignal, stop.signal])
            const scope = await host.acquireDispatch(requested, signal)
            if ('failure' in scope) return scope
            try {
              if (!scopeActive(scope)) return unavailable
              if (signal.aborted) return { failure: 'cancelled' as const }
              const all = await chain(scope, requested)
              validateHistoryScope(
                {
                  initial: pass.initial,
                  anchor: pass.anchor,
                  ...(pass.execution.kind === 'withRun' ? { run: pass.execution.run } : {}),
                },
                selected(all, parsed.initial),
                false,
              )
              if (!scopeActive(scope)) return unavailable
              const result = await runPass(
                pass,
                selected(all, parsed.initial),
                createServicePorts({
                  log,
                  scope,
                  all,
                  registry,
                  active: () => scopeActive(scope),
                  trackInvocation: work => track(actualInvocations, work),
                }),
                signal,
              )
              return !active()
                ? unavailable
                : 'failure' in result
                  ? result
                  : { ...result, chain: selected(all, parsed.initial) }
            } finally {
              scope.release()
            }
          } catch (error) {
            if (error instanceof RunnerFailureSignal) return error.result
            throw error
          }
        })(),
      )
    },
    replay(supplied) {
      return track(
        tasks,
        (async () => {
          try {
            const parsed = request(supplied, false)
            const requested = parsed.request
            if (
              !active() ||
              (!modelPosition(parsed.initial) && parsed.initial.position !== 'before_action')
            )
              return unavailable
            const scope = await host.acquireReplay(requested, stop.signal)
            if ('failure' in scope) return scope
            try {
              if (!scopeActive(scope)) return unavailable
              const all = await chain(scope, requested)
              const keys = passKeys({
                position: parsed.initial.position,
                ...(parsed.initial.dimension === undefined
                  ? {}
                  : { dimension: parsed.initial.dimension }),
                anchor: requested.anchor,
              })
              if ('invalidInput' in keys) return invalidInput
              const read = startReplayRead(scope, keys.pass)
              const history = await read.completion
              if (!scopeActive(scope) || !('entries' in history)) return unavailable
              return readPassConclusions({
                initial: parsed.initial,
                anchor: requested.anchor,
                ...(requested.run === undefined ? {} : { run: requested.run }),
                binding: scope.binding,
                chain: selected(all, parsed.initial),
                ...history,
              })
            } finally {
              scope.release()
            }
          } catch (error) {
            if (error instanceof RunnerFailureSignal) return error.replayResult()
            throw error
          }
        })(),
      )
    },
  })
  async function dispatchAction(
    supplied: RunnerActionRequest,
    callerSignal: AbortSignal,
  ): Promise<RunnerActionResult> {
    const captured = captureActionRequest(supplied)
    if ('failure' in captured) return captured
    if (!active()) return unavailable
    if (callerSignal.aborted) return { failure: 'cancelled' }
    const requested = captured.request
    const signal = AbortSignal.any([callerSignal, stop.signal])
    try {
      const scope = await host.acquireDispatch(requested, signal)
      if ('failure' in scope) return scope
      try {
        if (!scopeActive(scope)) return unavailable
        const checked = checkActionSource(requested, scope.action, scope.binding)
        if ('failure' in checked) return checked
        const authorized = await input.access.authorize(
          checked.source.access,
          checked.source.scope,
          'run.advance',
        )
        if (authorized.kind !== 'authorized' || !scopeActive(scope)) return unavailable
        const all = await chain(scope, requested)
        return await runActionBatch({
          request: requested,
          source: checked.source,
          log,
          scope,
          all,
          registry,
          passes: admissionPasses,
          active: () => scopeActive(scope),
          signal,
          trackInvocation: work => track(actualInvocations, work),
        })
      } finally {
        scope.release()
      }
    } catch (error) {
      return error instanceof RunnerFailureSignal ? error.result : unavailable
    }
  }
  function dispatch(request: RunnerDispatchRequest, signal: AbortSignal): Promise<RunnerPassResult>
  function dispatch(request: RunnerActionRequest, signal: AbortSignal): Promise<RunnerActionResult>
  function dispatch(
    request: RunnerDispatchRequest | RunnerActionRequest,
    signal: AbortSignal,
  ): Promise<RunnerPassResult | RunnerActionResult> {
    return isActionDispatch(request)
      ? track(tasks, dispatchAction(request as RunnerActionRequest, signal))
      : single.dispatch(request as RunnerDispatchRequest, signal)
  }
  const runner: LoopExtensionRunnerService = Object.freeze({ dispatch, replay: single.replay })
  return Object.freeze({
    runner,
    admissionPassSource: admissionPasses.source,
    implementations: Object.freeze<RunnerImplementations>({
      registerAdmission(contribution) {
        if (!active()) throw new Error('Runner instance unavailable')
        return registry.registerAdmission(contribution)
      },
      registerBuiltin(name, implementation) {
        if (!active()) throw new Error('Runner instance unavailable')
        return registry.registerBuiltin(name, implementation)
      },
    }) satisfies RunnerImplementations,
    closeAdmission() {
      if (!admitting) return
      admitting = false
      admissionPasses.closeAdmission()
      stop.abort()
      registry.closeAdmission()
    },
    async drain() {
      await Promise.allSettled([...tasks])
      await Promise.allSettled([...actualInvocations])
      await registry.drain()
      await admissionPasses.drain()
    },
  })
}
