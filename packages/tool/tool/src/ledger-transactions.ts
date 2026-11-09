import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Reply, ToolFailure, ToolOperationId } from '@omne-harness/tool-contract'
import { nextRevision } from './evidence.ts'
import { snapshotOf, type Decision, type Mint, type Snapshot } from './ledger-decider.ts'
import { excluded, excludedSince, withExclusionsRemoved } from './ledger-exclusion.ts'
import type { LedgerDomain, LedgerWrite, ToolLedgerStore } from './ledger-store.ts'

export type Decide<T> = (snapshot: Snapshot, mint: Mint) => Decision<T> | Promise<Decision<T>>

function unavailable(dependency: string, diagnostic: string): Outcome<never, ToolFailure> {
  return fail({ kind: 'unavailable', dependency, diagnostic })
}

function thrown(dependency: string): string {
  return `${dependency} threw an exception; its message is not reported`
}

export function createLedgerTransactions(
  store: Pick<ToolLedgerStore, 'read' | 'commit'>,
  attempts: number,
) {
  const readDomain = async (
    domain: LedgerDomain,
  ): Promise<
    Outcome<Extract<Awaited<ReturnType<typeof store.read>>, { kind: 'complete' }>, ToolFailure>
  > => {
    let result: Awaited<ReturnType<typeof store.read>>
    try {
      result = await store.read(domain)
    } catch {
      return unavailable('ledger-store', thrown('ledger-store'))
    }
    if (result.kind === 'unavailable') return unavailable('ledger-store', result.diagnostic)
    return succeed(result)
  }

  const read = async (domain: LedgerDomain): Promise<Outcome<Snapshot, ToolFailure>> => {
    const result = await readDomain(domain)
    return 'failure' in result ? result : succeed(snapshotOf(domain, result.ok))
  }

  const commit = async (
    domain: LedgerDomain,
    expected: Snapshot['revision'],
    revision: Snapshot['revision'],
    writes: readonly LedgerWrite[],
  ): Promise<Awaited<ReturnType<typeof store.commit>>> => {
    try {
      return await store.commit({ domain, expected, revision, writes })
    } catch {
      return { kind: 'unknown', diagnostic: thrown('ledger-store') }
    }
  }

  const transact = async <T>(
    domain: LedgerDomain,
    operation: ToolOperationId | null,
    decide: Decide<T>,
    unknown: Outcome<T, ToolFailure>,
    since: Snapshot['revision'] | null = null,
  ): Reply<T> => {
    let firstRead = since
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const snapshot = await read(domain)
      if ('failure' in snapshot) return snapshot
      firstRead ??= snapshot.ok.revision
      if (operation !== null && excludedSince(snapshot.ok, operation, firstRead))
        return excluded(operation)
      const revision = nextRevision(snapshot.ok.revision)
      const decision = await decide(snapshot.ok, { revision })
      if (decision.kind === 'reply') return decision.outcome
      const operations = new Set(operation === null ? [] : [operation])
      for (const write of decision.writes) {
        if (write.kind === 'put' && write.record.kind === 'operation')
          operations.add(write.record.operation.operation)
      }
      for (const identity of operations) {
        if (excludedSince(snapshot.ok, identity, firstRead)) return excluded(identity)
      }
      const writes = withExclusionsRemoved(decision.writes, operations)
      const committed = await commit(domain, snapshot.ok.revision, revision, writes)
      if (committed.kind === 'committed') return succeed(decision.value)
      if (committed.kind === 'unknown') return unknown
      if (committed.kind === 'unavailable') return unavailable('ledger-store', committed.diagnostic)
    }
    return unavailable('ledger-store', `${attempts} revision conflicts in a row`)
  }

  return { readDomain, read, commit, transact }
}
