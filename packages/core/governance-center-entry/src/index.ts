/** A generation's shared admission signal; a fulfilled wait is not ongoing permission. */
export interface EntryOpeningSignal {
  wait(): Promise<void>
  isOpen(): boolean
}

export class EntryOpeningStopped extends Error {
  override readonly name = 'EntryOpeningStopped'
  constructor() {
    super('Entry opening has stopped')
  }
}
