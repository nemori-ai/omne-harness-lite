import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

/** Test-only physical SQLite failure. Before-write rolls back; lost receipt commits then hides reads. */
export function sqlJournalFault(file: string, committed: boolean) {
  const prepare = DatabaseSync.prototype.prepare,
    exec = DatabaseSync.prototype.exec
  const pending = new WeakSet<DatabaseSync>()
  let armed = false,
    blocked = false,
    failures = 0
  const fault = () =>
    Object.assign(new Error('controlled runner journal IO fault'), {
      code: 'ERR_SQLITE_ERROR',
      errcode: 10,
      errstr: 'disk I/O error',
    })
  DatabaseSync.prototype.prepare = function (sql: string) {
    const target = this.location('main') === file
    if (target && blocked && /^select\b/iu.test(sql) && sql.includes('sl_entry')) throw fault()
    const statement = prepare.call(this, sql)
    if (!target || !/insert into "sl_entry"/iu.test(sql)) return statement
    const db = this
    return new Proxy(statement, {
      get(object, key) {
        const member: unknown = Reflect.get(object, key)
        if (key === 'run')
          return (...args: SQLInputValue[]) => {
            if (armed && !committed) {
              failures++
              blocked = true
              throw fault()
            }
            const result = statement.run(...args)
            if (armed) pending.add(db)
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
      failures++
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
    failures: () => failures,
    close() {
      armed = false
      blocked = false
      DatabaseSync.prototype.prepare = prepare
      DatabaseSync.prototype.exec = exec
    },
  }
}
