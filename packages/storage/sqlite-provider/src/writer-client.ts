// The control side of one write Worker: start, request and reply matching, and exit observation.
// Requests settle with the reply, or reject with WorkerExited when the Worker ends first. Nothing
// here judges a result. The domain state and the operations decide what a reply or an exit means.
import { Worker } from 'node:worker_threads'
import type { WorkerEnv, WorkerEnvelope, WorkerRequest } from './worker/protocol.ts'

export class WorkerExited extends Error {}

const WRITER_EXTENSION = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
const WRITER_URL = new URL(`./worker/writer.${WRITER_EXTENSION}`, import.meta.url)

type Waiter = Readonly<{ resolve(reply: unknown): void; reject(error: Error): void }>

export class WriterClient {
  /** Settles when the Worker has ended. */
  readonly exited: Promise<void>
  private readonly worker: Worker
  private readonly waiting = new Map<number, Waiter>()
  private nextId = 1
  private ended = false
  private closeRequested = false

  constructor(env: WorkerEnv, onUnexpectedExit: () => void) {
    this.worker = new Worker(WRITER_URL, { workerData: env })
    this.worker.on('message', (envelope: WorkerEnvelope) => {
      const waiter = this.waiting.get(envelope.id)
      this.waiting.delete(envelope.id)
      waiter?.resolve(envelope.reply)
    })
    this.exited = new Promise(resolve => {
      const finish = (): void => {
        if (this.ended) return
        this.ended = true
        for (const waiter of this.waiting.values()) waiter.reject(new WorkerExited('worker exited'))
        this.waiting.clear()
        if (!this.closeRequested) onUnexpectedExit()
        resolve()
      }
      this.worker.on('exit', finish)
      // A Worker that fails to start emits error and then exit.
      this.worker.on('error', () => undefined)
    })
  }

  request<T>(request: WorkerRequest): Promise<T> {
    if (this.ended) return Promise.reject(new WorkerExited('worker exited'))
    const id = this.nextId
    this.nextId += 1
    return new Promise<T>((resolve, reject) => {
      this.waiting.set(id, { resolve: reply => resolve(reply as T), reject })
      this.worker.postMessage({ id, request })
    })
  }

  /** Asks the Worker to close its connection and end, then waits for the exit. */
  async close(): Promise<void> {
    this.closeRequested = true
    if (!this.ended) await this.request({ kind: 'close' }).catch(() => undefined)
    await this.exited
  }

  get hasExited(): boolean {
    return this.ended
  }
}
