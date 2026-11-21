import {
  dispatchSchema,
  isOpen,
  type Dispatch,
  type DispatchQuery,
} from '@omne-harness/dispatch-contract'
import { isUnfinished, type DispatchTxn } from '@omne-harness/dispatch'
import type { QueryRows, SqlValue } from '@omne-harness/sql-contract/worker'
import { ROW_LIMIT } from './schema.ts'

/** What both the participant and the read handler are given: one statement at a time, inside one transaction. */
export type SqlPort = Readonly<{ execute(sql: string, params: readonly SqlValue[]): QueryRows }>

/** Runs a SELECT with the row limit. A result that reaches past the limit fails instead of being cut. */
function select(port: SqlPort, sql: string, params: readonly SqlValue[]): QueryRows['rows'] {
  const found = port.execute(`${sql} LIMIT ${ROW_LIMIT + 1}`, params).rows
  if (found.length > ROW_LIMIT) throw new Error('more rows than one statement may return')
  return found
}

/** Every stored row is parsed where it is read: a row that does not fit its schema fails the read. */
function dispatches(port: SqlPort, where: string, params: readonly SqlValue[]): Dispatch[] {
  const sql = `SELECT record FROM dp_dispatches WHERE ${where} ORDER BY accepted_at, id`
  return select(port, sql, params).map(row => dispatchSchema.parse(JSON.parse(String(row[0]))))
}

const flag = (on: boolean) => (on ? 1 : 0)
const marks = (count: number) => Array.from({ length: count }, () => '?').join(', ')

export function sqlTxn(port: SqlPort): DispatchTxn {
  return {
    dispatch: id => dispatches(port, 'id = ?', [id])[0] ?? null,
    ofSession: session => dispatches(port, 'session = ?', [session])[0] ?? null,
    // The rows are counted here: the storage lets a read call no SQL function, COUNT included.
    openOf: dispatcher =>
      select(port, 'SELECT id FROM dp_dispatches WHERE dispatcher = ? AND open = 1', [dispatcher])
        .length,
    insert(dispatch) {
      port.execute(
        'INSERT INTO dp_dispatches (id, dispatcher, session, state, open, unfinished, accepted_at, record) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          dispatch.id,
          dispatch.dispatcher,
          dispatch.session,
          dispatch.state,
          flag(isOpen(dispatch)),
          flag(isUnfinished(dispatch)),
          dispatch.acceptedAt,
          JSON.stringify(dispatch),
        ],
      )
    },
    replace(dispatch) {
      port.execute(
        'UPDATE dp_dispatches SET state = ?, open = ?, unfinished = ?, record = ? WHERE id = ?',
        [
          dispatch.state,
          flag(isOpen(dispatch)),
          flag(isUnfinished(dispatch)),
          JSON.stringify(dispatch),
          dispatch.id,
        ],
      )
    },
  }
}

/** The dispatches a session made, or the ones that created the named sessions, in the order they were accepted. */
export function listDispatches(port: SqlPort, query: DispatchQuery): Dispatch[] {
  const { by, states } = query
  if (!('dispatcher' in by) && by.sessions.length === 0) return []
  if (states?.length === 0) return []
  const named =
    'dispatcher' in by
      ? { where: 'dispatcher = ?', params: [by.dispatcher] }
      : { where: `session IN (${marks(by.sessions.length)})`, params: [...by.sessions] }
  const stated =
    states === undefined
      ? { where: '', params: [] }
      : { where: ` AND state IN (${marks(states.length)})`, params: [...states] }
  return dispatches(port, named.where + stated.where, [...named.params, ...stated.params])
}

export const unfinishedDispatches = (port: SqlPort): Dispatch[] =>
  dispatches(port, 'unfinished = 1', [])
