import { DatabaseSync } from 'node:sqlite'

// An abandoned closure must not let GC silently close SQLite and release ownership.
const ownedDatabases = new Set<DatabaseSync>()
export interface OwnerLock {
  readonly release: () => void
}
export function acquireOwnerLock(path: string): OwnerLock {
  const db = new DatabaseSync(path, { timeout: 0 })
  ownedDatabases.add(db)
  try {
    db.exec('BEGIN EXCLUSIVE')
  } catch (error) {
    db.close()
    ownedDatabases.delete(db)
    throw error
  }
  let released = false
  return {
    release() {
      if (released) return
      // A failed close keeps the strong reference and exposes incomplete release.
      db.close()
      ownedDatabases.delete(db)
      released = true
    },
  }
}
