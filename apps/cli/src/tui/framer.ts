import { StdinBuffer } from '@earendil-works/pi-tui'
import { FIELD_LIMIT, validFieldText } from './field-text.ts'

export type TerminalInput =
  | { readonly kind: 'key' | 'paste'; readonly text: string }
  | { readonly kind: 'mode'; readonly value: number }
  | { readonly kind: 'invalid' | 'eof' | 'input-error' | 'output-error' }
const START = '\x1b[200~',
  END = '\x1b[201~'
const ordinary = new Set([
  '\x1b[A',
  '\x1b[B',
  '\x1b[C',
  '\x1b[D',
  '\x1b[H',
  '\x1b[F',
  '\x1bOH',
  '\x1bOF',
  '\x1b[1~',
  '\x1b[4~',
  '\x1b[3~',
  '\x1b[5~',
  '\x1b[6~',
])
const decoder = () => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** Owns framing before the library sees any bytes; never feeds it paste bodies. */
export class InputFramer {
  readonly #emit: (event: TerminalInput) => void
  readonly #keys = new StdinBuffer()
  #decoder = decoder()
  #escape = ''
  #discard: 'csi' | 'string' | undefined
  #stringEscape = false
  #paste = false
  #tail = ''
  #text = ''
  #bytes = 0
  #invalid = false
  #stopping = false
  #pendingStart = false
  #ended = false
  #done = Promise.withResolvers<void>()
  constructor(emit: (event: TerminalInput) => void) {
    this.#emit = emit
    this.#keys.on('data', text => {
      if (!this.#stopping) this.#emit({ kind: 'key', text })
    })
  }
  get inPaste(): boolean {
    return this.#paste
  }
  get bufferedBytes(): number {
    return Buffer.byteLength(this.#text) + this.#tail.length + this.#escape.length
  }
  feed(bytes: Uint8Array): void {
    if (this.#ended) return
    for (const byte of bytes) {
      if (this.#paste) this.#pasteByte(byte)
      else this.#ordinaryByte(byte)
    }
  }
  #resetDecoder(): void {
    this.#decoder = decoder()
  }
  #finishText(): boolean {
    try {
      this.#decoder.decode()
      return true
    } catch {
      return false
    } finally {
      this.#resetDecoder()
    }
  }
  #ordinaryByte(byte: number): void {
    if (this.#discard === 'csi') {
      if (byte >= 0x40 && byte <= 0x7e) this.#discard = undefined
      return
    }
    if (this.#discard === 'string') {
      if (byte === 7 || (this.#stringEscape && byte === 92)) this.#discard = undefined
      this.#stringEscape = byte === 27
      return
    }
    if (this.#escape !== '' && (byte === 3 || byte === 7)) {
      // An actual C0 byte cannot continue a paste-begin or mode-reply prefix.
      // A lone Escape itself never times out into a semantic cancellation.
      this.#escape = ''
      if (this.#pendingStart) {
        this.#pendingStart = false
        this.#done.resolve()
      }
      if (!this.#stopping) this.#emit({ kind: 'key', text: String.fromCharCode(byte) })
      return
    }
    if (this.#escape !== '') {
      this.#escape += String.fromCharCode(byte)
      if (this.#escape.length > 64 || byte > 127) {
        if (this.#escape.startsWith('\x1b[') && !(byte >= 0x40 && byte <= 0x7e))
          this.#discard = 'csi'
        this.#escape = ''
        this.#bad()
        if (this.#pendingStart) {
          this.#pendingStart = false
          this.#done.resolve()
        }
        return
      }
      const prefix = this.#escape
      if (prefix.length === 2 && [93, 80, 94, 95, 88].includes(byte)) {
        this.#escape = ''
        this.#discard = 'string'
        this.#stringEscape = false
        this.#bad()
        if (this.#pendingStart) {
          this.#pendingStart = false
          this.#done.resolve()
        }
        return
      }
      // Only CSI/SS3 sequences are accepted. No OSC, mouse, Kitty or Alt text.
      if (prefix.length === 2 && (byte === 91 || byte === 79)) {
        return
      }
      if (prefix.length === 2 || (byte >= 0x40 && byte <= 0x7e)) {
        this.#escape = ''
        if (prefix === START) {
          if (this.#stopping && !this.#pendingStart) return
          this.#pendingStart = false
          this.#paste = true
          this.#text = ''
          this.#tail = ''
          this.#bytes = 0
          this.#invalid = this.#stopping
          this.#resetDecoder()
        } else {
          if (this.#pendingStart) {
            this.#pendingStart = false
            this.#done.resolve()
          }
          const mode = /^\x1b\[\?2004;([0-4])\$y$/.exec(prefix)
          if (mode) this.#emit({ kind: 'mode', value: Number(mode[1]) })
          else if (ordinary.has(prefix)) {
            if (!this.#stopping) this.#keys.process(prefix)
          } else this.#bad()
        }
      }
      return
    }
    if (byte === 27) {
      if (!this.#finishText()) this.#bad()
      this.#escape = '\x1b'
      return
    }
    try {
      const text = this.#decoder.decode(Uint8Array.of(byte), { stream: true })
      // StdinBuffer extracts ordinary text by UTF16 code unit. The strict decoder
      // already delivers a complete scalar; do not split supplementary characters.
      if (text && !this.#stopping) {
        if (text.length === 2) this.#emit({ kind: 'key', text })
        else this.#keys.process(text)
      }
    } catch {
      this.#resetDecoder()
      this.#bad()
    }
  }
  #bad(): void {
    if (!this.#stopping) this.#emit({ kind: 'invalid' })
  }
  error(): void {
    // A stream error is not EOF and cannot settle an owned partial frame.
    this.#emit({ kind: 'input-error' })
  }
  #pasteByte(byte: number): void {
    this.#tail += String.fromCharCode(byte)
    while (!END.startsWith(this.#tail)) {
      const first = this.#tail.charCodeAt(0)
      this.#tail = this.#tail.slice(1)
      this.#bytes = Math.min(FIELD_LIMIT + 1, this.#bytes + 1)
      if (this.#bytes > FIELD_LIMIT) this.#invalid = true
      if (!this.#invalid) {
        try {
          this.#text += this.#decoder.decode(Uint8Array.of(first), { stream: true })
        } catch {
          this.#invalid = true
        }
      }
      if (this.#invalid) this.#text = ''
    }
    if (this.#tail !== END) return
    const text = this.#text
    const valid = this.#finishText() && !this.#invalid && validFieldText(text)
    this.#paste = false
    this.#tail = ''
    this.#text = ''
    this.#bytes = 0
    if (this.#stopping) this.#done.resolve()
    else if (valid) this.#emit({ kind: 'paste', text })
    else this.#bad()
  }
  /** Stop new semantic input; the owner still feeds bytes until the old paste actually ends. */
  stop(): Promise<void> {
    this.#stopping = true
    this.#keys.clear()
    if (this.#paste) {
      this.#invalid = true
      this.#text = ''
    } else {
      if (this.#escape !== '' && START.startsWith(this.#escape)) this.#pendingStart = true
      else {
        this.#escape = ''
        this.#done.resolve()
      }
    }
    return this.#done.promise
  }
  eof(): void {
    if (this.#ended) return
    this.#ended = true
    if (!this.#finishText() || this.#paste || this.#escape !== '') this.#bad()
    this.#paste = false
    this.#tail = ''
    this.#text = ''
    this.#escape = ''
    this.#keys.destroy()
    this.#done.resolve()
    this.#emit({ kind: 'eof' })
  }
  dispose(): void {
    if ((this.#paste || this.#pendingStart) && !this.#ended) throw new Error('input still owned')
    this.#ended = true
    this.#keys.destroy()
    this.#done.resolve()
  }
}
