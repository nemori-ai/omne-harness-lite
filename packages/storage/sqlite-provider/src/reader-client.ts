// The control side of one read Worker: start, one request at a time, reply matching and exit
// observation (SPEC 9.5). A reply counts only when its Worker generation, request number and lease
// token all match the request in flight, and that request is not settled. Anything else is dropped.
import { Worker } from 'node:worker_threads'
import type { ReaderEnv, ReaderEnvelope, ReaderReply, ReaderRequest } from './worker/reader-protocol.ts'
import { WorkerExited } from './writer-client.ts'

const READER_EXTENSION = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
const READER_URL = new URL(`./worker/reader.${READER_EXTENSION}`, import.meta.url)

type InFlight = {
  readonly seq: number
  readonly token: string
  settled: boolean
  readonly resolve: (reply: ReaderReply) => void
  readonly reject: (error: Error) => void
}

export class ReaderClient {
  /** Settles when the Worker has ended. */
  readonly exited: Promise<void>
  readonly generation: number
  private readonly worker: Worker
  private current: InFlight | null = null
  private nextSeq = 1
  private ended = false
  private closeRequested = false

  constructor(env: ReaderEnv, onExit: () => void) {
    this.generation = env.generation
    this.worker = new Worker(READER_URL, { workerData: env })
    this.worker.on('message', (envelope: ReaderEnvelope) => this.receive(envelope))
    this.exited = new Promise(resolve => {
      this.worker.on('exit', () => {
        if (this.ended) return
        this.ended = true
        const waiting = this.current
        this.current = null
        if (waiting !== null && !waiting.settled) {
          waiting.settled = true
          waiting.reject(new WorkerExited('worker exited'))
        }
        onExit()
        resolve()
      })
      // A Worker that fails to start emits error and then exit.
      this.worker.on('error', () => undefined)
    })
  }

  /** Takes a message from the Worker. Returns true when it settled the request in flight. */
  receive(envelope: ReaderEnvelope): boolean {
    const waiting = this.current
    if (
      waiting === null ||
      waiting.settled ||
      envelope.generation !== this.generation ||
      envelope.seq !== waiting.seq ||
      envelope.token !== waiting.token
    )
      return false
    waiting.settled = true
    this.current = null
    waiting.resolve(envelope.reply)
    return true
  }

  /** One request at a time. Rejects with WorkerExited when the Worker ends first. */
  call(request: ReaderRequest, token: string): Promise<ReaderReply> {
    if (this.ended) return Promise.reject(new WorkerExited('worker exited'))
    if (this.current !== null) return Promise.reject(new Error('request already in flight'))
    const seq = this.nextSeq
    this.nextSeq += 1
    return new Promise<ReaderReply>((resolve, reject) => {
      this.current = { seq, token, settled: false, resolve, reject }
      this.worker.postMessage({ generation: this.generation, seq, token, request })
    })
  }

  /**
   * Asks the Worker to close its connection and end, then waits for the exit. The close message
   * queues in the Worker behind the request in flight. Its reply matches nothing and is dropped.
   */
  async close(): Promise<void> {
    if (!this.closeRequested && !this.ended) {
      this.closeRequested = true
      this.worker.postMessage({
        generation: this.generation,
        seq: this.nextSeq,
        token: 'close',
        request: { kind: 'close' },
      })
      this.nextSeq += 1
    }
    await this.exited
  }

  get hasExited(): boolean {
    return this.ended
  }
}
