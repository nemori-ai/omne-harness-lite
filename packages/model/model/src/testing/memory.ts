import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { callCommands, recoveryCommands } from './calls.ts'
import { consumptionCommands } from './consumption.ts'
import { dispatchCommands } from './dispatch.ts'
import { MemoryState } from './state.ts'
import type { MemoryModelCommandsOptions, MemoryModelControl } from './types.ts'

export function createMemoryModelCommands<P>(
  options: MemoryModelCommandsOptions<P>,
): Readonly<{ commands: ModelCommands<P>; control: MemoryModelControl }> {
  const { commands, control } = memoryAssembly(options)
  return { commands, control }
}

export function memoryAssembly<P>(options: MemoryModelCommandsOptions<P>) {
  const store = new MemoryState(options)
  const commands = {
    ...callCommands(store),
    ...recoveryCommands(store),
    ...dispatchCommands(store),
    ...consumptionCommands(store),
  } satisfies ModelCommands<P>
  return { commands, control: store.control, store }
}
