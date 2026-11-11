// @module-tag slow
// Tool commits on the real SQLite provider keep no SQL receipt (sql-contract §3.1, acceptance C10):
// the ledger recognises its own outcomes from its records and the body store from its manifests,
// so a whole call (admission, preparation, start, final with an offloaded body, settlement) adds
// no row to `_sql_receipt` of the tenant database.
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { createSqlToolLedgerStore } from '@omne-harness/tool-storage-sql'
import { TENANT_A } from './fixtures/app.ts'
import { settledOffloaded } from './fixtures/settled-offloaded.ts'
import { openStorage } from './windows-composition/storage.ts'

function receipts(root: string, transactionDomain: string): number {
  const file = join(root, 'domains', `${Buffer.from(transactionDomain).toString('hex')}.sqlite`)
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return (db.prepare('select count(*) as n from _sql_receipt').get() as { n: number }).n
  } finally {
    db.close()
  }
}

it('a settled call with an offloaded body adds no SQL receipt to the tenant database', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-receipts-')))
  try {
    const opened = await openStorage(root, [TENANT_A], { maxCommandBytes: 1_048_576 })
    try {
      const domain = 'windows-tool-0'
      let commits = 0
      const storage = {
        ...opened.storage,
        commit: async (...args: Parameters<typeof opened.storage.commit>) => {
          commits += 1
          return opened.storage.commit(...args)
        },
      }
      const options = { storage, domains: opened.domains, combination: opened.combination }
      const before = receipts(root, domain)
      const live = await settledOffloaded(
        { store: createSqlToolLedgerStore(options), options },
        TENANT_A,
      )
      expect(live.value.original.kind).toBe('offloaded')
      // Admission, preparation, start, the body (chunks and seal), the final and the settlement.
      expect(commits).toBeGreaterThanOrEqual(8)
      expect(receipts(root, domain)).toBe(before)
    } finally {
      await opened.close()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
