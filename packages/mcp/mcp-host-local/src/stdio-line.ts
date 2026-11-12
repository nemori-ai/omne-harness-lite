// The stdio line: one process handle's stdin and stdout. It writes one JSON-RPC message per line
// and reads one per line, holding every line to the byte bound; it reports when stdout ended and
// when the process exited, with the two instants on one clock, so that the contract's exit window
// (T8, `PROCESS_EXIT_WINDOW_MS`) can tell a crash from a closed pipe. It reads standard error and
// discards it. It never stops the process: the holder of the handle does. Its `close()` depends
// on local resources only: the write end is aborted, never drained, so a peer that does not read
// stdin cannot hold it (SPEC H6).
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
  /** Fires on `close()`: a `send` still waiting on the pipe reports `aborted` then. */
  private readonly closing = new AbortController()
  private closed = false
  /** The one close in progress, once `close()` ran: every caller of `close()` gets it. */
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

  /**
   * Settles what is already observable before the transport is handed over: a process that has
   * exited, a stdout that has ended. One turn of the loop lets their reactions run; it waits for
   * nothing that has not happened yet.
   */
  async ready(): Promise<void> {
    await new Promise<void>(resolve => setImmediate(resolve))
  }

  /** The instant of an event on one clock: the contract's exit window compares two of them (T8). */
  private now(): number {
    return /* wall-clock: operation-timing -- the exit window of contract T8 compares stdout's end and the exit on one clock */ performance.now()
  }

  /**
   * Reads stdout line by line. Each line is measured in bytes, wherever it starts in a chunk; a
   * line above the byte bound breaks the stream (contract T2).
   */
  private async readStdout(): Promise<void> {
    const decoder = new TextDecoder('utf-8', { fatal: false })
    /** The line in progress: its text so far and its bytes so far. */
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

  /**
   * Writes one line. A write to a process that exited, or a write that fails, is `unsent` (X02).
   * The signal ends the wait for a write that has not completed: the line is not writable any
   * more, the shared stream counts as broken, and the exchange is `aborted`. The write itself is
   * aborted on the stream; that takes effect when the process reads or ends, which the holder of
   * the handle decides.
   */
  async send(outbound: Outbound, signal: AbortSignal): Promise<Exchange> {
    if (this.closed || !this.writable || this.exitedAt !== undefined) return { kind: 'unsent' }
    if (signal.aborted) return { kind: 'aborted' }
    // The write to a full pipe does not reject when the write end is aborted; it settles only when
    // the peer reads or ends. So the wait is raced against the signal and against `close()`, and
    // the listener is removed whichever wins, so a write nobody waits for leaves none behind (N1).
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
          // The stream is unusable now, whatever the process does next.
          if (!this.closed) this.queue.push({ kind: 'broken' })
          return { kind: 'aborted' }
      }
    } finally {
      ended.removeEventListener('abort', onAbort)
    }
  }

  /**
   * T5: the stdin write end first, then the stdout read; the process is left alone. Closing is
   * giving up: the session settled every request before it closes the line, so no byte still
   * needs to reach the peer. The write end is aborted and never drained: a web write completes
   * when the lower layer took the bytes, not when the peer read them, so draining would wait on a
   * peer that does not read stdin (SPEC H6). `close()` does not wait for the buffer to drain, but
   * the bytes already handed to Node may still reach the peer: with a write in flight the abort
   * takes effect only once that write ended, so the peer sees the end of its input after it. The
   * read loops of stdout and standard error have ended when this returns. Every call gets the one
   * close: a second call completes when the first does.
   */
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
