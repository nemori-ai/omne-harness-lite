export function diagnosticOf(error: unknown): string {
  try {
    return error instanceof Error ? String(error.message) : String(error)
  } catch {
    return 'the thrown value could not be converted to diagnostic text'
  }
}
