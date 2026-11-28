import type { DurableEvidence, HistoryEntry } from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { SqlCell, SqlValue } from '@omne-harness/sql-contract/worker'
import { canonicalText, decodeValue, plainOf, sha256 } from '../codec.ts'
import { readEntryText } from '../entry-codec.ts'
import { packed, rowsOf, text, type Executor, type Row } from './support.ts'

const OWNER = '@omne-harness/session-storage-sql'

export type Planted = Readonly<{
  id: string
  revision: string
  entry: HistoryEntry
  data: Record<string, unknown>
  grant?: DurableEvidence
}>
export type Scope = Readonly<{ tenant: string; session: string }>

export class TooMany extends Error {}

export type Reader = ((sql: string, params: readonly SqlValue[], page?: number) => Row[]) &
  Readonly<{ charge(rows: number): void }>

export function boundedReader(port: Executor, limit: number): Reader {
  let left = limit
  const read = (sql: string, params: readonly SqlValue[], page?: number): Row[] => {
    const cap = page === undefined || page > left ? left + 1 : page
    const rows = rowsOf(port, sql, [...params, BigInt(cap)])
    if (rows.length > left) throw new TooMany()
    left -= rows.length
    return rows
  }
  return Object.assign(read, {
    charge(rows: number) {
      if (rows > left) throw new TooMany()
      left -= rows
    },
  })
}

export const parsed = (cell: SqlCell | undefined): unknown =>
  decodeValue(JSON.parse(text(cell)) as JsonValue)

export function readable(cell: SqlCell | undefined): unknown {
  try {
    return parsed(cell)
  } catch {
    return undefined
  }
}

export const optionalText = (cell: SqlCell | undefined): string | null =>
  cell === null || cell === undefined || text(cell) === '' ? null : text(cell)

export function evidenceOf(value: unknown): DurableEvidence | null {
  if (typeof value !== 'object' || value === null) return null
  const { owner, record, revision, digest } = value as Record<string, unknown>
  return [owner, record, revision, digest].every(part => typeof part === 'string' && part !== '')
    ? ({ owner, record, revision, digest } as DurableEvidence)
    : null
}

export function entryEvidence(
  tenant: string,
  session: string,
  entry: HistoryEntry,
): DurableEvidence {
  return {
    owner: OWNER,
    record: `${tenant}/${session}/entry/${entry.id}`,
    revision: entry.revision,
    digest: `sha256:${sha256(canonicalText(entry))}`,
  }
}

export const rowEvidence = (scope: Scope, row: Planted): DurableEvidence =>
  entryEvidence(scope.tenant, scope.session, row.entry)

export function plant(row: Row, grants?: ReadonlyMap<string, DurableEvidence>): Planted {
  const id = text(row['position'])
  const entry = readEntryText(packed(row['entry']), `sl_entry ${id}`)
  const grant = grants?.get(id)
  return {
    id,
    revision: text(row['revision']),
    entry,
    data: (plainOf(entry.payload) ?? {}) as Record<string, unknown>,
    ...(grant === undefined ? {} : { grant }),
  }
}
