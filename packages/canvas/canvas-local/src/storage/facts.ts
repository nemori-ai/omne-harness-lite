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

const ITEM_WRITE = `INSERT INTO canvas_item (tenant, canvas, ${ITEM_COLUMNS}) VALUES (${Array(16).fill('?').join(', ')}) ON CONFLICT (tenant, canvas, id) DO UPDATE SET ${ITEM_COLUMNS.split(
  ', ',
)
  .slice(1)
  .map(column => `${column} = excluded.${column}`)
  .join(', ')}`

const PILE_WRITE =
  'INSERT INTO canvas_pile (tenant, canvas, id, name, x, y, by_kind, by_session, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (tenant, canvas, id) DO UPDATE SET name = excluded.name, x = excluded.x, y = excluded.y, by_kind = excluded.by_kind, by_session = excluded.by_session, changed_at = excluded.changed_at'

const sessionOf = (mover: Mover) => (mover.kind === 'agent' ? mover.session : null)

/** One tenant's canvases in SQL. Every statement names the tenant: the rows of no other are read or written. */
export function sqlFacts(port: SqlPort, tenant: string): CanvasFacts {
  const head = (canvas: CanvasId) =>
    select(port, 'SELECT revision, next_rank FROM canvas_head WHERE tenant = ? AND canvas = ?', [
      tenant,
      canvas,
    ])[0]
  const one = (canvas: CanvasId, where: string, params: readonly SqlValue[]) => {
    const [row] = select(
      port,
      `SELECT ${ITEM_COLUMNS} FROM canvas_item WHERE tenant = ? AND canvas = ? AND ${where}`,
      [tenant, canvas, ...params],
    )
    return row === undefined ? null : itemOf(row)
  }
  return {
    revision: canvas => {
      const row = head(canvas)
      return row === undefined ? 0 : integer(row[0])
    },
    nextRank: canvas => {
      const row = head(canvas)
      return row === undefined ? 1 : integer(row[1])
    },
    items: (canvas, state) =>
      select(
        port,
        `SELECT ${ITEM_COLUMNS} FROM canvas_item WHERE tenant = ? AND canvas = ? AND state = ?`,
        [tenant, canvas, state],
      ).map(itemOf),
    item: (canvas, id) => one(canvas, 'id = ?', [id]),
    itemOf: (canvas, reference) =>
      one(canvas, 'kind = ? AND ref = ?', [reference.kind, reference.ref]),
    piles: canvas =>
      select(
        port,
        'SELECT id, name, x, y, by_kind, by_session, changed_at FROM canvas_pile WHERE tenant = ? AND canvas = ?',
        [tenant, canvas],
      ).map(pileOf),

    setHead(canvas, revision, nextRank) {
      port.execute(
        'INSERT INTO canvas_head (tenant, canvas, revision, next_rank) VALUES (?, ?, ?, ?) ON CONFLICT (tenant, canvas) DO UPDATE SET revision = excluded.revision, next_rank = excluded.next_rank',
        [tenant, canvas, revision, nextRank],
      )
    },
    putItem(canvas, item) {
      port.execute(ITEM_WRITE, [
        tenant,
        canvas,
        item.id,
        item.reference.kind,
        item.reference.ref,
        item.state,
        item.at.x,
        item.at.y,
        item.size?.width ?? null,
        item.size?.height ?? null,
        item.rank,
        item.pile,
        item.locked ? 1 : 0,
        item.by.kind,
        sessionOf(item.by),
        item.when,
      ])
    },
    dropItem(canvas, id) {
      port.execute('DELETE FROM canvas_item WHERE tenant = ? AND canvas = ? AND id = ?', [
        tenant,
        canvas,
        id,
      ])
    },
    putPile(canvas, pile) {
      port.execute(PILE_WRITE, [
        tenant,
        canvas,
        pile.id,
        pile.name,
        pile.at.x,
        pile.at.y,
        pile.by.kind,
        sessionOf(pile.by),
        pile.when,
      ])
    },
    dropPile(canvas, id) {
      port.execute('DELETE FROM canvas_pile WHERE tenant = ? AND canvas = ? AND id = ?', [
        tenant,
        canvas,
        id,
      ])
    },
  }
}
