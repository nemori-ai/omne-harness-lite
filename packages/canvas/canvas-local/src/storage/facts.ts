import type { CanvasFacts } from '@omne-harness/canvas'
import {
  itemSchema,
  pileSchema,
  type CanvasId,
  type Item,
  type Mover,
  type Pile,
} from '@omne-harness/canvas-contract'
import type { QueryRows, SqlValue } from '@omne-harness/sql-contract/worker'
import { ROW_LIMIT } from './schema.ts'

/** What both the participant and the read handler are given: one statement at a time, inside one transaction. */
export type SqlPort = Readonly<{ execute(sql: string, params: readonly SqlValue[]): QueryRows }>

type Row = QueryRows['rows'][number]

/** Runs a SELECT with the row limit. A result that reaches past the limit fails instead of being cut. */
function select(port: SqlPort, sql: string, params: readonly SqlValue[]): QueryRows['rows'] {
  const found = port.execute(`${sql} LIMIT ${ROW_LIMIT + 1}`, params).rows
  if (found.length > ROW_LIMIT) throw new Error('more rows than one statement may return')
  return found
}

/** SQLite gives integers as numbers or as big integers; anything else is not an integer of this table. */
function integer(value: SqlValue | undefined): number {
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'number') return value
  throw new TypeError('a column holds no integer')
}

const nullableText = (value: SqlValue | undefined) => (value === null ? null : String(value))

function moverOf(kind: SqlValue | undefined, session: SqlValue | undefined): Mover {
  return (kind === 'agent' ? { kind, session } : { kind }) as Mover
}

const ITEM_COLUMNS =
  'id, kind, ref, state, x, y, width, height, rank, pile, locked, by_kind, by_session, changed_at'

/** Every stored row is parsed where it is read: a row that does not fit the schema of an item fails the read. */
function itemOf(row: Row): Item {
  const [id, kind, ref, state, x, y, width, height, rank, pile, locked, byKind, bySession, when] =
    row
  return itemSchema.parse({
    id,
    reference: { kind, ref },
    state,
    at: { x: integer(x), y: integer(y) },
    size:
      width === null && height === null ? null : { width: integer(width), height: integer(height) },
    rank: integer(rank),
    pile: nullableText(pile),
    locked: integer(locked) === 1,
    by: moverOf(byKind, bySession),
    when,
  })
}

function pileOf(row: Row): Pile {
  const [id, name, x, y, byKind, bySession, when] = row
  return pileSchema.parse({
    id,
    name: nullableText(name),
    at: { x: integer(x), y: integer(y) },
    by: moverOf(byKind, bySession),
    when,
  })
}

/** One tenant's canvases in SQL. Every statement names the tenant: the rows of no other are read. */
export function sqlFacts(port: SqlPort, tenant: string): CanvasFacts {
  return {
    revision(canvas: CanvasId) {
      const [head] = select(
        port,
        'SELECT revision FROM canvas_head WHERE tenant = ? AND canvas = ?',
        [tenant, canvas],
      )
      return head === undefined ? 0 : integer(head[0])
    },
    items: (canvas, state) =>
      select(
        port,
        `SELECT ${ITEM_COLUMNS} FROM canvas_item WHERE tenant = ? AND canvas = ? AND state = ?`,
        [tenant, canvas, state],
      ).map(itemOf),
    piles: canvas =>
      select(
        port,
        'SELECT id, name, x, y, by_kind, by_session, changed_at FROM canvas_pile WHERE tenant = ? AND canvas = ?',
        [tenant, canvas],
      ).map(pileOf),
  }
}
