import type {
  GuardCommand,
  SessionAccessCheck,
  SessionIntakeLimits,
  SessionCommand,
  SessionDelegatedTransactions,
  SessionTransactionPort,
} from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  createMemoryInitializationSource,
  createMemorySessionHistorySource,
  createMemorySessionTransactionPair,
  initializationFixtureFacts,
  initializationFixtureGuard,
  succeeded,
} from '@omne-harness/session-contract/testing'

export type InitializationCommand = Extract<
  SessionCommand,
  { kind: 'create' | 'completeInitialization' }
>

export type Backend = Readonly<{
  name: string
  transactions: SessionTransactionPort<string>
  delegated: SessionDelegatedTransactions<string>
  initializationGuards(command: InitializationCommand): Promise<readonly GuardCommand[]>
  dispose(): Promise<void>
}>

export type BackendFactory = Readonly<{
  name: string
  open(accessCheck: SessionAccessCheck<string>): Promise<Backend>
}>

export function fixtureInitializationGuard(command: InitializationCommand): GuardCommand {
  if (command.kind !== 'create') throw new Error('the fixture registers create only')
  return initializationFixtureGuard(
    initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
  )
}

type MemoryPairOptions = Parameters<typeof createMemorySessionTransactionPair<string>>[0]

export function memoryBackendWithLimits(intakeLimits?: SessionIntakeLimits): BackendFactory {
  return memoryBackendWith(intakeLimits === undefined ? {} : { intakeLimits })
}

export function memoryBackendWith(
  extra: Partial<Omit<MemoryPairOptions, 'accessCheck' | 'initialization' | 'history'>>,
): BackendFactory {
  return {
    name: 'memory pair',
    open: accessCheck => {
      const initialization = createMemoryInitializationSource()
      const { transactions, delegated } = createMemorySessionTransactionPair<string>({
        initialization,
        history: createMemorySessionHistorySource(),
        accessCheck,
        ...extra,
      })
      return Promise.resolve({
        name: 'memory pair',
        transactions,
        delegated,
        initializationGuards: async command => {
          initialization.controls.register(command, fixtureInitializationGuard(command))
          return succeeded(await initialization.prepare(command), 'initialization source')
        },
        dispose: () => Promise.resolve(),
      })
    },
  }
}

export const memoryBackend = memoryBackendWithLimits()
