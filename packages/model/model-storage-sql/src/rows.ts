// Writing rows of the Model tables inside the participant: one cell conversion, one insert, one
// upsert by key.
import { packText, type ParticipantPort, type SqlValue } from '@omne-harness/sql-contract/worker'
import type { Row } from './documents.ts'
import type { Table } from './schema.ts'

export const columnNames = (table: Table): readonly string[] => table.columns.map(item => item.name)

export function cellValue(table: Table, row: Row, name: string): SqlValue {
  const cell = row[name] ?? null
  const kind = table.columns.find(item => item.name === name)?.kind
  if (kind === 'int' && typeof cell === 'number') return BigInt(cell)
  return kind === 'json' && typeof cell === 'string' ? packText(cell) : cell
}

export function insert(port: ParticipantPort, table: Table, row: Row, onConflict: string): bigint {
  const names = columnNames(table)
  return port.execute(
    `INSERT INTO ${table.name} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')}) ${onConflict}`,
    names.map(name => cellValue(table, row, name)),
  ).changes
}

/** Writes each row over the one with its key; a `kept` column keeps its stored value when the new one is null. */
export function upsertRows(
  port: ParticipantPort,
  table: Table,
  rows: readonly Row[],
  kept: readonly string[] = [],
): void {
  const set = columnNames(table)
    .filter(name => !table.primaryKey.includes(name))
    .map(name =>
      kept.includes(name)
        ? `${name} = COALESCE(excluded.${name}, ${table.name}.${name})`
        : `${name} = excluded.${name}`,
    )
  const upsert = `ON CONFLICT (${table.primaryKey.join(', ')}) DO UPDATE SET ${set.join(', ')}`
  for (const row of rows) insert(port, table, row, upsert)
}
