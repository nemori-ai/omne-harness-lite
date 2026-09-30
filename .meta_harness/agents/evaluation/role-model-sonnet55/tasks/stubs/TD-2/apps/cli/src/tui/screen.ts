import type { Input } from '@earendil-works/pi-tui'

/** Renders untrusted text as data: control and bidi characters become `\uXXXX` escapes. */
export function safeText(_text: string): string {
  throw new Error('not-implemented')
}
export interface Screen {
  readonly identity: readonly string[]
  readonly title: string
  readonly body: readonly string[]
  readonly footer: string
  readonly page: number
  readonly input?: Input
}
export interface Layout {
  readonly bytes: string
  readonly fits: boolean
  readonly page: number
  readonly pages: number
}
/** Lays one screen state out as a single full frame for the given window size. */
export function layout(_screen: Screen, _columns: number, _rows: number): Layout {
  throw new Error('not-implemented')
}

interface Frame {
  readonly revision: number
  readonly bytes: string
  readonly delivered: () => void
}
/** One actual write plus one latest state; callback completion is the delivery fence. */
export class FrameWriter {
  constructor(_write: (bytes: string) => Promise<void>, _failed: () => void) {
    throw new Error('not-implemented')
  }
  get failed(): boolean {
    throw new Error('not-implemented')
  }
  submit(_frame: Frame): void {
    throw new Error('not-implemented')
  }
  async close(): Promise<void> {
    throw new Error('not-implemented')
  }
}
