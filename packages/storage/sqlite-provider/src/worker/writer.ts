// Entry of the write Worker: one Worker per domain file (SPEC 5.1 item 4). Requests run one at a
// time in arrival order. The Worker has no Cordis Context and reads no global state. It leaves the
// event loop only for module loading, so a request never interleaves with another in the middle
// of its SQL.
import { parentPort, workerData } from 'node:worker_threads'
import { openDomain, registerInDomain, type WorkerState } from './domain.ts'
import { ModuleCache } from './modules.ts'
import { runCommit, runQuery } from './execute.ts'
import type { InternalErrorReply, WithdrawnReply, WorkerEnv, WorkerRequest } from './protocol.ts'

const port = parentPort
if (port === null) throw new Error('writer.ts must run in a Worker')
const env = workerData as WorkerEnv
const state: WorkerState = { db: null, modules: new ModuleCache() }
const closingFlag = new Int32Array(env.closingFlag)
/** Requests that the Worker does not start once the provider closes (SPEC 13.3 step 2). */
const WITHDRAWABLE: ReadonlySet<WorkerRequest['kind']> = new Set(['register', 'commit', 'query'])

async function handle(request: WorkerRequest): Promise<unknown> {
  switch (request.kind) {
    case 'open':
      return openDomain(env, state, request.create)
    case 'register':
      return registerInDomain(env, state, request.registration)
    case 'commit':
      return runCommit(env, state, request.request, request.inputDigest)
    case 'query':
      return runQuery(state, request.identity)
    case 'close':
      try {
        state.db?.close()
      } catch {
        // The process of the Worker ends next. SQLite recovers a connection that did not close.
      }
      state.db = null
      return { kind: 'closed' }
  }
}

let queue: Promise<void> = Promise.resolve()

port.on('message', (message: { id: number; request: WorkerRequest }) => {
  queue = queue.then(async () => {
    let reply: unknown
    try {
      reply =
        Atomics.load(closingFlag, 0) === 1 && WITHDRAWABLE.has(message.request.kind)
          ? ({ kind: 'withdrawn' } satisfies WithdrawnReply)
          : await handle(message.request)
    } catch (error) {
      const failure: InternalErrorReply = {
        kind: 'internal_error',
        diagnostic: error instanceof Error ? error.name : 'internal_error',
      }
      reply = failure
    }
    port.postMessage({ id: message.id, reply })
    const fatal = (reply as { fatal?: boolean }).fatal === true
    if (message.request.kind === 'close' || fatal) {
      try {
        state.db?.close()
      } catch {
        // See above.
      }
      process.exit(0)
    }
  })
})
