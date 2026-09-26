import type { TerminalInput } from '../../src/tui/framer.ts'
import type { TerminalPort } from '../../src/tui/terminal.ts'
export class FakeTerminal implements TerminalPort {
  size = { columns: 100, rows: 200 }
  frames: string[] = []
  handler: (event: TerminalInput) => void = () => {}
  resized = () => {}
  onFrame: ((bytes: string) => void) | undefined
  gate: Promise<void> | undefined
  restored = false
  stopped = false
  listen(handler: (event: TerminalInput) => void, resized: () => void) {
    this.handler = handler
    this.resized = resized
  }
  async write(bytes: string) {
    this.frames.push(bytes)
    await this.gate
    setImmediate(() => this.onFrame?.(bytes))
  }
  async stopInput() {
    this.stopped = true
  }
  async restore() {
    this.restored = true
  }
  key(text: string) {
    this.handler({ kind: 'key', text })
  }
  paste(text: string) {
    this.handler({ kind: 'paste', text })
  }
}
export const tick = () => new Promise<void>(resolve => setImmediate(resolve))
