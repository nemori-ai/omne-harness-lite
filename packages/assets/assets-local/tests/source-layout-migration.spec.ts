import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { MigrationPort } from '@omne-harness/sql-contract/worker'
import migration from '../src/source-layout-migration.ts'
import { ownerSources } from './sources.ts'

it('preserves holding history through a paged migration, restart and repeated execution without guessing source identity', () => {
  const directory = new URL('../../../../tmp/closures/asset-source-migrations/', import.meta.url)
  mkdirSync(directory, { recursive: true })
  const root = mkdtempSync(directory.pathname + 'case-')
  const path = join(root, 'data.sqlite')
  let db = new DatabaseSync(path)
  const pages: number[] = []
  const port: MigrationPort = {
    execute(sql, values) {
      const statement = db.prepare(sql)
      statement.setReadBigInts(true)
      const params = values.map(value => (typeof value === 'boolean' ? Number(value) : value))
      const columns = statement.columns().map(column => column.name)
      if (columns.length) {
        const rows = statement.all(...params).map(row => columns.map(column => row[column] ?? null))
        pages.push(rows.length)
        return { columns, rows, changes: 0n, lastInsertRowid: null }
      }
      const result = statement.run(...params)
      return {
        columns,
        rows: [],
        changes: BigInt(result.changes),
        lastInsertRowid: BigInt(result.lastInsertRowid),
      }
    },
  }
  try {
    db.exec(
      'CREATE TABLE al_holdings (scope_key TEXT NOT NULL, holding_ref TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(scope_key, holding_ref))',
    )
    const originals = Array.from({ length: 130 }, (_, n) => ({
      domain: { scope: { kind: 'tenant', tenant: `tenant-${n % 2}` }, transactionDomain: 'assets' },
      holdingRef: `holding-${n}`,
      scopeRef: `tenant-${n % 2}`,
      assetRef: 'asset',
      category: 'service',
      name: 'example',
      revision: n,
      ownerRevision: n + 1,
      state: n % 3 === 0 ? 'removed' : 'held',
      enabled: false,
      selection: { kind: 'pinned', version: '1' },
      sourceIds: ['organization'],
      grants: [{ sourceId: 'organization', actions: ['set'] }],
    }))
    for (const record of originals)
      db.prepare('INSERT INTO al_holdings VALUES (?, ?, ?)').run(
        record.scopeRef,
        record.holdingRef,
        JSON.stringify(record),
      )
    expect(migration.verify(port).kind).toBe('failed')
    pages.length = 0
    migration.up(port)
    expect(pages).toEqual([64, 64, 2])
    expect(migration.verify(port)).toEqual({ kind: 'verified' })
    const before = db.prepare('SELECT * FROM al_holdings ORDER BY scope_key, holding_ref').all()
    migration.up(port)
    expect(db.prepare('SELECT * FROM al_holdings ORDER BY scope_key, holding_ref').all()).toEqual(
      before,
    )
    db.close()
    db = new DatabaseSync(path)
    for (const { sourceIds, ...rest } of originals) {
      const raw = db
        .prepare('SELECT record FROM al_holdings WHERE scope_key = ? AND holding_ref = ?')
        .get(rest.scopeRef, rest.holdingRef)?.record
      expect(JSON.parse(String(raw))).toEqual({
        ...rest,
        sourceLayout: { kind: 'unmapped', sourceIds },
      })
    }
    const { sourceIds: _ids, ...first } = originals[0]!
    const mapped = {
      ...first,
      sourceLayout: { kind: 'bound', sources: ownerSources('organization') },
    }
    db.prepare('UPDATE al_holdings SET record = ? WHERE scope_key = ? AND holding_ref = ?').run(
      JSON.stringify(mapped),
      first.scopeRef,
      first.holdingRef,
    )
    migration.up(port)
    expect(
      JSON.parse(
        String(
          db
            .prepare('SELECT record FROM al_holdings WHERE scope_key = ? AND holding_ref = ?')
            .get(first.scopeRef, first.holdingRef)?.record,
        ),
      ),
    ).toEqual(mapped)
    db.prepare('UPDATE al_holdings SET record = ? WHERE scope_key = ? AND holding_ref = ?').run(
      JSON.stringify({ ...mapped, sourceLayout: { kind: 'bound', sources: [] } }),
      first.scopeRef,
      first.holdingRef,
    )
    expect(migration.verify(port).kind).toBe('failed')
    expect(() => migration.up(port)).toThrow()
  } finally {
    db.close()
    rmSync(root, { recursive: true, force: true })
  }
})
