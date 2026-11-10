// Counts the SQLite statements of one process and its worker threads, by phase and by owner. Load
// it with `node --import` before anything opens a database; worker threads inherit the flag. The
// main thread sets the phase (`globalThis.historyCostPhase`); every thread reads it from one shared
// cell, so a statement a worker runs is counted in the phase the main thread was in. A statement on
// a `tl_` table belongs to the Tool, or to the host when it binds a `host` ledger domain (every
// ledger and due statement of the Tool storage binds `(tenant, kind, …)`); every other statement
// (Agent, Session, Model, identity, provider receipts) is `other`. Each group also names the tables
// its statement scans, from the query plan of the database that prepared it: rows returned do not
// show a statement that visits every row of a table to find a few. Each thread writes its counts to
// `HISTORY_COST_TRACE_DIR` when a database closes and when it exits; the main thread also when
// `globalThis.historyCostFlush` is called.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { getEnvironmentData, isMainThread, setEnvironmentData, threadId } from 'node:worker_threads'

export type Owner = string

export type Group = {
  phase: number
  owner: Owner
  /** The statement text, so a difference between two calls can be traced to its statement. */
  sql: string
  statements: number
  rowsRead: number
  /** The most rows one execution of the statement returned in the phase. */
  maxRowsRead: number
  rowsWritten: number
  bytes: number
  /** Time spent inside the statement calls of the group, in milliseconds. */
  ms: number
  /** The tables the plan of the statement scans in full (`SCAN <table>` of EXPLAIN QUERY PLAN). */
  scans: readonly string[]
}

const directory = process.env['HISTORY_COST_TRACE_DIR']

function cellBytes(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'string') return Buffer.byteLength(value, 'utf8')
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return 8
  if (ArrayBuffer.isView(value)) return value.byteLength
  if (typeof value === 'object')
    return Object.values(value).reduce((sum, cell) => sum + cellBytes(cell), 0)
  throw new Error('an unmeasured SQLite value')
}

/** `tool` or `host` for the Tool storage; otherwise the prefix of the first table the statement names. */
function ownerOf(sql: string, params: readonly unknown[]): Owner {
  if (/\btl_/u.test(sql)) return !/\btl_body_/u.test(sql) && params[1] === 'host' ? 'host' : 'tool'
  const table = /\b(?:FROM|INTO|UPDATE|JOIN)\s+"?(_?[a-z]+)_/iu.exec(sql)?.[1]
  return table === undefined ? 'other' : `other:${table.toLowerCase()}`
}

if (directory !== undefined) {
  const key = 'history-cost-phase'
  const shared = isMainThread ? new SharedArrayBuffer(4) : getEnvironmentData(key)
  if (isMainThread) setEnvironmentData(key, shared)
  const phase = shared instanceof SharedArrayBuffer ? new Int32Array(shared) : null
  if (isMainThread && phase !== null)
    Reflect.set(globalThis, 'historyCostPhase', (value: number) => Atomics.store(phase, 0, value))
  const groups = new Map<string, Group>()
  const sqlOf = new WeakMap<object, string>()
  const scansOf = new Map<string, readonly string[]>()
  const flush = () => {
    mkdirSync(directory, { recursive: true })
    const file = join(directory, `${String(process.pid)}-${String(threadId)}.json`)
    writeFileSync(`${file}.pending`, `${JSON.stringify([...groups.values()])}\n`)
    renameSync(`${file}.pending`, file)
  }
  const count = (
    statement: object,
    params: readonly unknown[],
    rows: readonly unknown[],
    changes: number,
    ms: number,
  ) => {
    const sql = sqlOf.get(statement) ?? ''
    const current = phase === null ? -1 : Atomics.load(phase, 0)
    const owner = ownerOf(sql, params)
    const name = `${String(current)}/${owner}/${sql}`
    const group = groups.get(name) ?? {
      phase: current,
      owner,
      sql,
      statements: 0,
      rowsRead: 0,
      maxRowsRead: 0,
      rowsWritten: 0,
      bytes: 0,
      ms: 0,
      scans: scansOf.get(sql) ?? [],
    }
    groups.set(name, group)
    group.statements += 1
    group.rowsRead += rows.length
    group.maxRowsRead = Math.max(group.maxRowsRead, rows.length)
    group.rowsWritten += changes
    group.bytes += cellBytes(params) + rows.reduce<number>((sum, row) => sum + cellBytes(row), 0)
    group.ms += ms
  }
  // The statement methods are patched on the shared prototype, so they see every statement of the
  // thread; each forwards its arguments untouched and counts the answer.
  type Method = (...params: unknown[]) => unknown
  const prepare = DatabaseSync.prototype.prepare as unknown as (sql: string) => object
  const scratch = new DatabaseSync(':memory:')
  const prototype = Object.getPrototypeOf(prepare.call(scratch, 'SELECT 1')) as Record<
    'all' | 'get' | 'run' | 'iterate',
    Method
  >
  scratch.close()
  const { all, get, run, iterate } = prototype
  Reflect.set(DatabaseSync.prototype, 'prepare', function (this: DatabaseSync, sql: string) {
    const statement = prepare.call(this, sql)
    sqlOf.set(statement, sql)
    if (!scansOf.has(sql)) {
      // A statement SQLite cannot explain (a pragma, a transaction statement) scans nothing.
      let plan: unknown[] = []
      try {
        plan = Reflect.apply(all, prepare.call(this, `EXPLAIN QUERY PLAN ${sql}`), []) as unknown[]
      } catch {
        plan = []
      }
      const tables = plan.flatMap(row => {
        const table = /^SCAN (\w+)/u.exec(String((row as { detail?: unknown }).detail))?.[1]
        return table === undefined || table === 'CONSTANT' ? [] : [table]
      })
      scansOf.set(sql, [...new Set(tables)])
    }
    return statement
  })
  prototype.all = function (this: object, ...params: unknown[]) {
    const started = performance.now()
    const rows = Reflect.apply(all, this, params) as unknown[]
    count(this, params, rows, 0, performance.now() - started)
    return rows
  }
  prototype.get = function (this: object, ...params: unknown[]) {
    const started = performance.now()
    const row: unknown = Reflect.apply(get, this, params)
    count(this, params, row === undefined ? [] : [row], 0, performance.now() - started)
    return row
  }
  prototype.run = function (this: object, ...params: unknown[]) {
    const started = performance.now()
    const result = Reflect.apply(run, this, params) as { changes: number | bigint }
    count(this, params, [], Number(result.changes), performance.now() - started)
    return result
  }
  prototype.iterate = function* (this: object, ...params: unknown[]) {
    const rows: unknown[] = []
    const started = performance.now()
    for (const row of Reflect.apply(iterate, this, params) as Iterable<unknown>) {
      rows.push(row)
      yield row
    }
    count(this, params, rows, 0, performance.now() - started)
  }
  const close = DatabaseSync.prototype.close
  DatabaseSync.prototype.close = function (this: DatabaseSync) {
    close.call(this)
    flush()
  }
  if (isMainThread) Reflect.set(globalThis, 'historyCostFlush', flush)
  process.on('exit', flush)
}
