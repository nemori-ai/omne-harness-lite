import { DatabaseSync } from 'node:sqlite'
import { StorageDefect } from '@omne-harness-lite/storage'
import { isSqliteBusy } from './errors.ts'
import type { OwnerLock } from '../upgrade/owner.ts'

/** Strong references cover acquisition as well as the acquired lock. */
const heldLocks = new Set<DatabaseSync>()

export class SqliteLockBusy extends Error {
  override readonly name = 'SqliteLockBusy'
}
export class SqliteLockIncomplete extends StorageDefect {
  constructor(cause?: unknown) {
    super('coordination database remains open; ownership is retained', { cause })
  }
}
export interface SqliteOwnerLock extends OwnerLock {
  readonly released: boolean
}

/** Private empty coordination database, never a production data connection. */
export function acquireSqliteLock(file: string): SqliteOwnerLock {
  const db = new DatabaseSync(file, { timeout: 0 })
  heldLocks.add(db)
  const close = () => {
    let failed = false,
      failure: unknown
    try {
      db.close()
    } catch (error) {
      failed = true
      failure = error
    }
    if (db.isOpen) throw new SqliteLockIncomplete(failure)
    heldLocks.delete(db)
    if (failed) throw failure
  }
  try {
    db.exec('PRAGMA journal_mode = MEMORY')
    db.exec('BEGIN IMMEDIATE')
  } catch (error) {
    try {
      close()
    } catch (cleanup) {
      const combined = new AggregateError(
        [error, cleanup],
        'coordination acquisition and cleanup failed',
      )
      if (db.isOpen) throw new SqliteLockIncomplete(combined)
      throw combined
    }
    if (isSqliteBusy(error)) throw new SqliteLockBusy('coordination lock is occupied')
    throw error
  }
  return {
    get released() {
      return !db.isOpen
    },
    async release() {
      if (!db.isOpen) return
      // Native close ends the empty transaction. Do not release exclusion with an
      // earlier ROLLBACK while native close can still fail with the handle open.
      close()
    },
  }
}
