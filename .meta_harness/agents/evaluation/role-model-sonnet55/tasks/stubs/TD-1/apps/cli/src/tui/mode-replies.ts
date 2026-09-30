/** D054: iTerm may insert a complete report between any two paste chunks. */
export class ModeReplies {
  /**
   * `data` receives every byte that is not part of a complete mode report, in the
   * original order; `mode` receives the value of each complete report.
   */
  constructor(_data: (bytes: Uint8Array) => void, _mode: (value: number) => void) {
    throw new Error('not-implemented')
  }
  /** Bytes currently held as a possible report prefix. */
  get bufferedBytes(): number {
    throw new Error('not-implemented')
  }
  feed(_bytes: Uint8Array): void {
    throw new Error('not-implemented')
  }
  /** Resolves once no possible report prefix is held. */
  drainHeld(): Promise<void> {
    throw new Error('not-implemented')
  }
  eof(): void {
    throw new Error('not-implemented')
  }
}
