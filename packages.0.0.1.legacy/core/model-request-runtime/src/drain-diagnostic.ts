export function drainDiagnosticThenable(value: unknown): boolean {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return false
  try {
    if (typeof (value as { then?: unknown }).then !== 'function') return false
    void Promise.resolve(value).catch(() => {})
    return true
  } catch {
    return true
  }
}
