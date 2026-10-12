import type { ReadFailure } from '@omne-harness-lite/client-local-state'

export class ClientStateOpenFailure extends Error {
  override readonly name = 'ClientStateOpenFailure'
  constructor(readonly reason: ReadFailure | 'unsafe-path' | 'invalid-directory') {
    super(`client-local-state: ${reason}`)
  }
}
