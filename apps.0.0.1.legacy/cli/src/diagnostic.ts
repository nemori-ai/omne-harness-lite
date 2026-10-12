export type Diagnostic =
  | 'invalid-command'
  | 'invalid-options'
  | 'input-unavailable'
  | 'input-too-large'
  | 'invalid-encoding'
  | 'invalid-json'
  | 'secret-permissions'
  | 'secret-source'
  | 'input-eof'
  | 'input-cancelled'
  | 'tty-required'
  | 'tty-unsupported'
  | 'input-restore-failed'
  | 'state-unavailable'
  | 'state-invalid'
  | 'internal-defect'
  | 'client-close-failed'
  | 'state-close-failed'
  | 'output-failed'
export class InputFailure extends Error {
  constructor(readonly code: Diagnostic) {
    super(code)
  }
}
