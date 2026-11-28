import {
  createScriptedTransport,
  type ScriptedTransportScript,
} from '@omne-harness/model-contract/testing'
import type { LiveHosting } from '../live/hosting.ts'
import type { ModelDependencies } from '../runtime.ts'
import { createManualModelClock } from './clock.ts'
import { createMemoryInstanceHost } from './host.ts'
import { memoryAssembly } from './memory.ts'
import { createMemoryRetryPolicy } from './retry.ts'
import { scriptedSendResources, type TestSendPlan } from './send.ts'
import { createModelSendBoundary, type ModelSendBoundaryOptions } from '../send.ts'
import type { CredentialPort } from '@omne-harness/model-contract/provider'
import { fail } from '@omne-harness/operation-result'
import type { MemoryModelCommandsOptions, MemorySendSource } from './types.ts'

export { createMemoryModelCommands } from './memory.ts'
export type {
  MemorySendSource,
  MemoryAction,
  MemoryResource,
  MemoryModelAuthority,
  MemoryModelEvidence,
  MemoryModelLimits,
  ResultPaging,
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
      credentials: CredentialPort<P>
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
  const coordinator = memory.sendCoordinator(options.sending?.sources ?? [])
  const createSender = (overrides: Partial<ModelSendBoundaryOptions<P>> = {}) =>
    createModelSendBoundary({
      commands: memory.commands,
      coordinator,
      credentials: options.sending?.credentials ?? {
        layerOf: () => fail({ kind: 'unavailable' }),
        resolve: () => fail({ kind: 'unavailable' }),
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
    live: testLiveHosting(),
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
/** Live hosting for a test that runs no live call of its own: every delivery is saved at once. */
export function testLiveHosting(overrides: Partial<LiveHosting> = {}): LiveHosting {
  return {
    events: { deliver: async () => 'saved', exited: () => {} },
    capacity: 64,
    deadlines: { openMs: 5000, closeMs: 6000, drainMs: 7000, redeliverMs: 10 },
    ...overrides,
  }
}
export { createModelCommandsCore, modelCommands } from '../commands/index.ts'
export type {
  CommandWrite,
  ModelCommandCore,
  ModelCommandStorage,
  ModelCommandsCoreOptions,
} from '../commands/index.ts'
export {
  ACCOUNT_OBLIGATIONS,
  checkCommandsAccounts,
  type AccountObligation,
  type AccountObligationResult,
  type CommandsAccountsOptions,
  type CommandsAccountsReport,
  type CommandsAccountsSubject,
} from './accounts.ts'
