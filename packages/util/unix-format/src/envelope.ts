/**
 * `ERROR` / `HINT` / `HOLD` / `OK` envelopes.
 *
 * These labels are formatting only; callers own outcome and permission meaning.
 */

/** Render `ERROR: message`, followed by `HINT: hint` when a hint is given (an empty hint still renders). */
export function formatError(message: string, options: { readonly hint?: string } = {}): string {
  return withHint(`ERROR: ${message}`, options.hint)
}

/** Render `HOLD: message`, followed by numbered steps when any are given. */
export function formatHold(
  message: string,
  options: { readonly steps?: readonly string[] } = {},
): string {
  const steps = options.steps ?? []
  if (steps.length === 0) return `HOLD: ${message}`
  const numbered = steps.map((step, index) => `  ${index + 1}. ${step}`).join('\n')
  return `HOLD: ${message}\n${numbered}`
}

/** Render `OK: message`, followed by `HINT: hint` when a hint is given (an empty hint still renders). */
export function formatSuccess(message: string, options: { readonly hint?: string } = {}): string {
  return withHint(`OK: ${message}`, options.hint)
}

function withHint(line: string, hint: string | undefined): string {
  return hint === undefined ? line : `${line}\nHINT: ${hint}`
}
