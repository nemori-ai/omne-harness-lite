// The generation memory of the Journal commit (SPEC 生产提供者的实现现状, step 6) is per storage
// operation: its key is the whole identity but the generation. Two scopes may share a transaction
// domain (sql-contract registers per scope and domain), so the memory of one tenant's operation
// does not move the first generation of another tenant's operation of the same name.
import type { DomainRef, SqlIdentity, SqlStorage } from '@omne-harness/sql-contract'
import { describe, expect, it } from 'vitest'
import { commitJournal, type JournalCombination } from '../src/journal-commit.ts'

const domain = (tenant: string): DomainRef => ({
  scope: { kind: 'tenant', tenant },
  transactionDomain: 'shared-domain',
})

/**
 * A storage whose generations below `rolledBackBelow` are rolled back receipts of earlier calls;
 * it records every commit it is sent.
 */
function storage(rolledBackBelow: number, commitAnswer: 'committed' | 'unknown') {
  const sent: string[] = []
  const generation = (identity: SqlIdentity) => Number(identity.operationKey.split('#')[1])
  const fake = {
    commit({ identity }: { identity: SqlIdentity }) {
      sent.push(identity.operationKey)
      if (generation(identity) < rolledBackBelow)
        return Promise.resolve({ kind: 'rolled_back', responses: [], recalled: true })
      return Promise.resolve(
        commitAnswer === 'committed'
          ? { kind: 'committed', responses: [], recalled: false }
          : { kind: 'unknown', diagnostic: 'the answer was lost' },
      )
    },
  }
  return { storage: fake as unknown as SqlStorage, sent }
}

const combination = {} as JournalCombination

describe('the generation memory of the Journal commit', () => {
  it('keeps one tenant memory out of another tenant operation of the same name and domain', async () => {
    const generations = new Map<string, number>()
    const a = storage(3, 'unknown')
    await commitJournal({
      storage: a.storage,
      domain: domain('tenant-a'),
      combination,
      operation: 'op',
      commands: [],
      generations,
    })
    expect(a.sent).toEqual(['op#1', 'op#2', 'op#3'])
    expect(generations.size).toBe(1)

    const b = storage(1, 'committed')
    await commitJournal({
      storage: b.storage,
      domain: domain('tenant-b'),
      combination,
      operation: 'op',
      commands: [],
      generations,
    })
    expect(b.sent).toEqual(['op#1'])
  })
})
