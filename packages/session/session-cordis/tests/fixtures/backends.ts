// The storage under the session provider in a test: a public port and a delegated entry over one
// store, built with the access check of the test so that the service and the port share it. The
// in-memory pair of session-contract is here; the real SQL pair is in `sql-backend.ts`. `register`
// is what the session storage row does on its storage: it registers the notifier that each fresh
// batch of the session log is told to (session-storage-sql SPEC「本批与提交通知」).
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
  /** The initialization material this store accepts for `command`, as the evidence bridge hands it over. */
  initializationGuards(command: InitializationCommand): Promise<readonly GuardCommand[]>
  /** Tells `notifier` each fresh batch of this store from now on; the answer removes it again. */
  register(notifier: SessionNotifier): () => void
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
    // The memory pair has no writer that tells its batches. This stand-in tells each commit that
    // is not a recovery, through either face, with the tenant, session, revision and evidence of
    // the receipt. It knows no entry kinds and names none; no test over this store reads them.
    const notifiers = new Set<SessionNotifier>()
    // A commit answers its receipt, or a value that carries it (a started Run, an adoption).
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
