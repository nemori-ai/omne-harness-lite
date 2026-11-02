// The storage under the session provider in a test: a public port and a delegated entry over one
// store, built with the access check of the test so that the service and the port share it. The
// in-memory pair of session-contract is here; the real SQL pair is in `sql-backend.ts`.
import type {
  GuardCommand,
  SessionAccessCheck,
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
  /** The initialization material this store accepts for `command`, as the evidence bridge hands it over. */
  initializationGuards(command: InitializationCommand): Promise<readonly GuardCommand[]>
  dispose(): Promise<void>
}>

export type BackendFactory = Readonly<{
  name: string
  open(accessCheck: SessionAccessCheck<string>): Promise<Backend>
}>

/** The adopted fixture facts of a create, as the initialization source of the assembly gives them. */
export function fixtureInitializationGuard(command: InitializationCommand): GuardCommand {
  if (command.kind !== 'create') throw new Error('the fixture registers create only')
  return initializationFixtureGuard(
    initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
  )
}

export const memoryBackend: BackendFactory = {
  name: 'memory pair',
  open: accessCheck => {
    const initialization = createMemoryInitializationSource()
    const { transactions, delegated } = createMemorySessionTransactionPair<string>({
      initialization,
      history: createMemorySessionHistorySource(),
      accessCheck,
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
