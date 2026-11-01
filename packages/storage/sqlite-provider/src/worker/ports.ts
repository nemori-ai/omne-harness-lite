// The SQL gateway that stands behind every port (SPEC 5.4, 7.4, 9.4). One gateway lives for one
// call of a participant or migration. It installs an authorizer, runs each statement through a
// fresh prepare so that the authorizer judges every statement, and closes for good after a failed
// statement or when the call ends. Authority never comes from the statement text.
import {
  constants as C,
  type DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from 'node:sqlite'
import type { QueryRows, SqlCell, SqlValue } from '@omne-harness/sql-contract/worker'
import { DataError, isDataError } from './errors.ts'

/** Functions that every participant may call. No time, random or connection state functions. */
export const BASE_FUNCTIONS: ReadonlySet<string> = new Set([
  'abs',
  'avg',
  'coalesce',
  'count',
  'glob',
  'group_concat',
  'hex',
  'ifnull',
  'iif',
  'instr',
  'length',
  'like',
  'lower',
  'ltrim',
  'max',
  'min',
  'nullif',
  'printf',
  'format',
  'quote',
  'replace',
  'round',
  'rtrim',
  'substr',
  'substring',
  'sum',
  'total',
  'trim',
  'typeof',
  'unicode',
  'upper',
  'zeroblob',
  'json_extract',
  'json_valid',
  'json_type',
  'json_array_length',
])

/** Judges one authorizer call. `table` arguments follow the SQLite authorizer rules. */
export type Decision = (action: number, arg1: string | null, arg2: string | null) => boolean

const INTERNAL_TABLES = new Set(['sqlite_master', 'sqlite_schema', 'sqlite_sequence'])

function functionSet(extra: readonly string[]): Set<string> {
  return new Set([...BASE_FUNCTIONS, ...extra.map(name => name.toLowerCase())])
}

/** Participant rule: write only owned tables, read owned and declared tables, no DDL (SPEC 7.4). */
export function participantDecision(
  ownedTables: readonly string[],
  readTables: readonly string[],
  allowedFunctions: readonly string[],
): Decision {
  const write = new Set(ownedTables)
  const read = new Set([...ownedTables, ...readTables])
  const functions = functionSet(allowedFunctions)
  return (action, arg1, arg2) => {
    switch (action) {
      case C.SQLITE_SELECT:
      case C.SQLITE_RECURSIVE:
        return true
      case C.SQLITE_READ:
        return arg1 !== null && read.has(arg1)
      case C.SQLITE_INSERT:
      case C.SQLITE_UPDATE:
      case C.SQLITE_DELETE:
        return arg1 !== null && write.has(arg1)
      case C.SQLITE_FUNCTION:
        return arg2 !== null && functions.has(arg2.toLowerCase())
      default:
        return false
    }
  }
}

/** Migration rule: DDL and writes on the owner tables, reads on the tables of the requires closure. */
export function migrationDecision(
  ownedTables: readonly string[],
  requiredTables: readonly string[],
): Decision {
  const write = new Set(ownedTables)
  const read = new Set([...ownedTables, ...requiredTables])
  const functions = functionSet([])
  // Index names that SQLITE_CREATE_INDEX allowed in this migration; only those may be reindexed.
  const createdIndexes = new Set<string>()
  return (action, arg1, arg2) => {
    switch (action) {
      case C.SQLITE_SELECT:
      case C.SQLITE_RECURSIVE:
        return true
      case C.SQLITE_READ:
        return arg1 !== null && (read.has(arg1) || INTERNAL_TABLES.has(arg1))
      case C.SQLITE_CREATE_TABLE:
      case C.SQLITE_DROP_TABLE:
      case C.SQLITE_INSERT:
      case C.SQLITE_UPDATE:
      case C.SQLITE_DELETE:
        return arg1 !== null && (write.has(arg1) || INTERNAL_TABLES.has(arg1))
      case C.SQLITE_CREATE_INDEX: {
        const allowed = arg2 !== null && write.has(arg2)
        if (allowed && arg1 !== null) createdIndexes.add(arg1)
        return allowed
      }
      case C.SQLITE_DROP_INDEX:
      case C.SQLITE_CREATE_TRIGGER:
      case C.SQLITE_DROP_TRIGGER:
      case C.SQLITE_ALTER_TABLE:
        return arg2 !== null && write.has(arg2)
      // CREATE INDEX also raises SQLITE_REINDEX with the index name after the CREATE_INDEX action
      // judged the owner table. Allow only names that action allowed, so a REINDEX statement on
      // another owner's index or table stays denied.
      case C.SQLITE_REINDEX:
        return arg1 !== null && createdIndexes.has(arg1)
      case C.SQLITE_FUNCTION:
        return arg2 !== null && functions.has(arg2.toLowerCase())
      default:
        return false
    }
  }
}

const INT64_MIN = -(2n ** 63n)
const INT64_MAX = 2n ** 63n - 1n

function bind(value: SqlValue): null | number | bigint | string | Uint8Array {
  if (value === null || typeof value === 'string' || value instanceof Uint8Array) return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new DataError('parameter is not finite')
    return value
  }
  if (typeof value === 'bigint') {
    if (value < INT64_MIN || value > INT64_MAX) throw new DataError('bigint out of range')
    return value
  }
  throw new DataError('parameter type is not a SQL value')
}

