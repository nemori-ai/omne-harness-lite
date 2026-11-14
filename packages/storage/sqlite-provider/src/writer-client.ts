import { Worker } from 'node:worker_threads'
import type {
  WalState,
  WorkerEnv,
  WorkerEnvelope,
  WorkerEvent,
  WorkerRequest,
} from './worker/protocol.ts'

export class WorkerExited extends Error {}

/** The caller stops observing after `ms`; the request ends only with the reply or the Worker exit,
 *  so what it holds goes back with that, never with the observation. */
export async function observeReply<T>(
  send: () => Promise<T>,
  ms: number,
  expire: () => void,
): Promise<T> {
  const observation = setTimeout(expire, ms)
  try {
    return await send()
  } finally {
    clearTimeout(observation)
  }
}

const WRITER_EXTENSION = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
const WRITER_URL = new URL(`./worker/writer.${WRITER_EXTENSION}`, import.meta.url)

type Waiter = Readonly<{ resolve(reply: unknown): void; reject(error: Error): void }>

export class WriterClient {
  readonly exited: Promise<void>
  private readonly worker: Worker
  private readonly generation: number
  private readonly waiting = new Map<number, Waiter>()
  private readonly closingFlag = new Int32Array(new SharedArrayBuffer(4))
  private nextId = 1
  private ended = false
  private closeRequested = false

  constructor(
    env: Omit<WorkerEnv, 'closingFlag'>,
    onUnexpectedExit: () => void,
    onWalState: (state: WalState) => void = () => undefined,
  ) {
    this.generation = env.generation
    const workerData: WorkerEnv = {
      ...env,
      closingFlag: this.closingFlag.buffer as SharedArrayBuffer,
    }
    this.worker = new Worker(WRITER_URL, { workerData })
    this.worker.on('message', (envelope: WorkerEnvelope | WorkerEvent) => {
      if (envelope.generation !== this.generation) return
      if ('event' in envelope) {
        onWalState(envelope.state)
        return
      }
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

  markClosing(): void {
    Atomics.store(this.closingFlag, 0, 1)
  }

  async close(): Promise<void> {
    this.closeRequested = true
    this.markClosing()
    if (!this.ended) await this.request({ kind: 'close' }).catch(() => undefined)
    await this.exited
  }

  get hasExited(): boolean {
    return this.ended
  }
}
