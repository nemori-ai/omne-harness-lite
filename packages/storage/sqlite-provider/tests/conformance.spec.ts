// The conformance suite of the SQL contract, run against the SQLite provider. The suite covers
// C01 to C07, C12, C14 and C16 only. The other scenarios belong to later closures of the provider.
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, it } from 'vitest'
import { runSqlStorageConformance } from '@omne-harness/sql-contract/testing'
import { createSqliteStorage } from '../src/index.ts'
import { defaultConfig, leases } from './support.ts'

const roots: string[] = []

afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

describe('conformance', () => {
  it('passes the contract suite with the SQLite provider', async () => {
    await runSqlStorageConformance({
      durability: 'process',
      async create({ materials }) {
        const root = await realpath(await mkdtemp(join(tmpdir(), 'sqlite-conformance-')))
        roots.push(root)
        const created = await createSqliteStorage({
          config: defaultConfig(join(root, 'storage')),
          materials,
          closeLeases: leases,
        })
        if (created.kind !== 'created') throw new Error(created.problems.join('; '))
        return created
      },
    })
  }, 120_000)
})
