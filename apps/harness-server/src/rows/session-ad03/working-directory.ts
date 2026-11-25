import { Service, type Context } from '@deepseek-ai/cordis'
import type { WorkspaceTargets } from '@omne-harness/session-access'
import {
  createStepDirectory,
  directoryInForce,
  type StepDirectory,
  type StepDirectoryInput,
  type StepDirectoryPorts,
  type WorkingDirectoryTargets,
} from '@omne-harness/session-adapters/cordis'
import { filesScopeOf } from '../workspace-outside-files/reach.ts'
import type { WorkspaceOutsideFilesService } from '../workspace-outside-files/service.ts'

export const sessionWorkingDirectoryKey = 'sessionWorkingDirectory'

type Sources = StepDirectoryPorts<unknown>
type InForceInput = Pick<StepDirectoryInput<unknown>, 'principal' | 'tenant' | 'snapshot'>

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionWorkingDirectory: SessionWorkingDirectory
  }
}

/**
 * The step action that settles the working directory of a session.
 * @owner apps/harness-server/src/rows/session-ad03
 */
export class SessionWorkingDirectory extends Service implements StepDirectory<unknown> {
  readonly refresh: StepDirectory<unknown>['refresh']
  /** The directory a step beginning on this snapshot stands at, worked out as the step does. */
  readonly inForce: (input: InForceInput) => ReturnType<typeof directoryInForce<unknown>>

  constructor(ctx: Context, sources: Sources) {
    super(ctx, sessionWorkingDirectoryKey)
    const step = createStepDirectory<unknown>(sources)
    this.refresh = input => step.refresh(input)
    this.inForce = input => directoryInForce(sources, input)
  }
}

type Verifying = Readonly<{
  check(
    input: Parameters<WorkingDirectoryTargets<unknown>['check']>[0],
  ): ReturnType<WorkspaceTargets['check']>
}>

/** The workspace's verification, and how far file requests reach from the instance under the tenant's setting, read now. */
export function reachingTargets(
  targets: Verifying | undefined,
  outsideFiles: () => Pick<WorkspaceOutsideFilesService, 'read'> | undefined,
): WorkingDirectoryTargets<unknown> | undefined {
  if (targets === undefined) return undefined
  return {
    async check(input) {
      const checked = await targets.check(input)
      switch (checked.kind) {
        case 'refused':
          return checked
        case 'unavailable':
          return {
            kind: 'unavailable',
            diagnostic: 'the workspace owner could not verify the selected instance',
          }
        case 'attachable':
          break
      }
      const reader = outsideFiles()
      if (reader === undefined)
        return {
          kind: 'unavailable',
          diagnostic: 'the row that reads the setting for files outside the workspace is not there',
        }
      const outside = await reader.read(input.tenant)
      if ('failure' in outside)
        return {
          kind: 'unavailable',
          diagnostic: `the setting for files outside the workspace is not readable: ${outside.failure}`,
        }
      return {
        kind: 'attachable',
        directory: checked.directory,
        files: filesScopeOf(outside.ok, checked.directory),
      }
    },
  }
}
