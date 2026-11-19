import { DatabaseSync, type StatementSync } from 'node:sqlite'

export type Handle = Readonly<{ db: DatabaseSync; statements: Map<string, StatementSync> }>

/** The open databases of one thread, each with its prepared statements. */
export function createHandles(readOnly: boolean) {
  const open = new Map<string, Handle>()

  // `relaxed`: a generation being built. Its writes do not wait for the disk; it is synced once,
  // before it is adopted.
  function handleOf(file: string, relaxed = false): Handle {
    const held = open.get(file)
    if (held !== undefined) return held
    const db = new DatabaseSync(file, { readOnly })
    if (!readOnly)
      db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = ${relaxed ? 'OFF' : 'NORMAL'}`)
    db.exec('PRAGMA cache_size = -65536')
    const handle = { db, statements: new Map<string, StatementSync>() }
    open.set(file, handle)
    return handle
  }

  function statement(handle: Handle, sql: string): StatementSync {
    let prepared = handle.statements.get(sql)
    if (prepared === undefined) {
      prepared = handle.db.prepare(sql)
      prepared.setReadBigInts(true)
      handle.statements.set(sql, prepared)
    }
    return prepared
  }

  function release(file: string): void {
    open.get(file)?.db.close()
    open.delete(file)
  }

  return {
    handleOf,
    statement,
    release,
    prepared: (file: string, sql: string, relaxed = false): StatementSync =>
      statement(handleOf(file, relaxed), sql),
    close(): void {
      for (const file of open.keys()) release(file)
    },
  }
}

export type Handles = ReturnType<typeof createHandles>
