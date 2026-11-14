import { closeSync, existsSync, openSync, writeSync } from 'node:fs'
import { relative } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { threadId } from 'node:worker_threads'

const marker = process.env.CRASH_CUT_MARKER
const counts = process.env.CRASH_CUT_COUNTS
const stateDir = process.env.CRASH_CUT_STATE
const cutAt = process.env.CRASH_CUT_AT

const TENANT_FILE = /^74656e616e742f[0-9a-f]+\.sqlite$/

export function classOf(location) {
  const segments = relative(stateDir, location).split('/')
  const last = segments.pop()
  segments.push(TENANT_FILE.test(last) ? 'tenant.sqlite' : last)
  return segments.join('~')
}

function entriesIn(db) {
  if (cutAt !== undefined) return '-'
  try {
    return String(db.prepare('select count(*) as n from sl_entry').get().n)
  } catch {
    return '-'
  }
}

function claim(kind, label) {
  for (let ordinal = 1; ; ordinal += 1) {
    let handle
    try {
      handle = openSync(`${counts}/${kind}-${String(ordinal)}`, 'wx')
    } catch (error) {
      if (error.code === 'EEXIST') continue
      throw error
    }
    writeSync(handle, label)
    closeSync(handle)
    return ordinal
  }
}

if (marker !== undefined && counts !== undefined && stateDir !== undefined) {
  const exec = DatabaseSync.prototype.exec
  DatabaseSync.prototype.exec = function (sql) {
    const result = exec.call(this, sql)
    if (sql === 'COMMIT' && existsSync(marker)) {
      const location = this.location() ?? ':memory:'
      const kind = classOf(location)
      const ordinal = claim(kind, `${String(threadId)} ${entriesIn(this)} ${location}`)
      if (cutAt === `${kind}:${String(ordinal)}`) process.kill(process.pid, 'SIGKILL')
    }
    return result
  }
}
