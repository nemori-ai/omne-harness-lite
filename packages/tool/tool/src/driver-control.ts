import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeToolOperationId, type ToolFailure } from '@omne-harness/tool-contract'
import type { CallAccess, ToolRecovery, ToolTask } from '@omne-harness/tool-contract/provider'
import type { ToolDependencies } from './construction.ts'
import { digestOf } from './evidence.ts'
import { sameFactValue } from './ledger-facts.ts'
import { matchEnvironmentAdoption } from './environment-adoption.ts'
import { controlFinished } from './ledger-control.ts'

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
  controls,
}: Pick<ToolDependencies<P, B, E>, 'commands' | 'bindings' | 'environments' | 'controls'>) {
  return {
    stop: async (
      access: CallAccess<P>,
      recovery: ToolRecovery,
      task: Extract<ToolTask, { kind: 'stop' }>,
    ): Promise<Outcome<void, ToolFailure>> => {
      const original = recovery.controls.find(item => item.operation === task.control.operation)
      if (original === undefined || !sameFactValue(recovery.start, task.control.start))
        return fail({ kind: 'invalid', field: 'control', reason: 'not-original-execution' })
      if (controlFinished(original.progress)) return succeed(undefined)
      try {
        const binding = await bindings.recover({ ...access, start: task.control.start })
        if ('failure' in binding) return binding
        let progress = await binding.ok.inspectControl(task.control)
        if ('failure' in progress) return progress
        if (progress.ok.kind === 'pending' && original.progress.kind !== 'pending')
          return unavailable('tool-control')
        if (progress.ok.kind === 'pending' && original.progress.kind === 'pending') {
          if (controls === undefined) return unavailable('control-subjects')
          const qualified = await controls.prepareDispatch({
            ...access,
            control: original.operation,
            source: original.source,
          })
          if ('failure' in qualified) return qualified
          if (controlFinished(qualified.ok.progress)) return succeed(undefined)
          if (qualified.ok.progress.kind !== 'pending') return unavailable('tool-control')
          progress = await binding.ok.stop(task.control)
        }
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
