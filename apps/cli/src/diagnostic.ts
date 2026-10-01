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

/** The two codes that mean "this human entry cannot run here"; they point at the machine entry. */
const machineRedirected: ReadonlySet<Diagnostic> = new Set(['tty-required', 'tty-unsupported'])

/**
 * The full text written to stderr for one diagnostic: the closed code line, unchanged, and for
 * the codes above (human entries only) one fixed signpost line after it. The signpost never
 * echoes user input; `command` must be a name from the validated command table.
 */
export function diagnosticText(
  code: Diagnostic,
  entry: { readonly machine: boolean; readonly command?: readonly string[] },
): string {
  const line = `omne: ${code}\n`
  if (entry.machine || !machineRedirected.has(code)) return line
  const hint =
    entry.command === undefined
      ? 'omne machine (see omne --help)'
      : `omne machine ${entry.command.join(' ')}`
  return `${line}For scripts or redirected output, use ${hint}\n`
}
