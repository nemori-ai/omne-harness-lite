// Entry of a read Worker: one Worker, one read connection (SPEC 9.5). Requests run one at a time.
// The connection is read-only and query_only. It never creates the database file. The Worker has
// no Cordis Context and reads no global state.
import { parentPort, workerData } from 'node:worker_threads'
import { DatabaseSync } from 'node:sqlite'
import { ModuleCache } from './modules.ts'
import { runRead, type ReaderState } from './read-port.ts'
import type { ReaderEnv, ReaderEnvelope, ReaderMessage, ReaderReply } from './reader-protocol.ts'

const port = parentPort
if (port === null) throw new Error('reader.ts must run in a Worker')
const env = workerData as ReaderEnv
const state: ReaderState = { db: null, modules: new ModuleCache() }

function open(): ReaderReply {
  let db: DatabaseSync
  try {
    db = new DatabaseSync(env.file, { readOnly: true, timeout: env.lockWaitMs })
  } catch {
    return { kind: 'open_failed', diagnostic: 'open_failed' }
  }
  state.db = db
  try {
    db.exec('pragma query_only = 1')
    const flag = (db.prepare('pragma query_only').get() as { query_only?: unknown }).query_only
    if (flag !== 1) return { kind: 'open_failed', diagnostic: 'query_only_not_set' }
    const table = db.prepare("select name from sqlite_schema where name = '_sql_domain'").get()
    if (table === undefined) return { kind: 'open_failed', diagnostic: 'binding_missing' }
    const row = db.prepare('select transaction_domain, scope from _sql_domain').get() as
      | { transaction_domain: string; scope: string }
      | undefined
    if (row === undefined) return { kind: 'open_failed', diagnostic: 'binding_missing' }
    if (row.transaction_domain !== env.domain)
      return { kind: 'open_failed', diagnostic: 'binding_domain_mismatch' }
    return { kind: 'ready', scope: row.scope }
  } catch {
    return { kind: 'open_failed', diagnostic: 'open_error' }
  }
}

function closeQuietly(): void {
  try {
    state.db?.close()
  } catch {
    // The Worker ends next. SQLite recovers a connection that did not close.
  }
  state.db = null
}

let queue: Promise<void> = Promise.resolve()

port.on('message', (message: ReaderMessage) => {
  queue = queue.then(async () => {
    let reply: ReaderReply & { fatal?: boolean }
    try {
      switch (message.request.kind) {
        case 'open':
          reply = open()
          break
        case 'read':
          reply = await runRead(state, message.request.handler, message.request.input)
          break
        case 'close':
          closeQuietly()
          reply = { kind: 'closed' }
          break
      }
    } catch {
      reply = { kind: 'read_failed', diagnostic: 'internal_error' }
    }
    const envelope: ReaderEnvelope = {
      generation: env.generation,
      seq: message.seq,
      token: message.token,
      reply,
    }
    port.postMessage(envelope)
    if (message.request.kind === 'close' || reply.kind === 'open_failed' || reply.fatal === true) {
      closeQuietly()
      process.exit(0)
    }
  })
})
