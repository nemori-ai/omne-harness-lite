import type { SQLOutputValue } from 'node:sqlite'
import type { AsyncSqliteDatabase } from '../sqlite/async-database.ts'
import {
  SnapshotFailure,
  type SnapshotStructure,
  type SnapshotTable,
  type SnapshotForeignKey,
} from '@omne-harness-lite/storage'

type Row = Record<string, SQLOutputValue>
function text(row: Row, field: string): string {
  const value = row[field]
  if (typeof value !== 'string') throw new SnapshotFailure('invalid-data')
  return value
}
function integer(row: Row, field: string): number {
  const value = row[field]
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new SnapshotFailure('invalid-data')
  return value
}
function definition(value: SQLOutputValue | undefined): string | null {
  if (value === null) return null
  if (typeof value !== 'string') throw new SnapshotFailure('invalid-data')
  if (Buffer.byteLength(value) > 16_384) throw new SnapshotFailure('capacity')
  return value
}

/** Bounded metadata from the same completed copy; identifiers are bound parameters. */
export async function snapshotStructure(db: AsyncSqliteDatabase): Promise<SnapshotStructure> {
  const tables: SnapshotTable[] = []
  const views: string[] = []
  const triggers: string[] = []
  const schema = await db.all(
    "SELECT type, substr(name,1,129) AS name, length(name) AS name_length, substr(sql,1,16385) AS definition FROM sqlite_schema WHERE type IN ('table','view','trigger') AND name NOT GLOB 'sqlite_*'",
    [],
    65,
  )
  for (const row of schema) {
    if (tables.length + views.length + triggers.length >= 64 || integer(row, 'name_length') > 128)
      throw new SnapshotFailure('capacity')
    const name = text(row, 'name')
    const type = text(row, 'type')
    const sql = definition(row.definition)
    if (sql === null) throw new SnapshotFailure('invalid-data')
    if (type === 'view') {
      views.push(name)
      continue
    }
    if (type === 'trigger') {
      triggers.push(name)
      continue
    }
    const columns = await tableColumns(db, name)
    const indexes = await tableIndexes(db, name)
    const foreignKeys = await tableForeignKeys(db, name)
    tables.push({ name, definition: sql, columns, indexes, foreignKeys })
  }
  return { tables, views, triggers }
}

async function tableColumns(
  db: AsyncSqliteDatabase,
  name: string,
): Promise<SnapshotTable['columns']> {
  const columns: SnapshotTable['columns'][number][] = []
  for (const column of await db.all(
    'SELECT name,type,"notnull",pk FROM pragma_table_xinfo(?)',
    [name],
    129,
  )) {
    if (columns.length >= 128) throw new SnapshotFailure('capacity')
    columns.push({
      name: text(column, 'name'),
      type: text(column, 'type'),
      notNull: integer(column, 'notnull') === 1,
      primaryKeyPosition: integer(column, 'pk'),
    })
  }
  return columns
}

async function tableIndexes(
  db: AsyncSqliteDatabase,
  name: string,
): Promise<SnapshotTable['indexes']> {
  const indexes: SnapshotTable['indexes'][number][] = []
  for (const index of await db.all(
    'SELECT substr(name,1,129) AS name,length(name) AS name_length,"unique",partial FROM pragma_index_list(?)',
    [name],
    129,
  )) {
    if (indexes.length >= 128) throw new SnapshotFailure('capacity')
    if (integer(index, 'name_length') > 128) throw new SnapshotFailure('capacity')
    const indexName = text(index, 'name')
    const parts: (string | null)[] = []
    for (const part of await db.all(
      'SELECT name FROM pragma_index_xinfo(?) WHERE key=1 ORDER BY seqno',
      [indexName],
      129,
    )) {
      if (parts.length >= 128) throw new SnapshotFailure('capacity')
      parts.push(part.name === null ? null : text(part, 'name'))
    }
    const record = await db.get(
      "SELECT substr(sql,1,16385) AS definition FROM sqlite_schema WHERE type='index' AND name=?",
      [indexName],
    )
    if (record === undefined) throw new SnapshotFailure('invalid-data')
    indexes.push({
      name: indexName,
      unique: integer(index, 'unique') === 1,
      partial: integer(index, 'partial') === 1,
      columns: parts,
      definition: definition(record.definition),
    })
  }
  return indexes
}

async function tableForeignKeys(
  db: AsyncSqliteDatabase,
  name: string,
): Promise<readonly SnapshotForeignKey[]> {
  const keys = new Map<
    number,
    { table: string; from: string[]; to: (string | null)[]; onUpdate: string; onDelete: string }
  >()
  for (const row of await db.all(
    'SELECT * FROM pragma_foreign_key_list(?) ORDER BY id,seq',
    [name],
    128 * 128 + 1,
  )) {
    const id = integer(row, 'id')
    let key = keys.get(id)
    if (key === undefined) {
      if (keys.size >= 128) throw new SnapshotFailure('capacity')
      key = {
        table: text(row, 'table'),
        from: [],
        to: [],
        onUpdate: text(row, 'on_update'),
        onDelete: text(row, 'on_delete'),
      }
      keys.set(id, key)
    }
    if (key.from.length >= 128) throw new SnapshotFailure('capacity')
    key.from.push(text(row, 'from'))
    key.to.push(row.to === null ? null : text(row, 'to'))
  }
  return [...keys.values()]
}
