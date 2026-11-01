// Entry of the write Worker: one Worker per domain file (SPEC 5.1 item 4). Messages queue in
// arrival order. A commit starts a group (group.ts) that takes the adjacent groupable commits that
// are queued or arrive within the collection window. Every other message is a barrier: it runs
// alone, after the group before it. The Worker has no Cordis Context and reads no global state.
import { parentPort, workerData } from 'node:worker_threads'
import { openDomain, registerInDomain, rollbackQuietly, type WorkerState } from './domain.ts'
import { ModuleCache } from './modules.ts'
import { runQuery } from './execute.ts'
import { WalMaintainer } from './wal.ts'
import { GroupRunner, isCommitJob, type Queued } from './group.ts'
import type {
  InternalErrorReply,
  WithdrawnReply,
  WorkerEnv,
  WorkerEvent,
  WorkerRequest,
} from './protocol.ts'

const port = parentPort
if (port === null) throw new Error('writer.ts must run in a Worker')
const env = workerData as WorkerEnv
const state: WorkerState = { db: null, modules: new ModuleCache(), writeGeneration: null }
const closingFlag = new Int32Array(env.closingFlag)
const closing = (): boolean => Atomics.load(closingFlag, 0) === 1
const runner = new GroupRunner(env, state, closing)
const wal = new WalMaintainer(
  env,
  () => state.db,
  walState =>
    port.postMessage({
      event: 'wal',
      generation: env.generation,
      state: walState,
    } satisfies WorkerEvent),
)
/** Requests that the Worker does not start once the provider closes (SPEC 13.3 step 2). */
const WITHDRAWABLE: ReadonlySet<WorkerRequest['kind']> = new Set(['register', 'commit', 'query'])
const inbox: Queued[] = []
let notify: (() => void) | null = null
let pumping = false

const post = (id: number, reply: unknown): void => {
  port.postMessage({ id, generation: env.generation, reply })
}

function internalError(error: unknown): InternalErrorReply {
  return {
    kind: 'internal_error',
    diagnostic: error instanceof Error ? error.name : 'internal_error',
  }
}

/** Resolves when a message arrives, or after `ms`. */
function waitForArrival(ms: number): Promise<void> {
  return new Promise(resolve => {
    const done = (): void => {
      clearTimeout(timer)
      notify = null
      resolve()
    }
    const timer = setTimeout(done, ms)
    notify = done
  })
}

function closeAndExit(): never {
  try {
    state.db?.close()
  } catch {
    // The process of the Worker ends next. SQLite recovers a connection that did not close.
  }
  process.exit(0)
}

async function handle(item: Queued): Promise<unknown> {
  const { request } = item
  switch (request.kind) {
    case 'open': {
      const reply = await openDomain(env, state, request.create)
      runner.invalidate()
      return reply
    }
    case 'register': {
      const reply = await registerInDomain(env, state, request.registration)
      runner.invalidate()
      return reply
    }
    case 'query':
      return runQuery(state, request.identity)
    case 'close':
      try {
        state.db?.close()
      } catch {
        // See closeAndExit.
      }
      state.db = null
      return { kind: 'closed' }
    case 'commit':
      throw new Error('a commit runs in a group')
  }
}

async function runGroup(first: Queued): Promise<void> {
  if (!isCommitJob(first)) return
  const jobs = await runner.collect(first, inbox, waitForArrival)
  const posted = new Set<number>()
  if (closing()) {
    // Nothing of this group started (SPEC 13.3 step 2): the control side gives `withdrawn_before_start`.
    for (const job of jobs) post(job.id, { kind: 'withdrawn' } satisfies WithdrawnReply)
    return
  }
  try {
    const result = await runner.run(jobs, (id, reply) => {
      posted.add(id)
      post(id, reply)
    })
    inbox.unshift(...result.unstarted)
    if (result.fatal) closeAndExit()
  } catch (error) {
    // A provider fault. The transaction is gone, the jobs that were not answered are not durable.
    if (state.db !== null) rollbackQuietly(state.db)
    for (const job of jobs) if (!posted.has(job.id)) post(job.id, internalError(error))
  }
}

async function dispatch(item: Queued): Promise<void> {
  if (isCommitJob(item)) return runGroup(item)
  let reply: unknown
  try {
    reply =
      closing() && WITHDRAWABLE.has(item.request.kind)
        ? ({ kind: 'withdrawn' } satisfies WithdrawnReply)
        : await handle(item)
  } catch (error) {
    reply = internalError(error)
  }
  post(item.id, reply)
  if (item.request.kind === 'close') closeAndExit()
}

async function pump(): Promise<void> {
  if (pumping) return
  pumping = true
  try {
    for (let item = inbox.shift(); item !== undefined; item = inbox.shift()) {
      await dispatch(item)
      maintain()
    }
  } finally {
    pumping = false
  }
}

port.on('message', (message: { id: number; request: Queued['request'] }) => {
  inbox.push({
    id: message.id,
    request: message.request,
    arrivedAt:
      /* wall-clock: operation-timing -- Group collection window and execution slice (SPEC 7.3). */ performance.now(),
  })
  notify?.()
  void pump()
})

/** Maintenance runs between two dispatches, never inside a physical transaction (SPEC 12.3). */
function maintain(): void {
  if (closing()) return
  try {
    wal.tick()
  } catch {
    // A maintenance error is not a request error. The next tick tries again.
  }
}

setInterval(() => {
  if (!pumping) maintain()
}, env.checkpointIntervalMs).unref()
