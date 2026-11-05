// The stdio line: one process handle's stdin and stdout. It writes one JSON-RPC message per line
// and reads one per line; it reports when stdout ended and when the process exited, with the two
// instants on one clock, so that the contract's exit window (T8, `PROCESS_EXIT_WINDOW_MS`) can
// tell a crash from a closed pipe. It reads standard error and discards it. It never stops the
// process: the holder of the handle does.
import { PROCESS_EXIT_WINDOW_MS } from '@omne-harness/mcp-contract'
import type { ProcessHandle } from '@omne-harness/mcp-contract/provider'
import { BYTE_LIMIT } from './limits.ts'
import type { Exchange, Line, LineEvent, Outbound } from './line.ts'
import { AsyncQueue } from './queue.ts'

const encoder = new TextEncoder()

export class StdioLine implements Line {
  readonly kind = 'stdio'
  readonly events: AsyncIterable<LineEvent>
  private readonly queue = new AsyncQueue<LineEvent>()
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>
  private readonly stdout: ReadableStreamDefaultReader<Uint8Array>
  private readonly stderr: ReadableStreamDefaultReader<string>
  private readonly exited: Promise<void>
  private stdoutEndedAt: number | undefined
  private exitedAt: number | undefined
  private announced = false
  private window: ReturnType<typeof setTimeout> | undefined
  private writable = true
  private closed = false

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
    void this.readStdout()
    void this.drainStderr()
  }

  /**
   * Settles what is already observable before the transport is handed over: a process that has
   * exited, a stdout that has ended. It waits for nothing that has not happened yet.
   */
  async ready(): Promise<void> {
    await Promise.race([this.exited, Promise.resolve()])
    await new Promise<void>(resolve => setImmediate(resolve))
  }

  /** The instant of an event on one clock: the contract's exit window compares two of them (T8). */
  private now(): number {
    return /* wall-clock: operation-timing -- the exit window of contract T8 compares stdout's end and the exit on one clock */ performance.now()
  }

  private async readStdout(): Promise<void> {
    const decoder = new TextDecoder('utf-8', { fatal: false })
    let buffered = ''
    /** The bytes of `buffered`: the line in progress. */
    let pendingBytes = 0
    let broken = false
    try {
      for (;;) {
        const next = await this.stdout.read()
        if (next.done) break
        buffered += decoder.decode(next.value, { stream: true })
        let newline = buffered.indexOf('\n')
        if (newline < 0) {
          pendingBytes += next.value.byteLength
          if (pendingBytes <= BYTE_LIMIT) continue
          broken = true
          break
        }
        // The first line of the chunk may have been in progress; its bytes are measured exactly.
        if (encoder.encode(buffered.slice(0, newline)).byteLength > BYTE_LIMIT) {
          broken = true
          break
        }
        while (newline >= 0) {
          this.deliver(buffered.slice(0, newline))
          buffered = buffered.slice(newline + 1)
          newline = buffered.indexOf('\n')
        }
        pendingBytes = encoder.encode(buffered).byteLength
      }
      const tail = buffered + decoder.decode()
      if (!broken && tail !== '' && pendingBytes <= BYTE_LIMIT) this.deliver(tail)
    } catch {
      // stdout errored or was cancelled: it ended either way.
    }
    if (broken) {
      // One line above the byte bound breaks the stream (contract T2): the stream is unusable
      // now, whatever the process does next.
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
    } catch {
      // Standard error is read only so that the process does not block on it.
    }
  }

  /** stdout ended: the exit within the window decides the cause (T8). */
  private onStdoutEnded(): void {
    if (this.stdoutEndedAt !== undefined || this.closed) return
    this.stdoutEndedAt = this.now()
    if (this.exitedAt !== undefined) return this.announce()
    this.window = setTimeout(() => this.announce(), PROCESS_EXIT_WINDOW_MS)
  }

  /** The process exited: stdout is read for the window, then the event goes out. */
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

  /** Writes one line. A write to a process that exited, or a write that fails, is `unsent` (X02). */
  async send(outbound: Outbound): Promise<Exchange> {
    if (this.closed || !this.writable || this.exitedAt !== undefined) return { kind: 'unsent' }
    try {
      await this.writer.write(encoder.encode(`${outbound.text}\n`))
    } catch {
      this.writable = false
      return { kind: 'unsent' }
    }
    return { kind: 'sent' }
  }

  /** T5: the stdin write end first, then the stdout read; the process is left alone. */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.window)
    this.writable = false
    await this.writer.close().catch(() => undefined)
    await this.stdout.cancel().catch(() => undefined)
    await this.stderr.cancel().catch(() => undefined)
    this.queue.end()
  }
}
