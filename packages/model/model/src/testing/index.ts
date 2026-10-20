import {
  createScriptedTransport,
  type ScriptedTransportScript,
} from '@omne-harness/model-contract/testing'
import type { ModelDependencies } from '../runtime.ts'
import { createManualModelClock } from './clock.ts'
import { createMemoryInstanceHost } from './host.ts'
import { memoryAssembly } from './memory.ts'
import { createMemoryRetryPolicy } from './retry.ts'
import { scriptedSendResources, type TestSendPlan } from './send.ts'
import { createModelSendBoundary, type ModelSendBoundaryOptions } from '../send.ts'
import type { CredentialPort } from '@omne-harness/model-contract'
import type { MemoryModelCommandsOptions, MemorySendSource } from './types.ts'

export { createMemoryModelCommands } from './memory.ts'
export type {
  MemorySendSource,
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
    sending?: Readonly<{
      credentials: CredentialPort
      sources: readonly MemorySendSource<P>[]
      maxRetainedAttempts: number
    }>
  }>
export function createTestModelDependencies<P>(options: TestModelDependenciesOptions<P>) {
  const clock = createManualModelClock(options.start, options.maxWaiters)
  const memory = memoryAssembly({ ...options, clock: clock.clock })
  const scripted = scriptedSendResources<P, ScriptedTransportScript>(
    options.sends,
    createScriptedTransport,
    async input => {
      const current = await memory.commands.loadRecovery(input)
      return 'ok' in current ? current.ok.admission : null
    },
  )
  const coordinator = memory.store.sendCoordinator(options.sending?.sources ?? [])
  const createSender = (overrides: Partial<ModelSendBoundaryOptions<P>> = {}) =>
    createModelSendBoundary({
      commands: memory.commands,
      coordinator,
      credentials: options.sending?.credentials ?? {
        present: () => ({ kind: 'unavailable' }),
        resolve: () => ({ kind: 'unavailable' }),
      },
      resources: scripted.resources,
      maxRetainedAttempts: options.sending?.maxRetainedAttempts ?? 1,
      ...overrides,
    })
  const send = createSender()
  const retry = createMemoryRetryPolicy(memory.store)
  const instances = createMemoryInstanceHost(memory.store, options.maxQueued)
  const dependencies = {
    commands: memory.commands,
    send,
    retry: retry.retry,
    instances: instances.host,
    clock: clock.clock,
  } satisfies ModelDependencies<P>
  return {
    dependencies,
    controls: {
      commands: memory.control,
      send: { ...scripted.control, createSender, coordinator },
      retry: retry.control,
      instances: instances.control,
      clock: clock.control,
    },
  }
}
