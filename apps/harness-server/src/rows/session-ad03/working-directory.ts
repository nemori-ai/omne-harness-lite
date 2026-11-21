import { Service, type Context } from '@deepseek-ai/cordis'
import {
  createStepDirectory,
  directoryInForce,
  type StepDirectory,
  type StepDirectoryInput,
  type StepDirectoryPorts,
} from '@omne-harness/session-adapters/cordis'

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
