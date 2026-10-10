import { fstatSync } from 'node:fs'
import { InputFailure } from '../diagnostic.ts'
import { InputFramer, type TerminalInput } from './framer.ts'
import { setRawChecked } from './raw-mode.ts'
import { ModeReplies } from './mode-replies.ts'

export interface TerminalPort {
  readonly size: { readonly columns: number; readonly rows: number }
  listen(handler: (event: TerminalInput) => void, resized: () => void): void
  write(bytes: string): Promise<void>
  stopInput(): Promise<void>
  restore(): Promise<void>
}
function output(bytes: string): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(bytes, error =>
      error ? reject(new InputFailure('output-failed')) : resolve(),
    )
  })
}
class DirectTerminal implements TerminalPort {
  #handler: (event: TerminalInput) => void = () => {}
  #resized: () => void = () => {}
  #mode: ((value: number, privateMode: number) => void) | undefined
  readonly #pendingModes = new Map<number, number>()
  #changed = false
  #alternate = false
  #released = false
  #restoreFailed = false
  #changingRaw = false
  #inputFailed = false
  #outputFailed = false
  #eof = false
  readonly #replies = new ModeReplies(
    bytes => this.#framer.feed(bytes),
    (value, privateMode) => this.#receiveMode(value, privateMode),
    () => this.#pendingModes.size !== 0,
  )
  readonly #framer = new InputFramer(event => {
    if (event.kind === 'mode') this.#receiveMode(event.value, event.privateMode)
    else {
      if (event.kind === 'eof') this.#eof = true
      if (event.kind === 'input-error') this.#inputFailed = true
      this.#handler(event)
    }
  })
  readonly #data = (bytes: Buffer) => {
    this.#replies.feed(bytes)
  }
  readonly #end = () => {
    this.#replies.eof()
    this.#framer.eof()
  }
  readonly #resize = () => this.#resized()
  readonly #error = () => {
    if (!this.#changingRaw) this.#framer.error()
  }
  readonly #outputError = () => {
    this.#outputFailed = true
    this.#handler({ kind: 'output-error' })
  }
  get size() {
    return { columns: process.stdout.columns, rows: process.stdout.rows }
  }
  listen(handler: (event: TerminalInput) => void, resized: () => void): void {
    this.#handler = handler
    this.#resized = resized
    if (this.#inputFailed) handler({ kind: 'input-error' })
    if (this.#outputFailed) handler({ kind: 'output-error' })
    if (this.#eof) handler({ kind: 'eof' })
  }
  #setRaw(enabled: boolean): void {
    this.#changingRaw = true
    try {
      setRawChecked(process.stdin, enabled)
    } finally {
      this.#changingRaw = false
    }
  }
  async start(): Promise<void> {
    process.stdin.on('data', this.#data)
    process.stdin.on('end', this.#end)
    process.stdin.on('error', this.#error)
    process.stdout.on('resize', this.#resize)
    process.stdout.on('error', this.#outputError)
    try {
      this.#setRaw(true)
      process.stdin.resume()
      const mode = await this.#query()
      if (mode !== 1 && mode !== 2) throw new InputFailure('tty-unsupported')
      await this.#acquireScreen()
      if (mode === 2) {
        // Set before writing: a failed/partial external write is not rollback.
        this.#changed = true
        await output('\x1b[?2004h')
        if ((await this.#query()) !== 1) throw new InputFailure('tty-unsupported')
      }
      if (this.#inputFailed || this.#outputFailed || this.#eof)
        throw new InputFailure('input-unavailable')
    } catch (error) {
      await this.stopInput()
      await this.restore()
      throw error
    }
  }
  async #acquireScreen(): Promise<void> {
    if ((await this.#query(1049)) !== 2) throw new InputFailure('tty-unsupported')
    this.#alternate = true
    await output('\x1b[?1049h')
    if ((await this.#query(1049)) !== 1) throw new InputFailure('tty-unsupported')
  }
  async #query(privateMode = 2004): Promise<number> {
    if (this.#mode || this.#eof) throw new InputFailure('tty-unsupported')
    const pending = Promise.withResolvers<number>()
    const timer = setTimeout(() => pending.reject(new InputFailure('tty-unsupported')), 2000)
    this.#mode = (value, actualMode) => {
      if (actualMode === privateMode) pending.resolve(value)
    }
    // Observe rejection while an actual write is still outstanding. Awaiting that
    // write remains mandatory; the query timeout is not an output drain deadline.
    void pending.promise.catch(() => {})
    try {
      this.#pendingModes.set(privateMode, (this.#pendingModes.get(privateMode) ?? 0) + 1)
      await output(`\x1b[?${privateMode}$p`)
      return await pending.promise
    } finally {
      clearTimeout(timer)
      this.#mode = undefined
    }
  }
  #receiveMode(value: number, privateMode: number): boolean {
    const count = this.#pendingModes.get(privateMode)
    if (count === undefined) return false
    if (count > 1) this.#pendingModes.set(privateMode, count - 1)
    else {
      this.#pendingModes.delete(privateMode)
      this.#mode?.(value, privateMode)
    }
    return true
  }
  write(bytes: string): Promise<void> {
    return output(bytes)
  }
  async stopInput(): Promise<void> {
    const handler = this.#handler
    this.#handler = event => {
      if (event.kind === 'input-error' || event.kind === 'output-error') handler(event)
    }
    this.#resized = () => {}
    process.stdout.off('resize', this.#resize)
    await this.#replies.drainHeld()
    await this.#framer.stop()
  }
  async #restoreModes(): Promise<boolean> {
    let failed = false
    for (const [changed, privateMode] of [
      [this.#changed, 2004],
      [this.#alternate, 1049],
    ] as const) {
      if (!changed) continue
      try {
        await output(`\x1b[?${privateMode}l`)
        if ((await this.#query(privateMode)) !== 2) failed = true
      } catch {
        failed = true
      }
    }
    return !failed
  }

  async restore(): Promise<void> {
    if (this.#released) {
      if (this.#restoreFailed) throw new InputFailure('input-restore-failed')
      return
    }
    let failed = true
    try {
      failed = !(await this.#restoreModes())
    } finally {
      // A timed-out query can still own half a report. Error is not EOF.
      await this.#replies.drainHeld()
      try {
        this.#setRaw(false)
      } catch {
        failed = true
      }
      process.stdin.pause()
      process.stdin.off('data', this.#data)
      process.stdin.off('end', this.#end)
      process.stdin.off('error', this.#error)
      process.stdout.off('resize', this.#resize)
      process.stdout.off('error', this.#outputError)
      this.#framer.dispose()
      this.#released = true
      failed ||= this.#inputFailed || this.#outputFailed
      this.#restoreFailed = failed
    }
    if (failed) throw new InputFailure('input-restore-failed')
  }
}
function requireTerminalProfile(profile: string): void {
  const legacyItermProfile = profile === 'iterm-3.7.1beta1' && process.platform === 'darwin'
  if (profile !== '' && profile !== 'auto' && profile !== 'xterm-379' && !legacyItermProfile)
    throw new InputFailure('tty-unsupported')
}
export async function openTerminal(profile = 'auto'): Promise<TerminalPort> {
  requireTerminalProfile(profile)
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new InputFailure('tty-required')
  const input = fstatSync(process.stdin.fd),
    screen = fstatSync(process.stdout.fd)
  if (
    !input.isCharacterDevice() ||
    !screen.isCharacterDevice() ||
    input.rdev !== screen.rdev ||
    process.stdin.isRaw ||
    process.stdin.readableFlowing === true ||
    process.stdin.listenerCount('data') !== 0 ||
    process.stdin.readableEncoding !== null ||
    !Number.isSafeInteger(process.stdout.columns) ||
    !Number.isSafeInteger(process.stdout.rows) ||
    process.stdout.columns < 60 ||
    process.stdout.rows < 16
  )
    throw new InputFailure('tty-unsupported')
  const terminal = new DirectTerminal()
  await terminal.start()
  return terminal
}
