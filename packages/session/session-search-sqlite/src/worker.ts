import { parentPort, workerData } from 'node:worker_threads'
import { createStore, type Store, type StoreOptions } from './store.ts'

// One thread of the index: it owns its database handles and answers one call at a time.
export type WorkerCall = Readonly<{ id: number; method: keyof Store; args: readonly unknown[] }>
export type WorkerReply = Readonly<{ id: number; result?: unknown; error?: string }>

const store = createStore(workerData as StoreOptions)
const port = parentPort!

port.on('message', (call: WorkerCall) => {
  try {
    const method = store[call.method] as (...args: readonly unknown[]) => unknown
    port.postMessage({ id: call.id, result: method(...call.args) } satisfies WorkerReply)
  } catch (cause) {
    port.postMessage({ id: call.id, error: String(cause) } satisfies WorkerReply)
  }
})
