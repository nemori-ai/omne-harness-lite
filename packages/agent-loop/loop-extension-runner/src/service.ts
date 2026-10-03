import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { copyJsonValue, isJsonNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { judgePositionedSubject, type PositionedSubject } from '@omne-harness-lite/loop-extension'
import type { SessionLog } from '@omne-harness-lite/session-log-jsonl'
import {
  createRunnerImplementationRegistry,
  type RunnerImplementationLease,
  type RunnerImplementations,
} from './implementation-registry.ts'
import {
  RunnerFailureSignal,
  type RunnerReplayFailure,
  readPassConclusions,
  samePosition,
  validateHistoryScope,
} from './pass-history.ts'
import { passKeys } from './keys.ts'
import { createRunnerLogAdapter } from './run-log.ts'
import { createRunnerReminderLogAdapter } from './reminder-log.ts'
import { readRunnerChain } from './runner-chain.ts'
import {
  runPass,
  type RunnerPass,
  type RunnerPiece,
  type RunnerInvocationResult,
} from './run-pass.ts'
import type {
  LoopExtensionRunnerService,
  RunnerDispatchRequest,
  RunnerReplayRequest,
  RunnerServiceHost,
  RunnerReadScope,
} from './service-types.ts'

export interface RunnerServiceInstance {
  readonly runner: LoopExtensionRunnerService
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
):
  | { readonly initial: PositionedSubject; readonly request: RunnerDispatchRequest }
  | RunnerReplayFailure {
  const copied = copyJsonValue(value)
  if ('failed' in copied) return invalidInput
  // Narrow only within this validator; all used members are judged before returning.
  value = copied.ok as unknown as RunnerReplayRequest
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
    return invalidInput
  const initial = judgePositionedSubject({
    position: value.position,
    subject: value.subject,
    ...(value.dimension === undefined ? {} : { dimension: value.dimension }),
  })
  if ('rejected' in initial)
    return initial.rejected === 'position_unknown' ? { failure: 'positionUnknown' } : invalidInput
  validateHistoryScope(
    {
      initial: initial.ok,
      anchor: value.anchor,
      ...(value.run === undefined ? {} : { run: value.run }),
    },
    [],
    false,
  )
  if (Object.hasOwn(value, 'run') && value.run === undefined) return invalidInput
  return { initial: initial.ok, request: value }
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
  ].includes(initial.position)
}

