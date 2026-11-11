// The failure of a secret reader: a closed set of reason codes and no key.

/** Why a reader gave up: it is not a terminal, the person cancelled, or the read itself failed. */
export type SecretInputFailure = 'input-not-terminal' | 'input-cancelled' | 'input-failed'

/** What a secret reader throws to give up. Its message is the reason code and it carries no key. */
export class SecretInputError extends Error {
  readonly reason: SecretInputFailure

  constructor(reason: SecretInputFailure, options?: ErrorOptions) {
    super(reason, options)
    this.name = 'SecretInputError'
    this.reason = reason
  }
}
