import type { Diagnostic } from './http.ts'
import type {
  TransportDiagnosticFact,
  TransportExecutionDiagnostics,
} from '@omne-harness-lite/model-request-runtime'

/** Request facts are already source-projected; observer failure cannot change network work. */
export function reportExecutionDiagnostic(
  sink: TransportExecutionDiagnostics | undefined,
  fact: TransportDiagnosticFact,
): void {
  if (!sink) return
  try {
    const completion: unknown = sink.record(
      Object.freeze({ ...fact, facts: Object.freeze({ ...fact.facts }) }),
    )
    void Promise.resolve(completion).catch(() => {})
  } catch {
    // The caller owns its diagnostic health independently from transport results.
  }
}

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
