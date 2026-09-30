export type TerminalInput =
  | { readonly kind: 'key' | 'paste'; readonly text: string }
  | { readonly kind: 'mode'; readonly value: number }
  | { readonly kind: 'invalid' | 'eof' | 'input-error' | 'output-error' }

/** Owns framing before the library sees any bytes; never feeds it paste bodies. */
export class InputFramer {
  constructor(_emit: (event: TerminalInput) => void) {
    throw new Error('not-implemented')
  }
  /** True from a complete paste-begin marker until that paste actually ends. */
  get inPaste(): boolean {
    throw new Error('not-implemented')
  }
  /** Bytes currently retained for unfinished input. */
  get bufferedBytes(): number {
    throw new Error('not-implemented')
  }
  feed(_bytes: Uint8Array): void {
    throw new Error('not-implemented')
  }
  /** Reports a stream error; it is not EOF. */
  error(): void {
    throw new Error('not-implemented')
  }
  /** Stop new semantic input; the owner still feeds bytes until the old paste actually ends. */
  stop(): Promise<void> {
    throw new Error('not-implemented')
  }
  eof(): void {
    throw new Error('not-implemented')
  }
  /** Releases the framer; throws while input is still owned. */
  dispose(): void {
    throw new Error('not-implemented')
  }
}
