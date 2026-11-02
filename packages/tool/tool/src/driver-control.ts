import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeToolOperationId, type ToolFailure } from '@omne-harness/tool-contract'
import type { CallAccess, ToolRecovery, ToolTask } from '@omne-harness/tool-contract/provider'
import type { ToolDependencies } from './construction.ts'
import { digestOf } from './evidence.ts'
import { sameFactValue } from './ledger-facts.ts'
import { matchEnvironmentAdoption } from './environment-adoption.ts'

function progressOperation(kind: 'control' | 'release', identity: unknown) {
  const operation = decodeToolOperationId(`${kind}-progress:${digestOf(identity)}`)
  if ('failure' in operation) throw new Error('invalid internal progress identity')
  return operation.ok
}

const unavailable = (dependency: string) =>
  fail<ToolFailure>({
    kind: 'unavailable',
    dependency,
    diagnostic: `${dependency} progress remains unconfirmed`,
  })

export function createControlDriver<P, B extends ContentBlock, E>({
  commands,
  bindings,
  environments,
}: Pick<ToolDependencies<P, B, E>, 'commands' | 'bindings' | 'environments'>) {
  return {
    stop: async (
      access: CallAccess<P>,
      recovery: ToolRecovery<B>,
      task: Extract<ToolTask, { kind: 'stop' }>,
    ): Promise<Outcome<void, ToolFailure>> => {
      const original = recovery.controls.find(item => item.operation === task.control.operation)
      if (original === undefined || !sameFactValue(recovery.start, task.control.start))
        return fail({ kind: 'invalid', field: 'control', reason: 'not-original-execution' })
      // Recall also rechecks the caller's current control qualification before propagation.
      const qualified = await commands.control({
        ...access,
        operation: original.operation,
        intent: original.intent,
      })
      if ('failure' in qualified) {
        if (qualified.failure.kind !== 'denied') return qualified
        const progress = { kind: 'unknown', diagnostic: 'control-qualification-recheck' } as const
        const recorded = await commands.recordControl({
          ...access,
          operation: progressOperation('control', { control: task.control, progress }),
          control: original.operation,
          source: original.source,
          progress,
        })
        if ('failure' in recorded) return recorded
        return recorded.ok.progress.kind === 'rejected'
          ? succeed(undefined)
          : unavailable('tool-control')
      }
      try {
        const binding = await bindings.recover({ ...access, start: task.control.start })
        if ('failure' in binding) return binding
        let progress = await binding.ok.inspectControl(task.control)
        if ('failure' in progress) return progress
        if (progress.ok.kind === 'pending' && original.progress.kind !== 'pending')
          return unavailable('tool-control')
        if (progress.ok.kind === 'pending' && original.progress.kind === 'pending')
          progress = await binding.ok.stop(task.control)
        if ('failure' in progress) return progress
        if (!sameFactValue(progress.ok, original.progress)) {
          const saved = await commands.recordControl({
            ...access,
            operation: progressOperation('control', {
              control: task.control,
              progress: progress.ok,
            }),
            control: original.operation,
            source: original.source,
            progress: progress.ok,
          })
          if ('failure' in saved) return saved
        }
        return progress.ok.kind === 'pending' ||
          progress.ok.kind === 'unknown' ||
          progress.ok.kind === 'accepted'
          ? unavailable('tool-control')
          : succeed(undefined)
      } catch {
        return unavailable('tool-control')
      }
    },
    release: async (
      access: CallAccess<P>,
      task: Extract<ToolTask, { kind: 'release' }>,
    ): Promise<Outcome<void, ToolFailure>> => {
      const adopted = matchEnvironmentAdoption(environments, task.release.adoption)
      if ('failure' in adopted) return adopted
      try {
        let progress = await environments.inspectRelease({ ...access, release: task.release })
        if ('failure' in progress) return progress
        if (progress.ok.kind === 'pending')
          progress = await environments.release({ ...access, release: task.release })
        if ('failure' in progress) return progress
        const saved = await commands.recordRelease({
          ...access,
          operation: progressOperation('release', { release: task.release, progress: progress.ok }),
          release: task.release,
          outcome: progress.ok,
        })
        if ('failure' in saved) return saved
        return progress.ok.kind === 'released'
          ? succeed(undefined)
          : unavailable('environment-release')
      } catch {
        return unavailable('environment-release')
      }
    },
  }
}