/** Shared service assembly. Authorization and physical log ownership remain with the supplied host. */
export function createLoopExtensionRunner(input: {
  readonly log: SessionLog
  readonly host: RunnerServiceHost
  readonly isActive: () => boolean
}): RunnerServiceInstance {
  const { log, host, isActive } = input
  const registry = createRunnerImplementationRegistry()
  const stop = new AbortController()
  let admitting = true
  const tasks = new Set<Promise<unknown>>()
  const actualInvocations = new Set<Promise<unknown>>()
  const active = () => admitting && isActive()
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
  async function chain(scope: RunnerReadScope, requested: RunnerReplayRequest) {
    if (scope.binding.session !== requested.manifest || !scopeActive(scope)) return unavailable
    return readRunnerChain({
      session: requested.manifest,
      binding: scope.binding,
      sources: { ...scope.sources, isActive: () => scopeActive(scope) },
    })
  }
  const runner: LoopExtensionRunnerService = Object.freeze<LoopExtensionRunnerService>({
    dispatch(supplied, callerSignal) {
      return track(
        tasks,
        (async () => {
          try {
            const parsed = request(supplied, true)
            if ('failure' in parsed) return parsed
            const requested = parsed.request
            const attempt = requested.attempt
            if (
              requested.run === undefined
                ? Object.hasOwn(requested, 'attempt')
                : !isJsonNumber(attempt) ||
                  !ExactDecimal.from(attempt).isInteger ||
                  ExactDecimal.from(attempt).compare(ExactDecimal.from(0)) <= 0
            )
              return invalidInput
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
              if ('failure' in all) return all
              if (!scopeActive(scope)) return unavailable
              const leases = new Map<RunnerPiece, RunnerImplementationLease>()
              const dependencyPresence = scope.sources.manifest.dependencyPresence.bind(
                scope.sources.manifest,
              )
              const adapter = createRunnerLogAdapter({
                log,
                binding: scope.binding,
                owner: scope.owner,
                subjectForCandidate: scope.subjectForCandidate,
              })
              const reminders = createRunnerReminderLogAdapter({
                log,
                binding: scope.binding,
                owner: scope.owner,
                readMessagePrefix: scope.readMessagePrefix,
              })
              const result = await runPass(
                pass,
                selected(all, parsed.initial),
                {
                  ...adapter,
                  ...scope.ports,
                  isActive: () => scopeActive(scope),
                  async presence(piece) {
                    if (!scopeActive(scope)) return 'unavailable'
                    if (piece.definition.needs !== undefined) {
                      const needs = piece.definition.needs
                      const read = await dependencyPresence(requested.manifest, needs)
                      if (!scopeActive(scope) || 'failure' in read) return 'unavailable'
                      if (
                        needs.some(
                          name =>
                            read.presence[name] !== 'present' && read.presence[name] !== 'absent',
                        )
                      )
                        return 'unavailable'
                      if (needs.some(name => read.presence[name] === 'absent')) return 'absent'
                    }
                    if (piece.definition.implementation.kind === 'command')
                      return scope.ports.commandPresence(piece)
                    const captured = registry.capture(piece.definition.implementation.builtinName)
                    if ('absent' in captured) return 'absent'
                    leases.set(piece, captured)
                    return 'present'
                  },
                  invoke(
                    piece,
                    extensionInput,
                    invocationSignal,
                    mode,
                  ): Promise<RunnerInvocationResult> {
                    if (!scopeActive(scope)) return Promise.resolve({ kind: 'controlUnavailable' })
                    if (piece.definition.implementation.kind === 'builtin') {
                      const lease = leases.get(piece)
                      return lease === undefined
                        ? Promise.resolve({ kind: 'notStartedUnavailable' })
                        : lease.invoke(extensionInput, invocationSignal, mode)
                    }
                    return track(
                      actualInvocations,
                      Promise.resolve().then(() =>
                        scope.ports.invokeCommand(piece, extensionInput, invocationSignal, mode),
                      ),
                    )
                  },
                  reminders: {
                    ...reminders,
                    async nestedChain(message) {
                      const subject = judgePositionedSubject({
                        position: 'before_persist_message',
                        subject: { producer: 'system', message },
                      })
                      return 'rejected' in subject || !scopeActive(scope)
                        ? { unavailable: true }
                        : selected(all, subject.ok)
                    },
                  },
                },
                signal,
              )
              return active() ? result : unavailable
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
            if ('failure' in parsed) return parsed
            const requested = parsed.request
            if (!active() || !modelPosition(parsed.initial)) return unavailable
            const scope = await host.acquireReplay(requested, stop.signal)
            if ('failure' in scope) return scope
            try {
              if (!scopeActive(scope)) return unavailable
              const all = await chain(scope, requested)
              if ('failure' in all) return all
              const keys = passKeys({
                position: parsed.initial.position,
                ...(parsed.initial.dimension === undefined
                  ? {}
                  : { dimension: parsed.initial.dimension }),
                anchor: requested.anchor,
              })
              if ('invalidInput' in keys) return invalidInput
              const session = parseOpaqueIdentifier(scope.binding.session, 'SessionRef')
              if (
                !('ok' in session) ||
                !scopeActive(scope) ||
                scope.owner.hasUnknown(scope.binding, keys.pass)
              )
                return unavailable
              const read = scope.owner.start({
                kind: 'read',
                execute: () => log.readByKey(session.ok, keys.pass),
              })
              if ('unavailable' in read) return unavailable
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
  return Object.freeze({
    runner,
    implementations: Object.freeze<RunnerImplementations>({
      registerBuiltin(name, implementation) {
        if (!active()) throw new Error('Runner instance unavailable')
        return registry.registerBuiltin(name, implementation)
      },
    }) satisfies RunnerImplementations,
    closeAdmission() {
      if (!admitting) return
      admitting = false
      stop.abort()
      registry.closeAdmission()
    },
    async drain() {
      await Promise.allSettled([...tasks])
      await Promise.allSettled([...actualInvocations])
      await registry.drain()
    },
  })
}
