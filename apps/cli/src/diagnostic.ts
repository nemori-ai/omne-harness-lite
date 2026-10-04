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

/**
 * The full text written to stderr for one diagnostic: the closed code line, unchanged, and, only
 * when the caller passes `signpost`, one fixed line after it that points a human entry refused
 * for lack of a screen at the machine entry. The caller decides whether this refusal is that
 * case; the code alone does not say. The signpost never echoes user input; `command` must be a
 * name from the validated command table.
 */
export function diagnosticText(
  code: Diagnostic,
  signpost?: { readonly command?: readonly string[] },
): string {
  const line = `omne: ${code}\n`
  if (signpost === undefined) return line
  const hint =
    signpost.command === undefined
      ? 'omne machine (see omne --help)'
      : `omne machine ${signpost.command.join(' ')}`
  return `${line}For scripts or redirected output, use ${hint}\n`
}
