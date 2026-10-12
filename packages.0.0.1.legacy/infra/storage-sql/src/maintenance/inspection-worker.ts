import { DatabaseSync } from 'node:sqlite'
import { parentPort, workerData } from 'node:worker_threads'

/** Fixed physical checks only. The owner supplies a completed, isolated copy. */
function check(file: string): 'ok' | 'invalid-data' {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    db.exec('PRAGMA query_only = ON')
    const integrity = db.prepare('PRAGMA integrity_check').get()
    if (
      integrity === undefined ||
      Object.keys(integrity).length !== 1 ||
      Object.values(integrity)[0] !== 'ok'
    )
      return 'invalid-data'
    // Only existence matters. Do not materialize an unbounded list of violations.
    try {
      return db.prepare('PRAGMA foreign_key_check').get() === undefined ? 'ok' : 'invalid-data'
    } catch (error) {
      // This fixed pragma diagnoses malformed FK declarations before owner checks.
      // Do not classify arbitrary SQLITE_ERROR (including provider SQL bugs) as data.
      if (
        error instanceof Error &&
        'errcode' in error &&
        error.errcode === 1 &&
        error.message.startsWith('foreign key mismatch - ')
      )
        return 'invalid-data'
      throw error
    }
  } finally {
    db.close()
  }
}

function failure(error: unknown): 'invalid-data' | 'unavailable' | 'defect' {
  if (error instanceof Error && 'errcode' in error && typeof error.errcode === 'number') {
    const primary = error.errcode & 0xff
    if (primary === 11 || primary === 26) return 'invalid-data' // CORRUPT / NOTADB
    if ([5, 6, 7, 10, 13, 14].includes(primary)) return 'unavailable'
  }
  return 'defect'
}

if (parentPort === null) throw new Error('snapshot inspection requires an owned worker')
let status: 'ok' | 'invalid-data' | 'unavailable' | 'defect'
try {
  const input: unknown = workerData
  if (
    typeof input !== 'object' ||
    input === null ||
    !('file' in input) ||
    typeof input.file !== 'string' ||
    Object.keys(input).length !== 1
  )
    throw new Error('invalid internal snapshot worker input')
  status = check(input.file)
} catch (error) {
  status = failure(error)
}
// The database is closed before the result, and the parent also waits for actual exit.
parentPort.postMessage({ status })
parentPort.close()
