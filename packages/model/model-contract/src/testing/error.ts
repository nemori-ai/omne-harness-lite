export type ScriptedModelErrorReason =
  /** A controller call named a call the provider has not accepted. */
  | 'unknown-call'
  /** A controller call asked for a state the call cannot reach from where it is. */
  | 'invalid-script'
  /** A transport step ran more than once, which the transport protocol forbids. */
  | 'repeated-step'

/**
 * The scripted provider and transport report a misuse of the script or of the protocol by
 * throwing this error. Contract failures are values in the reply, never this error.
 */
export class ScriptedModelError extends Error {
  readonly reason: ScriptedModelErrorReason

  constructor(reason: ScriptedModelErrorReason, message: string) {
    super(message)
    this.name = 'ScriptedModelError'
    this.reason = reason
  }
}

/** The error that every double throws when the script asks for something it cannot do. */
export function misuse(message: string): ScriptedModelError {
  return new ScriptedModelError('invalid-script', message)
}
