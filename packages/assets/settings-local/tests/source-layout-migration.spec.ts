import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { MigrationPort } from '@omne-harness/sql-contract/worker'
import stateMigration from '../src/source-layout-migration.ts'
import targetMigration from '../src/standalone-source-layout-migration.ts'
import { command, definition, definitionRef } from './world.ts'
import { ownerSources } from './sources.ts'

function portFor(db: DatabaseSync, pages: number[]): MigrationPort {
  return {
    execute(sql, values) {
      const statement = db.prepare(sql)
      statement.setReadBigInts(true)
      const columns = statement.columns().map(column => column.name)
      const params = values.map(value => (typeof value === 'boolean' ? Number(value) : value))
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
}

it.each(['state', 'target'] as const)(
  'migrates old %s records without inventing authority and retains them after reopen',
  kind => {
    const directory = new URL(
      '../../../../tmp/closures/settings-source-migrations/',
      import.meta.url,
    )
    mkdirSync(directory, { recursive: true })
    const root = mkdtempSync(directory.pathname + 'case-')
    const path = join(root, 'data.sqlite')
    const table = kind === 'state' ? 'st_states' : 'st_targets'
    const migration = kind === 'state' ? stateMigration : targetMigration
    const state = {
      revision: 7,
      sources: [
        {
          id: 'organization',
          values: [{ itemId: 'enabled', value: { kind: 'value', value: true }, locked: false }],
        },
      ],
    }
    const legacy =
      kind === 'state'
        ? {
            scope: { kind: 'tenant', tenant: 'tenant-a' },
            target: command().target,
            definitionRef,
            state,
          }
        : {
            retired: true,
            projection: {
              target: command().target,
              enabled: false,
              definition,
              definitionRef,
              sourceIds: ['organization'],
              grants: [{ sourceId: 'organization', actions: ['set'] }],
              ownerRevision: 9,
            },
          }
    let db = new DatabaseSync(path)
    try {
      db.exec(
        `CREATE TABLE ${table} (target_key TEXT PRIMARY KEY, record TEXT NOT NULL); CREATE TABLE st_operations (record TEXT NOT NULL)`,
      )
      db.prepare('INSERT INTO st_operations VALUES (?)').run(
        '{"operation":"original","revision":7}',
      )
      for (let index = 0; index < 130; index++)
        db.prepare(`INSERT INTO ${table} VALUES (?, ?)`).run(
          `target-${String(index).padStart(3, '0')}`,
          JSON.stringify(legacy),
        )
      const pages: number[] = [],
        port = portFor(db, pages)
      expect(migration.verify(port).kind).toBe('failed')
      pages.length = 0
      migration.up(port)
      expect(pages).toEqual([64, 64, 2])
      expect(migration.verify(port)).toEqual({ kind: 'verified' })
      const before = db.prepare(`SELECT * FROM ${table} ORDER BY target_key`).all()
      migration.up(port)
      expect(db.prepare(`SELECT * FROM ${table} ORDER BY target_key`).all()).toEqual(before)
      db.close()
      db = new DatabaseSync(path)
      const raw = db
        .prepare(`SELECT record FROM ${table} WHERE target_key = ?`)
        .get('target-129')?.record
      if (typeof raw !== 'string') throw new Error('missing migrated record')
      const record = JSON.parse(raw)
      const layout = { kind: 'unmapped', sourceIds: ['organization'] }
      if (kind === 'state') expect(record).toEqual({ ...legacy, sourceLayout: layout })
      else {
        const projection = record.projection
        expect(projection).not.toHaveProperty('sourceIds')
        expect(projection).toMatchObject({ sourceLayout: layout, ownerRevision: 9, enabled: false })
        expect(record.retired).toBe(true)
      }
      expect(db.prepare('SELECT record FROM st_operations').get()?.record).toBe(
        '{"operation":"original","revision":7}',
      )
      const migrated = kind === 'state' ? record : record.projection
      migrated.sourceLayout = { kind: 'bound', sources: ownerSources('organization') }
      db.prepare(`UPDATE ${table} SET record = ? WHERE target_key = ?`).run(
        JSON.stringify(record),
        'target-129',
      )
      migration.up(portFor(db, []))
      expect(
        JSON.parse(
          String(
            db.prepare(`SELECT record FROM ${table} WHERE target_key = ?`).get('target-129')
              ?.record,
          ),
        ),
      ).toEqual(record)
      migrated.sourceLayout = { kind: 'bound', sources: [] }
      db.prepare(`UPDATE ${table} SET record = ? WHERE target_key = ?`).run(
        JSON.stringify(record),
        'target-129',
      )
      expect(migration.verify(portFor(db, [])).kind).toBe('failed')
      expect(() => migration.up(portFor(db, []))).toThrow()
    } finally {
      db.close()
      rmSync(root, { recursive: true, force: true })
    }
  },
)
