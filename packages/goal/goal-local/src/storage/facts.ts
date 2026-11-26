import type { GoalTxn } from '@omne-harness/goal'
import { GoalRecordSchema, type GoalRecord } from '@omne-harness/goal-contract'
import type { QueryRows, SqlValue } from '@omne-harness/sql-contract/worker'
import { ROW_LIMIT } from './schema.ts'

/** What both the participant and the read handler are given: one statement at a time, inside one transaction. */
export type SqlPort = Readonly<{ execute(sql: string, params: readonly SqlValue[]): QueryRows }>

/** Every stored row is parsed where it is read: a row that does not fit its schema fails the read. */
const parsed = (rows: QueryRows['rows']): GoalRecord[] =>
  rows.map(row => GoalRecordSchema.parse(JSON.parse(String(row[0]))))

const flag = (on: boolean) => (on ? 1 : 0)
const generationOf = (record: GoalRecord) => record.state.generation
const owes = ({ wake, examination }: GoalRecord): boolean =>
  wake !== null || (examination.batch !== null && examination.batch.delivery !== 'handed')
const columns = (record: GoalRecord) =>
  [
    record.version,
    flag(record.state.status !== 'settled'),
    flag(owes(record)),
    record.examination.examiner,
    JSON.stringify(record),
  ] as const

export function sqlTxn(port: SqlPort): GoalTxn {
  return {
    latest: session =>
      parsed(
        port.execute(
          'SELECT record FROM gl_goals WHERE session = ? ORDER BY generation DESC LIMIT 1',
          [session],
        ).rows,
      )[0] ?? null,
    insert(record) {
      port.execute(
        'INSERT INTO gl_goals (session, generation, version, live, owing, examiner, record) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [record.session, generationOf(record), ...columns(record)],
      )
    },
    replace(record) {
      port.execute(
        'UPDATE gl_goals SET version = ?, live = ?, owing = ?, examiner = ?, record = ? WHERE session = ? AND generation = ?',
        [...columns(record), record.session, generationOf(record)],
      )
    },
  }
}

/** The live goal a session examines for, or null. */
export function examinedBy(port: SqlPort, examiner: string): GoalRecord | null {
  const sql =
    'SELECT record FROM gl_goals WHERE examiner = ? AND live = 1 ORDER BY generation DESC LIMIT 1'
  return parsed(port.execute(sql, [examiner]).rows)[0] ?? null
}

/** The goals that owe their session a reminder or the examining side a batch. A result that reaches past the limit fails instead of being cut. */
export function owingGoals(port: SqlPort): GoalRecord[] {
  const sql = `SELECT record FROM gl_goals WHERE owing = 1 ORDER BY session, generation LIMIT ${String(ROW_LIMIT + 1)}`
  const found = port.execute(sql, []).rows
  if (found.length > ROW_LIMIT) throw new Error('more rows than one statement may return')
  return parsed(found)
}
