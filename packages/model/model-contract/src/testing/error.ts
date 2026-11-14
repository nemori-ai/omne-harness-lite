export type ScriptedModelErrorReason = 'unknown-call' | 'invalid-script' | 'repeated-step'

export class ScriptedModelError extends Error {
  readonly reason: ScriptedModelErrorReason

  constructor(reason: ScriptedModelErrorReason, message: string) {
    super(message)
    this.name = 'ScriptedModelError'
    this.reason = reason
  }
}

export function misuse(message: string): ScriptedModelError {
  return new ScriptedModelError('invalid-script', message)
}
