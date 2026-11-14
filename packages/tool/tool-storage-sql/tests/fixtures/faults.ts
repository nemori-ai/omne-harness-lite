import type {
  CommitRequestV2,
  CommitResultV2,
  ReadResult,
  SqlStorage,
} from '@omne-harness/sql-contract'

export type CommitFault =
  | 'rejected'
  | 'unknown-applied'
  | 'unknown-dropped'
  | 'throw-applied'
  | 'delayed'
  | 'interrupted'

export type Intent = 'ledger' | 'chunk' | 'manifest'

export type FaultyStorage = Readonly<{
  storage: SqlStorage
  armCommit(fault: CommitFault, intent?: Intent): void
  armCommitAt(fault: CommitFault, ordinal: number): void
  failNextRead(): void
  land(): Promise<void>
  commits(intent?: Intent): number
}>

const intentOf = (request: CommitRequestV2): string =>
  String(request.commands[0]?.facts['intent'] ?? '')

export function createFaultyStorage(inner: SqlStorage): FaultyStorage {
  const armed: { fault: CommitFault; intent: Intent | undefined }[] = []
  const counted: { fault: CommitFault; ordinal: number }[] = []
  const held: CommitRequestV2[] = []
  const seen: string[] = []
  let readFault = false

  const take = (request: CommitRequestV2): CommitFault | null => {
    for (const item of counted) item.ordinal -= 1
    const due = counted.findIndex(item => item.ordinal === 0)
    if (due !== -1) return counted.splice(due, 1)[0]?.fault ?? null
    const at = armed.findIndex(
      item => item.intent === undefined || item.intent === intentOf(request),
    )
    if (at === -1) return null
    const [item] = armed.splice(at, 1)
    return item?.fault ?? null
  }

  const commit = async (request: CommitRequestV2): Promise<CommitResultV2> => {
    seen.push(intentOf(request))
    const identity = request.identity
    const unknown: CommitResultV2 = { kind: 'unknown', identity, diagnostic: 'injected' }
    switch (take(request)) {
      case null:
        return inner.commit(request)
      case 'rejected':
        return { kind: 'rejected_before_accept', identity, reason: 'queue_full', diagnostic: null }
      case 'unknown-applied':
        await inner.commit(request)
        return unknown
      case 'unknown-dropped':
        return unknown
      case 'throw-applied':
        await inner.commit(request)
        throw new Error('injected: the provider threw after it applied the commit')
      case 'delayed':
        held.push(request)
        return unknown
      case 'interrupted':
        throw new Error('injected: the process stopped before the commit')
    }
  }

  return {
    storage: {
      database: inner.database,
      registerCombination: input => inner.registerCombination(input),
      commit,
      query: identity => inner.query(identity),
      read: (request): Promise<ReadResult> => {
        if (!readFault) return inner.read(request)
        readFault = false
        return Promise.resolve({
          kind: 'unavailable',
          requestKey: request.requestKey,
          reason: 'queue_timeout',
          diagnostic: null,
        })
      },
    },
    armCommit: (fault, intent) => {
      armed.push({ fault, intent })
    },
    armCommitAt: (fault, ordinal) => {
      counted.push({ fault, ordinal })
    },
    failNextRead: () => {
      readFault = true
    },
    land: async () => {
      for (const request of held.splice(0)) await inner.commit(request)
    },
    commits: intent => seen.filter(item => intent === undefined || item === intent).length,
  }
}
