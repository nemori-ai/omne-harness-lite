import type { Diagnostic } from './http.ts'

/** The caller owns diagnostic health; a borrowed sink never controls network work. */
export function reportDiagnostic(
  sink: (event: Diagnostic) => void | Promise<void>,
  event: Diagnostic,
): void {
  try {
    const completion = sink(event)
    if (completion) void Promise.resolve(completion).catch(() => {})
  } catch {
    // The factory sink counts its failures; direct consumers own their output state.
  }
}
