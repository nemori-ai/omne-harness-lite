import { Worker } from 'node:worker_threads'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { EntryId, SessionId, SessionRevision } from '@omne-harness/session-contract'
import {
  EXTRACTION_VERSION,
  type Candidates,
  type HistoryIndex,
  type IndexFailure,
  type IndexState,
} from '@omne-harness/session-search'
import type { Store, StoreCandidates, StoreFailure, StoreOptions, StoreState } from './store.ts'
import type { WorkerCall, WorkerReply } from './worker.ts'

const EXTENSION = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
const WORKER_URL = new URL(`./worker.${EXTENSION}`, import.meta.url)

export type SqliteHistoryIndexOptions = Readonly<{
  root: string
  vocabularyLimit?: number
}>

export type SqliteHistoryIndex = HistoryIndex & Readonly<{ close(): Promise<void> }>

type Waiting = Readonly<{ resolve(value: unknown): void; reject(cause: Error): void }>

// One thread and its calls in flight. A thread that dies fails them; the next call starts another.
function lane(options: StoreOptions) {
  let worker: Worker | null = null
  let serial = 0
  const waiting = new Map<number, Waiting>()

  function failAll(cause: Error): void {
    for (const call of waiting.values()) call.reject(cause)
    waiting.clear()
    worker = null
  }

  function started(): Worker {
    if (worker !== null) return worker
    const thread = new Worker(WORKER_URL, { workerData: options })
    thread.on('message', (reply: WorkerReply) => {
      const call = waiting.get(reply.id)
      waiting.delete(reply.id)
      if (reply.error === undefined) call?.resolve(reply.result)
      else call?.reject(new Error(reply.error))
    })
    thread.on('error', cause => failAll(cause))
    thread.on('exit', () => {
      if (worker === thread) failAll(new Error('the index thread ended'))
    })
    thread.unref()
    worker = thread
    return thread
  }

  return {
    call<M extends keyof Store>(
      method: M,
      ...args: Parameters<Store[M]>
    ): Promise<ReturnType<Store[M]>> {
      return new Promise((resolve, reject) => {
        serial += 1
        waiting.set(serial, { resolve: resolve as Waiting['resolve'], reject })
        started().postMessage({ id: serial, method, args } satisfies WorkerCall)
      })
    },
    async close(): Promise<void> {
      const thread = worker
      worker = null
      await thread?.terminate()
      failAll(new Error('the index is closed'))
    },
  }
}

const isFailure = (answer: unknown): answer is StoreFailure => typeof answer === 'string'

function candidatesOf(found: StoreCandidates): Candidates {
  return {
    covered: new Map(
      found.covered.map(row => [row.session as SessionId, row.position as SessionRevision]),
    ),
    rows: found.rows.map(row => ({
      doc: row.doc,
      session: row.session as SessionId,
      position: row.position as EntryId,
    })),
  }
}

function stateOf(state: StoreState): IndexState {
  if (state.kind !== 'rebuilding') return state
  const { indexed, total, ...rest } = state
  return { ...rest, progress: { indexed, total } }
}

/** The history index on files and two threads of its own: one reads while the other writes. */
export function createSqliteHistoryIndex(options: SqliteHistoryIndexOptions): SqliteHistoryIndex {
  const shared = {
    root: options.root,
    extraction: EXTRACTION_VERSION,
    vocabularyLimit: options.vocabularyLimit ?? 512,
  }
  const reads = lane({ ...shared, readOnly: true })
  const writes = lane({ ...shared, readOnly: false })
  const textOf = (tenant: TenantId): string | null => {
    const text = tenantCodec.encode(tenant)
    return text.ok ? text.value : null
  }
  async function answered<T>(
    call: () => Promise<T | StoreFailure>,
  ): Promise<Outcome<T, IndexFailure>> {
    try {
      const answer = await call()
      return isFailure(answer) ? fail(answer) : succeed(answer)
    } catch {
      return fail('unavailable')
    }
  }

  return {
    async state(tenant) {
      const text = textOf(tenant)
      if (text === null) return { kind: 'broken', diagnostic: 'the tenant has no text form' }
      try {
        return stateOf(await reads.call('state', text))
      } catch (cause) {
        return { kind: 'broken', diagnostic: `the index does not answer: ${String(cause)}` }
      }
    },
    async candidates(input) {
      const tenant = textOf(input.tenant)
      if (tenant === null) return fail('unavailable')
      const found = await answered(() => reads.call('candidates', { ...input, tenant }))
      return 'failure' in found ? found : succeed(candidatesOf(found.ok))
    },
    async append(input) {
      const tenant = textOf(input.tenant)
      if (tenant === null) return fail('unavailable')
      return answered(() => writes.call('append', { ...input, tenant }))
    },
    async beginRebuild(tenant, total) {
      const text = textOf(tenant)
      if (text === null) return fail('unavailable')
      const begun = await answered(() => writes.call('beginRebuild', text, total))
      return 'failure' in begun ? fail('unavailable') : begun
    },
    async adopt(tenant, generation) {
      const text = textOf(tenant)
      if (text === null) return fail('unavailable')
      return answered(() => writes.call('adopt', text, generation))
    },
    async compact(tenant, pages) {
      const text = textOf(tenant)
      if (text !== null) await writes.call('compact', text, pages).catch(() => undefined)
    },
    async close() {
      await Promise.all([reads.close(), writes.close()])
    },
  }
}
