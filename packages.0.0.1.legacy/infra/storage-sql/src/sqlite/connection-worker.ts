import { DatabaseSync } from 'node:sqlite'
import { parentPort, workerData } from 'node:worker_threads'
import {
  sqliteFailure,
  type SqliteCommand,
  type SqliteReply,
  type SqliteRequest,
  type SqliteRow,
  type SqliteWorkerInput,
} from './worker-protocol.ts'
import { backupConnection } from './worker-backup.ts'

const port = parentPort
if (port === null) throw new Error('sqlite connection requires an owned worker')
const input = workerData as SqliteWorkerInput
let db: DatabaseSync | undefined

function collectRows(
  database: DatabaseSync,
  command: Extract<SqliteCommand, { kind: 'all' | 'get' | 'run' }>,
) {
  const statement = database.prepare(command.sql)
  if (command.limit === undefined) return statement.all(...command.parameters)
  const rows: SqliteRow[] = []
  for (const row of statement.iterate(...command.parameters)) {
    rows.push(row)
    if (rows.length >= command.limit) break
  }
  return rows
}

function execute(command: SqliteCommand, id: number): unknown {
  if (db === undefined) throw new Error('sqlite connection did not open')
  switch (command.kind) {
    case 'exec':
      return db.exec(command.sql)
    case 'rollback':
      if (db.isTransaction) db.exec('ROLLBACK')
      return
    case 'close':
      return db.close()
    case 'backup':
      return backupConnection(db, command, () => port!.postMessage({ id, progress: true }))
    case 'get':
      return db.prepare(command.sql).get(...command.parameters)
    case 'run':
      return db.prepare(command.sql).run(...command.parameters)
    case 'all':
      return collectRows(db, command)
  }
}

async function reply(id: number, operation: () => unknown): Promise<void> {
  let result: SqliteReply
  try {
    const value = await operation()
    result = { id, ok: true, value, open: db?.isOpen === true }
  } catch (error) {
    result = { id, ok: false, error: sqliteFailure(error), open: db?.isOpen === true }
  }
  port!.postMessage(result)
  if (!result.open) port!.close()
}

void reply(0, () => {
  db = new DatabaseSync(input.file, input.options)
})
let queue = Promise.resolve()
port.on('message', (request: SqliteRequest) => {
  queue = queue.then(() => reply(request.id, () => execute(request.command, request.id)))
})
