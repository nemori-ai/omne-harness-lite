export type SecretInputFailure = 'input-not-terminal' | 'input-cancelled' | 'input-failed'

export class SecretInputError extends Error {
  readonly reason: SecretInputFailure

  constructor(reason: SecretInputFailure, options?: ErrorOptions) {
    super(reason, options)
    this.name = 'SecretInputError'
    this.reason = reason
  }
}
