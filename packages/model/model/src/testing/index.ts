import {
  createScriptedTransport,
  type ScriptedTransportScript,
} from '@omne-harness/model-contract/testing'
import type { ModelDependencies } from '../runtime.ts'
import { createManualModelClock } from './clock.ts'
import { createMemoryInstanceHost } from './host.ts'
import { memoryAssembly } from './memory.ts'
import { createMemoryRetryPolicy } from './retry.ts'
import { createMemorySend, type TestSendPlan } from './send.ts'
import type { MemoryModelCommandsOptions } from './types.ts'

export { createMemoryModelCommands } from './memory.ts'
export type {
  MemoryAction,
  MemoryResource,
  MemoryModelAuthority,
  MemoryModelEvidence,
  MemoryModelLimits,
  MemoryModelCommandsOptions,
  MemoryModelControl,
  MemoryWriteMethod,
  UnknownInjection,
  EvidenceContext,
} from './types.ts'
export type TestModelSendPlan = TestSendPlan<ScriptedTransportScript>
export type TestModelDependenciesOptions<P> = Omit<MemoryModelCommandsOptions<P>, 'clock'> &
  Readonly<{
    start: string
    maxWaiters: number
    maxQueued: number
    sends: readonly TestModelSendPlan[]
  }>
export function createTestModelDependencies<P>(options: TestModelDependenciesOptions<P>) {
  const clock = createManualModelClock(options.start, options.maxWaiters)
  const memory = memoryAssembly({ ...options, clock: clock.clock })
  const send = createMemorySend(
    memory.store,
    memory.commands,
    options.sends,
    createScriptedTransport,
  )
  const retry = createMemoryRetryPolicy(memory.store)
  const instances = createMemoryInstanceHost(memory.store, options.maxQueued)
  const dependencies = {
    commands: memory.commands,
    send: send.send,
    retry: retry.retry,
    instances: instances.host,
    clock: clock.clock,
  } satisfies ModelDependencies<P>
  return {
    dependencies,
    controls: {
      commands: memory.control,
      send: send.control,
      retry: retry.control,
      instances: instances.control,
      clock: clock.control,
    },
  }
}
