import { Input } from '@earendil-works/pi-tui'
import { FIELD_LIMIT, validFieldText } from './field-text.ts'
import { FrameWriter, layout, type Screen } from './screen.ts'
import type { TerminalPort } from './terminal.ts'
import type { TerminalInput } from './framer.ts'

export class Dialog {
  readonly #terminal: TerminalPort
  readonly #writer: FrameWriter
  readonly #cancel: () => void
  #identity: readonly string[] = ['Center: unknown', 'Account: unknown', 'Organization: unknown']
  #screen: Screen = {
    identity: this.#identity,
    title: 'Opening governance center',
    body: [],
    footer: 'Ctrl+C: exit',
    page: 0,
  }
  #following = true
  #revision = 0
  #eligible = false
  #fieldVisible = false
  #visited = new Set<number>()
  #pages = 1
  #waiting:
    | {
        readonly result: ReturnType<typeof Promise.withResolvers<string | undefined>>
        readonly auto: boolean
        readonly requirePageReview: boolean
      }
    | undefined
  #stopped = false
  #inputFailed = false
  #outputFailed = false
  #stop: Promise<void> | undefined
  constructor(terminal: TerminalPort, cancel: () => void) {
    this.#terminal = terminal
    this.#cancel = cancel
    this.#writer = new FrameWriter(bytes => terminal.write(bytes), cancel)
    terminal.listen(
      event => this.#event(event),
      () => {
        this.#visited.clear()
        this.#draw()
      },
    )
  }
  get outputFailed(): boolean {
    return this.#writer.failed || this.#outputFailed
  }
  get inputFailed(): boolean {
    return this.#inputFailed
  }
  identity(lines: readonly string[]): void {
    this.#identity = lines
    this.#draw()
  }
  #draw(): void {
    if (this.#stopped) return
    this.#eligible = false
    const revision = ++this.#revision
    const frame = layout(
      { ...this.#screen, identity: this.#identity },
      this.#terminal.size.columns,
      this.#terminal.size.rows,
    )
    this.#screen = { ...this.#screen, page: frame.page }
    this.#pages = frame.pages
    if (!frame.fits) this.#fieldVisible = false
    this.#writer.submit({
      revision,
      bytes: frame.bytes,
      rendered: frame.rendered,
      delivered: () => {
        if (!frame.fits || revision !== this.#revision || this.#stopped) return
        this.#eligible = true
        this.#fieldVisible = true
        this.#visited.add(frame.page)
        if (this.#waiting?.auto && this.#visited.size === this.#pages) this.#resolve('')
      },
    })
  }
  #resolve(value: string | undefined): void {
    const waiting = this.#waiting
    this.#waiting = undefined
    this.#eligible = false
    this.#fieldVisible = false
    // Drop the only active Input and its history as soon as the step ends.
    const { input: _input, ...screen } = this.#screen
    this.#screen = screen
    waiting?.result.resolve(value)
  }
  #event(event: TerminalInput): void {
    if (event.kind === 'input-error' || event.kind === 'output-error') {
      if (event.kind === 'input-error') this.#inputFailed = true
      else this.#outputFailed = true
      this.#cancel()
      return
    }
    if (this.#stopped) return
    this.#activeEvent(event)
  }
  #activeEvent(event: TerminalInput): void {
    if (
      event.kind === 'eof' ||
      (event.kind === 'key' && (event.text === '\x03' || event.text === '\x04'))
    ) {
      this.#cancel()
      return
    }
    if (event.kind === 'invalid') {
      this.#screen = { ...this.#screen, footer: 'Input rejected. Ctrl+C: exit | PgUp/PgDn: pages' }
      this.#draw()
      return
    }
    if (event.kind !== 'key' && event.kind !== 'paste') return
    // Busy/backpressured keys never become a queued action in the next screen.
    if (this.#waiting || paging(event)) this.#interact(event)
  }
  #interact(event: Extract<TerminalInput, { kind: 'key' | 'paste' }>): void {
    if (paging(event)) {
      if (!this.#eligible) return
      this.#screen = {
        ...this.#screen,
        page: Math.max(
          0,
          Math.min(this.#pages - 1, this.#screen.page + (event.text === '\x1b[5~' ? -1 : 1)),
        ),
      }
      this.#following = this.#screen.page === this.#pages - 1
      this.#draw()
      return
    }
    if (event.kind === 'key' && event.text === '\x07') {
      this.#resolve(undefined)
      return
    }
    if (event.kind === 'key' && event.text === '\r') {
      this.#confirm()
      return
    }
    this.#edit(event)
  }
  #confirm(): void {
    if (!this.#eligible) return
    if (this.#waiting?.requirePageReview && this.#visited.size !== this.#pages) {
      this.#screen = {
        ...this.#screen,
        footer: 'Read every page with PgUp/PgDn before continuing. Ctrl+C: exit',
      }
      this.#draw()
      return
    }
    this.#resolve(this.#screen.input?.getValue() ?? '')
  }
  #edit(event: Extract<TerminalInput, { kind: 'key' | 'paste' }>): void {
    const input = this.#screen.input
    if (!input || !this.#fieldVisible) return
    if (event.kind === 'key' && event.text === '\x15') {
      const replacement = new Input({ prompt: '> ' })
      replacement.focused = true
      this.#screen = { ...this.#screen, input: replacement }
      this.#draw()
      return
    }
    const editing = new Set([
      '\x01',
      '\x05',
      '\x02',
      '\x06',
      '\x08',
      '\x7f',
      '\x1f',
      '\x1b[D',
      '\x1b[C',
      '\x1b[H',
      '\x1b[F',
      '\x1bOH',
      '\x1bOF',
      '\x1b[1~',
      '\x1b[4~',
      '\x1b[3~',
    ])
    if (event.kind === 'key' && editing.has(event.text)) input.handleInput(event.text)
    else if (
      validFieldText(event.text) &&
      Buffer.byteLength(input.getValue()) + Buffer.byteLength(event.text) <= FIELD_LIMIT
    )
      input.handleInput(
        event.kind === 'paste' ? '\x1b[200~' + event.text + '\x1b[201~' : event.text,
      )
    else
      this.#screen = {
        ...this.#screen,
        footer: 'Unsupported key or input capacity exceeded. Ctrl+U: clear | Ctrl+C: exit',
      }
    this.#draw()
  }
  async #show(
    title: string,
    body: readonly string[],
    input: boolean,
    auto: boolean,
    requirePageReview = true,
  ): Promise<string | undefined> {
    if (this.#stopped) return undefined
    if (this.#waiting) throw new Error('overlapping dialog')
    this.#following = true
    const field = input ? new Input({ prompt: '> ' }) : undefined
    if (field) field.focused = true
    this.#screen = {
      identity: this.#identity,
      title,
      body,
      page: requirePageReview ? 0 : Number.MAX_SAFE_INTEGER,
      footer: requirePageReview
        ? 'Enter: continue | Ctrl+G: cancel | Ctrl+C: exit | PgUp/PgDn: pages'
        : 'Enter: send | Ctrl+G: cancel | Ctrl+C: exit | PgUp/PgDn: history',
      ...(field ? { input: field } : {}),
    }
    this.#visited.clear()
    this.#fieldVisible = false
    const result = Promise.withResolvers<string | undefined>()
    this.#waiting = { result, auto, requirePageReview }
    this.#draw()
    return result.promise
  }
  progress(title: string, body: readonly string[]): void {
    if (this.#stopped) return
    if (this.#waiting) throw new Error('progress overlaps input')
    this.#screen = {
      identity: this.#identity,
      title,
      body,
      page: this.#following ? Number.MAX_SAFE_INTEGER : this.#screen.page,
      footer: 'Working | Ctrl+C: detach | PgUp/PgDn: pages',
    }
    this.#draw()
  }
  text(title: string, body: readonly string[] = []): Promise<string | undefined> {
    return this.#show(title, body, true, false)
  }
  compose(title: string, body: readonly string[]): Promise<string | undefined> {
    return this.#show(title, body, true, false, false)
  }
  async choose(
    title: string,
    options: readonly string[],
    body: readonly string[] = [],
  ): Promise<number | undefined> {
    for (;;) {
      const answer = await this.text(title, [
        ...body,
        ...options.map((label, i) => `${i + 1}. ${label}`),
      ])
      if (answer === undefined) return undefined
      if (
        /^[1-9][0-9]*$/.test(answer) &&
        Number.isSafeInteger(Number(answer)) &&
        Number(answer) <= options.length
      )
        return Number(answer) - 1
    }
  }
  async show(title: string, body: readonly string[], auto = false): Promise<boolean> {
    return (await this.#show(title, body, false, auto)) !== undefined
  }
  stop(): Promise<void> {
    if (this.#stop) return this.#stop
    this.#stopped = true
    this.#eligible = false
    const input = this.#terminal.stopInput()
    const output = this.#writer.close()
    this.#stop = Promise.allSettled([input, output]).then(results => {
      this.#resolve(undefined)
      const failures = results.flatMap(result =>
        result.status === 'rejected' ? [result.reason] : [],
      )
      if (failures.length === 1) throw failures[0]
      if (failures.length)
        throw new AggregateError(failures, 'dialog input and output close failed')
    })
    return this.#stop
  }
}

function paging(event: Extract<TerminalInput, { kind: 'key' | 'paste' }>): boolean {
  return event.kind === 'key' && (event.text === '\x1b[5~' || event.text === '\x1b[6~')
}
