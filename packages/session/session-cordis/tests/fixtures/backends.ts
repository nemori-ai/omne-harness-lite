import type {
  CommitReceipt,
  GuardCommand,
  SessionAccessCheck,
  SessionCommand,
  SessionDelegatedTransactions,
  SessionNotifier,
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
  register(notifier: SessionNotifier): () => void
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

export const memoryBackend: BackendFactory = {
  name: 'memory pair',
  open: accessCheck => {
    const initialization = createMemoryInitializationSource()
    const { transactions, delegated } = createMemorySessionTransactionPair<string>({
      initialization,
      history: createMemorySessionHistorySource(),
      accessCheck,
    })
    const notifiers = new Set<SessionNotifier>()
    const receiptOf = (value: object): CommitReceipt | null =>
      'receipt' in value
        ? (value.receipt as CommitReceipt)
        : 'recovered' in value
          ? (value as CommitReceipt)
          : null
    const told = <C extends SessionTransactionPort<string>['commit']>(commit: C): C =>
      (async input => {
        const answer = await commit(input)
        const receipt = 'ok' in answer ? receiptOf(answer.ok) : null
        if (receipt !== null && !receipt.recovered)
          for (const notifier of notifiers)
            void notifier.committed({
              tenant: input.access.tenant,
              session: input.command.input.session,
              revision: receipt.revision,
              source: receipt.source,
              kinds: [],
            })
        return answer
      }) as C
    return Promise.resolve({
      name: 'memory pair',
      transactions: { ...transactions, commit: told(transactions.commit.bind(transactions)) },
      delegated: {
        bind: checked => {
          const view = delegated.bind(checked)
          return { ...view, commit: told(view.commit.bind(view)) }
        },
      },
      register: notifier => {
        const entry = { committed: notifier.committed.bind(notifier) }
        notifiers.add(entry)
        return () => {
          notifiers.delete(entry)
        }
      },
      initializationGuards: async command => {
        initialization.controls.register(command, fixtureInitializationGuard(command))
        return succeeded(await initialization.prepare(command), 'initialization source')
      },
      dispose: () => Promise.resolve(),
    })
  },
}
