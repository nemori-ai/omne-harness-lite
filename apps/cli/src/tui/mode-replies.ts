const replies = [2004, 1049].flatMap(privateMode =>
  [0, 1, 2, 3, 4].map(value => ({ privateMode, value, bytes: `\x1b[?${privateMode};${value}$y` })),
)

/** D054: iTerm may insert a complete report between any two paste chunks. */
export class ModeReplies {
  readonly #data: (bytes: Uint8Array) => void
  readonly #mode: (value: number, privateMode: number) => void
  #candidate = ''
  #ended = false
  readonly #waiters = new Set<() => void>()

  constructor(
    data: (bytes: Uint8Array) => void,
    mode: (value: number, privateMode: number) => void,
  ) {
    this.#data = data
    this.#mode = mode
  }
  get bufferedBytes(): number {
    return this.#candidate.length
  }
  feed(bytes: Uint8Array): void {
    if (this.#ended) return
    for (const byte of bytes) {
      if (byte === 27) {
        // Preserve an interrupted ordinary prefix before owning the new ESC.
        this.#flush()
        this.#candidate = '\x1b'
      } else if (this.#candidate !== '') {
        this.#candidate += String.fromCharCode(byte)
        const complete = replies.find(reply => reply.bytes === this.#candidate)
        if (complete) {
          this.#candidate = ''
          this.#mode(complete.value, complete.privateMode)
        } else if (!replies.some(reply => reply.bytes.startsWith(this.#candidate))) this.#flush()
      } else this.#data(Uint8Array.of(byte))
    }
    // Resolve only after synchronous downstream delivery, never between bytes.
    if (this.#candidate === '') this.#settle()
  }
  #flush(): void {
    if (this.#candidate === '') return
    const bytes = Buffer.from(this.#candidate, 'latin1')
    this.#candidate = ''
    this.#data(bytes)
  }
  #settle(): void {
    for (const resolve of this.#waiters) resolve()
    this.#waiters.clear()
  }
  /** Query timeout/error is deliberately not a release operation. */
  drainHeld(): Promise<void> {
    if (this.#candidate === '') return Promise.resolve()
    return new Promise(resolve => this.#waiters.add(resolve))
  }
  eof(): void {
    if (this.#ended) return
    this.#ended = true
    this.#flush()
    this.#settle()
  }
}
