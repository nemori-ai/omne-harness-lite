import { judgePositionedSubject } from '@omne-harness-lite/loop-extension'
import type {
  RunnerDispatchScope,
  RunnerImplementationLease,
  RunnerImplementationRegistry,
  RunnerInvocationResult,
  RunnerPiece,
  RunnerPorts,
} from '@omne-harness-lite/loop-extension-runner'
import type { SessionLog } from '@omne-harness-lite/session-log'
import { OFFICIAL_ADMISSION_NAME } from '@omne-harness-lite/tool-admission'
import { samePosition } from './pass-history.ts'
import { createRunnerLogAdapter } from './run-log.ts'
import { createRunnerReminderLogAdapter } from './reminder-log.ts'

export function captureDependencyPresence(scope: RunnerDispatchScope, active: () => boolean) {
  const readPresence = scope.sources.manifest.dependencyPresence.bind(scope.sources.manifest)
  return async (piece: RunnerPiece): Promise<'present' | 'absent' | 'unavailable'> => {
    if (!active()) return 'unavailable'
    const needs = piece.definition.needs
    if (needs === undefined) return 'present'
    const read = await readPresence(scope.binding.session, needs)
    if (!active() || 'failure' in read) return 'unavailable'
    if (needs.some(name => read.presence[name] !== 'present' && read.presence[name] !== 'absent'))
      return 'unavailable'
    return needs.some(name => read.presence[name] === 'absent') ? 'absent' : 'present'
  }
}

/** Each action has its own captured ordinary leases; physical log ownership remains shared. */
export function createServicePorts(input: {
  readonly log: SessionLog
  readonly scope: RunnerDispatchScope
  readonly all: readonly RunnerPiece[]
  readonly registry: RunnerImplementationRegistry
  readonly active: () => boolean
  readonly trackInvocation: (
    work: Promise<RunnerInvocationResult>,
  ) => Promise<RunnerInvocationResult>
  readonly official?: Pick<RunnerPorts, 'presence' | 'invoke'>
  readonly dependencies?: ReturnType<typeof captureDependencyPresence>
}): RunnerPorts {
  const { log, scope, all, registry, active, trackInvocation, official } = input
  const dependencies = input.dependencies ?? captureDependencyPresence(scope, active)
  const leases = new Map<RunnerPiece, RunnerImplementationLease>()
  const adapter = createRunnerLogAdapter({
    log,
    binding: scope.binding,
    owner: scope.owner,
    subjectForCandidate: scope.subjectForCandidate,
    ...(scope.recordFence === undefined ? {} : { recordFence: scope.recordFence }),
  })
  const reminders = createRunnerReminderLogAdapter({
    log,
    binding: scope.binding,
    owner: scope.owner,
    readMessagePrefix: scope.readMessagePrefix,
  })
  function isOfficial(piece: RunnerPiece) {
    return (
      official !== undefined &&
      piece.definition.position === 'before_action' &&
      piece.definition.name === OFFICIAL_ADMISSION_NAME
    )
  }
  return {
    ...adapter,
    ...scope.ports,
    isActive: active,
    async presence(piece) {
      const present = await dependencies(piece)
      if (present !== 'present') return present
      if (isOfficial(piece)) return official!.presence(piece)
      if (piece.definition.implementation.kind === 'command')
        return scope.ports.commandPresence(piece)
      const captured = registry.capture(piece.definition.implementation.builtinName)
      if ('absent' in captured) return 'absent'
      leases.set(piece, captured)
      return 'present'
    },
    invoke(piece, extensionInput, signal, mode) {
      if (!active()) return Promise.resolve({ kind: 'controlUnavailable' })
      if (isOfficial(piece)) return official!.invoke(piece, extensionInput, signal, mode)
      if (piece.definition.implementation.kind === 'builtin') {
        const lease = leases.get(piece)
        return lease === undefined
          ? Promise.resolve({ kind: 'notStartedUnavailable' })
          : lease.invoke(extensionInput, signal, mode)
      }
      return trackInvocation(
        Promise.resolve().then(() =>
          scope.ports.invokeCommand(piece, extensionInput, signal, mode),
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
        return 'rejected' in subject || !active()
          ? { unavailable: true }
          : all.filter(piece => samePosition(piece.definition, subject.ok))
      },
    },
  }
}
