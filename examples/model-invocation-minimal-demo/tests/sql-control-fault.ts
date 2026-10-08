import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

/** Controlled faults at actual SQLite insert/commit/recognition boundaries. No filesystem repair is claimed. */
export function installSqlControlFault(
  file: string,
  mode: 'lostReceipt' | 'beforeInsert',
  kind: string,
) {
  const prepare = DatabaseSync.prototype.prepare,
    exec = DatabaseSync.prototype.exec
  const pending = new WeakSet<DatabaseSync>()
  const needle = kind.startsWith('"') ? kind : `"kind":"${kind}"`
  let armed = false,
    blocked = false,
    receiptFailures = 0,
    recognitionFailures = 0,
    writeFailures = 0,
    commits = 0
  const fault = () =>
    Object.assign(new Error('controlled SQL journal IO failure'), {
      code: 'ERR_SQLITE_ERROR',
      errcode: 10,
      errstr: 'disk I/O error',
    })
  DatabaseSync.prototype.prepare = function (sql: string) {
    const target = this.location('main') === file
    if (target && blocked && /^select\b/iu.test(sql) && sql.includes('sl_entry')) {
      recognitionFailures++
      throw fault()
    }
    const statement = prepare.call(this, sql)
    if (!target || !/insert into "sl_entry"/iu.test(sql)) return statement
    const db = this
    return new Proxy(statement, {
      get(object, key) {
        const member: unknown = Reflect.get(object, key)
        if (key === 'run')
          return (...params: SQLInputValue[]) => {
            const controlled =
              armed && params.some(value => typeof value === 'string' && value.includes(needle))
            if (controlled && mode === 'beforeInsert') {
              writeFailures++
              throw fault()
            }
            const result = statement.run(...params)
            if (controlled) pending.add(db)
            return result
          }
        return typeof member === 'function' ? member.bind(object) : member
      },
    })
  }
  DatabaseSync.prototype.exec = function (sql: string) {
    const result = exec.call(this, sql)
    if (/^COMMIT$/iu.test(sql) && pending.has(this)) {
      pending.delete(this)
      commits++
      receiptFailures++
      blocked = true
      throw fault()
    }
    return result
  }
  return {
    arm() {
      armed = true
    },
    clear() {
      armed = false
      blocked = false
    },
    counts() {
      return { receiptFailures, recognitionFailures, writeFailures, commits }
    },
    close() {
      armed = false
      blocked = false
      DatabaseSync.prototype.prepare = prepare
      DatabaseSync.prototype.exec = exec
    },
  }
}
/** Exact durable row text, with raw inspection outside this fixture's controlled failure boundary. */
const inspectionPrepare = DatabaseSync.prototype.prepare
export function sqlRowBytes(file: string): string {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return JSON.stringify(
      inspectionPrepare
        .call(
          db,
          'select session, position, batch, value from sl_entry order by session, position_length, position',
        )
        .all(),
    )
  } finally {
    db.close()
  }
}
