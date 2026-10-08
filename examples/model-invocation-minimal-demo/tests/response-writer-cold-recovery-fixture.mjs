import { writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
const marker = process.env.OMNE_TEST_RESPONSE_WRITER_MARKER
const mode = process.env.OMNE_TEST_RESPONSE_WRITER_MODE
if (!marker || !['after-write', 'before-write'].includes(mode))
  throw Error('response SQL fault fixture is unconfigured')
const prepare = DatabaseSync.prototype.prepare,
  exec = DatabaseSync.prototype.exec
const affected = new WeakSet(),
  blockedFiles = new Set()
let hit = false,
  hidden = false
const fault = () =>
  Object.assign(Error('controlled SQL response fault'), {
    code: 'ERR_SQLITE_ERROR',
    errcode: 10,
    errstr: 'disk I/O error',
  })
function mark(point) {
  if (hit) return
  hit = true
  writeFileSync(marker, point, { flag: 'wx', mode: 0o600 })
}
DatabaseSync.prototype.prepare = function (sql) {
  const file = this.location('main')
  if (blockedFiles.has(file) && /^select\b/iu.test(sql) && sql.includes('sl_entry')) {
    if (!hidden) {
      hidden = true
      writeFileSync(`${marker}.recognition-unavailable`, 'response-recognition-unavailable', {
        flag: 'wx',
        mode: 0o600,
      })
    }
    throw fault()
  }
  const statement = prepare.call(this, sql),
    db = this
  if (!/insert into "sl_entry"/iu.test(sql)) return statement
  return new Proxy(statement, {
    get(target, key) {
      const member = Reflect.get(target, key)
      if (key === 'run')
        return (...args) => {
          const response = args.some(
            value => typeof value === 'string' && value.includes('"category":"response"'),
          )
          if (response && mode === 'before-write') {
            blockedFiles.add(file)
            mark('before-response-insert')
            throw fault()
          }
          const result = statement.run(...args)
          if (response) affected.add(db)
          return result
        }
      return typeof member === 'function' ? member.bind(target) : member
    },
  })
}
DatabaseSync.prototype.exec = function (sql) {
  const result = exec.call(this, sql)
  if (/^COMMIT$/iu.test(sql) && affected.has(this)) {
    affected.delete(this)
    blockedFiles.add(this.location('main'))
    mark('after-response-commit-before-receipt')
    throw fault()
  }
  return result
}