function cell(value: unknown): SqlCell {
  if (value === null || typeof value === 'bigint' || typeof value === 'string') return value
  if (typeof value === 'number') return value
  if (value instanceof Uint8Array) return new Uint8Array(value)
  throw new DataError('unsupported SQLite value')
}

/** Thrown when the rows of a read exceed the ceiling. The gateway keeps `rowLimitHit`. */
export class RowLimitError extends Error {}

export type GatewayOptions = Readonly<{
  /** Rows that all statements of this gateway may return together (read port, SPEC 9.4). */
  maxRows?: number
}>

export class SqlGateway {
  /** The authorizer refused a statement. */
  violated = false
  /** The rows of the statements went over `maxRows`. */
  rowLimitHit = false
  /** A statement failed for a reason that only the statement and the data decide. */
  dataFailure = false
  /** A statement failed for an environment reason. The operation becomes unknown. */
  environmentFailure: unknown = null

  private open = true
  private sawInsert = false
  private rowsRead = 0
  private readonly db: DatabaseSync
  private readonly maxRows: number

  constructor(db: DatabaseSync, decide: Decision, options: GatewayOptions = {}) {
    this.db = db
    this.maxRows = options.maxRows ?? Number.POSITIVE_INFINITY
    db.setAuthorizer((action, arg1, arg2) => {
      if (action === C.SQLITE_INSERT && arg1 !== null && !arg1.startsWith('sqlite_'))
        this.sawInsert = true
      if (decide(action, arg1, arg2)) return C.SQLITE_OK
      this.violated = true
      return C.SQLITE_DENY
    })
  }

  get isOpen(): boolean {
    return this.open
  }

  /** Marks a use after the port closed as a violation, and refuses it. */
  guard(): void {
    if (this.open) return
    this.violated = true
    throw new Error('port is closed')
  }

  execute(sql: string, params: readonly SqlValue[]): QueryRows {
    this.guard()
    try {
      const bound = params.map(bind)
      this.sawInsert = false
      const statement = this.db.prepare(sql)
      statement.setReadBigInts(true)
      statement.setReturnArrays(true)
      const columns = statement.columns().map(column => column.name)
      if (columns.length > 0) {
        return {
          columns,
          rows: this.collect(statement, bound),
          changes: 0n,
          lastInsertRowid: null,
        }
      }
      const result = statement.run(...bound)
      return {
        columns: [],
        rows: [],
        changes: BigInt(result.changes),
        lastInsertRowid: this.sawInsert ? BigInt(result.lastInsertRowid) : null,
      }
    } catch (error) {
      this.open = false
      if (error instanceof RowLimitError) throw error
      if (!this.violated) {
        if (isDataError(error)) this.dataFailure = true
        else this.environmentFailure = error
      }
      throw error
    }
  }

  /** Takes rows one by one and stops at the row after the ceiling, so nothing is read ahead. */
  private collect(statement: StatementSync, bound: readonly unknown[]): SqlCell[][] {
    const rows: SqlCell[][] = []
    for (const row of statement.iterate(...(bound as SQLInputValue[])) as Iterable<unknown[]>) {
      this.rowsRead += 1
      if (this.rowsRead > this.maxRows) {
        this.rowLimitHit = true
        throw new RowLimitError('row ceiling')
      }
      rows.push(row.map(cell))
    }
    return rows
  }

  /** Removes the authorizer. The provider runs its own statements after this. */
  close(): void {
    this.open = false
    this.db.setAuthorizer(null)
  }
}
