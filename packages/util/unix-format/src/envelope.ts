export function formatError(message: string, options: { readonly hint?: string } = {}): string {
  return withHint(`ERROR: ${message}`, options.hint)
}

export function formatHold(
  message: string,
  options: { readonly steps?: readonly string[] } = {},
): string {
  const steps = options.steps ?? []
  if (steps.length === 0) return `HOLD: ${message}`
  const numbered = steps.map((step, index) => `  ${index + 1}. ${step}`).join('\n')
  return `HOLD: ${message}\n${numbered}`
}

export function formatSuccess(message: string, options: { readonly hint?: string } = {}): string {
  return withHint(`OK: ${message}`, options.hint)
}

function withHint(line: string, hint: string | undefined): string {
  return hint === undefined ? line : `${line}\nHINT: ${hint}`
}
