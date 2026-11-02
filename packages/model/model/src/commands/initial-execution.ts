import type { SendCoordinator } from '../send.ts'
import { modelCommands } from './commands.ts'
import {
  initialRunPort,
  type BoundCommandAccess,
  type ModelInitialExecution,
  type ModelInitialRun,
} from './initial.ts'
import type { ModelCommandCore } from './state.ts'

export function createModelInitialExecution<P>(
  input: Readonly<{
    run: ModelInitialRun<P>
    core: ModelCommandCore<P>
    coordinator?: (bound: BoundCommandAccess<P>) => SendCoordinator<P>
  }>,
): ModelInitialExecution<P> {
  if (input.core.options.initialRun !== input.run)
    throw new TypeError('initial execution must share the core initialRun')
  return initialRunPort(input.run).createExecution(
    input.core,
    bound => modelCommands(input.core, bound),
    input.coordinator,
  )
}
