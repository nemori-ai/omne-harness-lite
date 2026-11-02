// A migration may create an index on a table of its owner (SPEC 5.4). SQLite raises SQLITE_REINDEX
// for CREATE INDEX, so the migration authorizer must allow that action.
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { SqlGateway, migrationDecision } from '../src/worker/ports.ts'
import {
  DOMAIN,
  buildMaterials,
  createProvider,
  digestOf,
  kindOf,
  makeWorkspace,
  registration,
  type Built,
  type Provider,
  type Workspace,
} from './support.ts'

let workspace: Workspace
let provider: Provider | null = null

beforeEach(async () => {
  workspace = await makeWorkspace()
})

afterEach(async () => {
  await provider?.control.close({ initiator: 'disposal' }).catch(() => undefined)
  provider = null
  await workspace.remove()
})

const INDEX_MIGRATION = `
export default {
  owner: 'ledger', id: '0001-base',
  up(port) {
    port.execute('create table t_ledger(id integer primary key autoincrement, note text not null)', [])
    port.execute('create index t_ledger_note_idx on t_ledger(note)', [])
  },
  verify(port) { port.execute('select count(*) from t_ledger', []); return { kind: 'verified' } },
}
`

/** The base materials with the ledger migration replaced by one that also creates an index. */
async function withIndexMigration(): Promise<Built> {
  const base = await buildMaterials(workspace)
  const file = join(workspace.materialsDir, 'migration-ledger-index.mjs')
  await writeFile(file, INDEX_MIGRATION, 'utf8')
  const checksum = createHash('sha256').update(INDEX_MIGRATION, 'utf8').digest('hex')
  const moduleUrl = new URL(`file:///${file.replaceAll('\\', '/')}`).href
  const catalog: SqlMaterialCatalog = {
    ...base.catalog,
    migrations: base.catalog.migrations.map(item =>
      item.owner === 'ledger' ? { ...item, moduleUrl, checksum } : item,
    ),
  }
  return { catalog, files: base.files, digest: participants => digestOf(catalog, participants) }
}

describe('index creation in a migration', () => {
  it('succeeds: the domain registers and the index exists in the file', async () => {
    const built = await withIndexMigration()
    provider = await createProvider(workspace, built)
    const result = await provider.storage.registerCombination(registration(built))
    expect(kindOf(result)).toBe('registered')
    await provider.control.close({ initiator: 'disposal' })
    provider = null
    const file = join(
      workspace.storageRoot,
      'domains',
      `${Buffer.from(DOMAIN).toString('hex')}.sqlite`,
    )
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      expect(
        db
          .prepare("select name from sqlite_schema where type = 'index' and name = ?")
          .all('t_ledger_note_idx'),
      ).toHaveLength(1)
    } finally {
      db.close()
    }
  })
})

describe('REINDEX in a migration', () => {
  function gatewayOf(owned: readonly string[]): { gateway: SqlGateway; db: DatabaseSync } {
    const db = new DatabaseSync(':memory:')
    db.exec(
      'create table t_a(id integer primary key, v text); create table t_b(id integer primary key, v text);' +
        'create index t_b_v_idx on t_b(v)',
    )
    return { gateway: new SqlGateway(db, migrationDecision(owned, [])), db }
  }

  it('denies REINDEX of an index or a table the owner does not own', () => {
    const { gateway, db } = gatewayOf(['t_a'])
    try {
      expect(() => gateway.execute('reindex t_b_v_idx', [])).toThrow()
      expect(() => gateway.execute('reindex t_b', [])).toThrow()
      expect(() => gateway.execute('create index t_b_other_idx on t_b(id)', [])).toThrow()
    } finally {
      gateway.close()
      db.close()
    }
  })

  it('allows the REINDEX raised by creating an index on an owned table', () => {
    const { gateway, db } = gatewayOf(['t_a'])
    try {
      expect(() => gateway.execute('create index t_a_v_idx on t_a(v)', [])).not.toThrow()
    } finally {
      gateway.close()
      db.close()
    }
  })
})
