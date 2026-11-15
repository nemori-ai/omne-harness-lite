import { PROCESS_EXIT_WINDOW_MS } from '@omne-harness/mcp-contract'
import type { ProcessHandle } from '@omne-harness/mcp-contract/provider'
import { BYTE_LIMIT } from './limits.ts'
import type { Exchange, Line, LineEvent, Outbound } from './line.ts'
import { AsyncQueue } from './queue.ts'

const NEWLINE = 0x0a
const encoder = new TextEncoder()

export class StdioLine implements Line {
  readonly kind = 'stdio'
  readonly events: AsyncIterable<LineEvent>
  private readonly queue = new AsyncQueue<LineEvent>()
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>
  private readonly stdout: ReadableStreamDefaultReader<Uint8Array>
  private readonly stderr: ReadableStreamDefaultReader<string>
  private readonly exited: Promise<void>
  private readonly reading: Promise<void>
  private readonly draining: Promise<void>
  private stdoutEndedAt: number | undefined
  private exitedAt: number | undefined
  private announced = false
  private window: ReturnType<typeof setTimeout> | undefined
  private writable = true
  private readonly closing = new AbortController()
  private closed = false
  private closeDone: Promise<void> | undefined

  constructor(process: ProcessHandle) {
    this.events = this.queue
    this.writer = process.stdin.getWriter()
    this.stdout = process.stdout.getReader()
    this.stderr = process.stderr.getReader()
    // One reaction on the handle's own promise: the line sees the exit before anyone who awaited
    // the promise after it goes on.
    this.exited = process.exited.then(
      () => this.onExited(),
      () => this.onExited(),
    )
    this.reading = this.readStdout()
    this.draining = this.drainStderr()
  }

  async ready(): Promise<void> {
    await new Promise<void>(resolve => setImmediate(resolve))
  }

  private now(): number {
    return /* wall-clock: operation-timing -- the exit window of contract T8 compares stdout's end and the exit on one clock */ performance.now()
  }

  private async readStdout(): Promise<void> {
    const decoder = new TextDecoder('utf-8', { fatal: false })
    let buffered = ''
    let pendingBytes = 0
    let broken = false
    try {
      for (;;) {
        const next = await this.stdout.read()
        if (next.done) break
        const chunk = next.value
        let start = 0
        for (let at = chunk.indexOf(NEWLINE); at >= 0; at = chunk.indexOf(NEWLINE, start)) {
          if (pendingBytes + (at - start) > BYTE_LIMIT) {
            broken = true
            break
          }
          this.deliver(buffered + decoder.decode(chunk.subarray(start, at)))
          buffered = ''
          pendingBytes = 0
          start = at + 1
        }
        if (broken) break
        pendingBytes += chunk.byteLength - start
        if (pendingBytes > BYTE_LIMIT) {
          broken = true
          break
        }
        buffered += decoder.decode(chunk.subarray(start), { stream: true })
      }
      const tail = buffered + decoder.decode()
      if (!broken && tail !== '') this.deliver(tail)
    } catch {}
    if (broken) {
      await this.stdout.cancel().catch(() => undefined)
      this.stdoutEndedAt ??= this.now()
      this.announce()
      return
    }
    this.onStdoutEnded()
  }

  private deliver(text: string): void {
    this.queue.push({ kind: 'line', text: text.endsWith('\r') ? text.slice(0, -1) : text })
  }

  private async drainStderr(): Promise<void> {
    try {
      for (;;) {
        const next = await this.stderr.read()
        if (next.done) return
      }
    } catch {}
  }

  private onStdoutEnded(): void {
    if (this.stdoutEndedAt !== undefined || this.closed) return
    this.stdoutEndedAt = this.now()
    if (this.exitedAt !== undefined) return this.announce()
    this.window = setTimeout(() => this.announce(), PROCESS_EXIT_WINDOW_MS)
  }

  private onExited(): void {
    if (this.exitedAt !== undefined || this.closed) return
    this.exitedAt = this.now()
    if (this.stdoutEndedAt !== undefined) return this.announce()
    this.window = setTimeout(() => {
      this.announce()
      void this.stdout.cancel().catch(() => undefined)
    }, PROCESS_EXIT_WINDOW_MS)
  }

  private announce(): void {
    if (this.announced || this.closed) return
    this.announced = true
    clearTimeout(this.window)
    this.queue.push({
      kind: 'ended',
      ...(this.stdoutEndedAt === undefined ? {} : { stdoutEndedAt: this.stdoutEndedAt }),
      ...(this.exitedAt === undefined ? {} : { exitedAt: this.exitedAt }),
    })
  }

  async send(outbound: Outbound, signal: AbortSignal): Promise<Exchange> {
    if (this.closed || !this.writable || this.exitedAt !== undefined) return { kind: 'unsent' }
    if (signal.aborted) return { kind: 'aborted' }
    const ended = AbortSignal.any([signal, this.closing.signal])
    let onAbort: () => void = () => undefined
    const aborted = new Promise<'aborted'>(resolve => {
      onAbort = () => resolve('aborted')
      ended.addEventListener('abort', onAbort, { once: true })
    })
    const written = this.writer.write(encoder.encode(`${outbound.text}\n`)).then(
      () => 'written' as const,
      () => 'failed' as const,
    )
    try {
      switch (await Promise.race([written, aborted])) {
        case 'written':
          return { kind: 'sent' }
        case 'failed':
          this.writable = false
          return { kind: 'unsent' }
        case 'aborted':
          this.writable = false
          void this.writer.abort(new Error('the write was abandoned')).catch(() => undefined)
          if (!this.closed) this.queue.push({ kind: 'broken' })
          return { kind: 'aborted' }
      }
    } finally {
      ended.removeEventListener('abort', onAbort)
    }
  }

  close(): Promise<void> {
    this.closeDone ??= this.shutdown()
    return this.closeDone
  }

  private async shutdown(): Promise<void> {
    this.closed = true
    clearTimeout(this.window)
    this.writable = false
    this.closing.abort()
    void this.writer.abort(new Error('the line closed')).catch(() => undefined)
    await this.stdout.cancel().catch(() => undefined)
    await this.stderr.cancel().catch(() => undefined)
    await Promise.all([this.reading, this.draining])
    this.queue.end()
  }
}
