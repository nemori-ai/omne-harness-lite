import type { TenantId } from '@omne-harness-lite/identity-values'
import type {
  DiagnosticAssociation,
  DiagnosticCollector,
  DiagnosticEmitter,
  DiagnosticEvent,
  DiagnosticReference,
} from './diagnostics-types.ts'
import { drainDiagnosticThenable } from './invocation-diagnostics.ts'

/** One verified service operation owns this emitter and the actual recorded parent reference. */
export function operationDiagnostics(
  collector: Pick<DiagnosticCollector, 'emitter'> | undefined,
  tenant: TenantId,
  association: DiagnosticAssociation,
  report: () => void,
  onRecorded?: (reference: DiagnosticReference) => void,
): {
  readonly record: (event: DiagnosticEvent) => DiagnosticReference | undefined
  readonly close: () => void
} {
  let emitter: DiagnosticEmitter | undefined
  let recordEnabled = true
  let closeAttempted = false
  let reportEnabled = true
  const reportFailure = (): void => {
    if (!reportEnabled) return
    try {
      const returned: unknown = report()
      if (drainDiagnosticThenable(returned)) reportEnabled = false
    } catch {
      reportEnabled = false
    }
  }
  try {
    const produced: unknown = collector?.emitter({ kind: 'tenant', tenant }, association)
    if (drainDiagnosticThenable(produced)) reportFailure()
    else if (
      produced !== undefined &&
      produced !== null &&
      typeof produced === 'object' &&
      'record' in produced &&
      'close' in produced &&
      typeof produced.record === 'function' &&
      typeof produced.close === 'function'
    )
      emitter = produced as DiagnosticEmitter
    else if (collector !== undefined) reportFailure()
  } catch {
    reportFailure()
  }
  return {
    record(event) {
      if (!emitter || !recordEnabled) return undefined
      try {
        const result: unknown = emitter.record(event)
        if (result !== null && typeof result === 'object' && 'recorded' in result) {
          const recorded = result.recorded
          if (
            recorded !== null &&
            typeof recorded === 'object' &&
            'collectorId' in recorded &&
            'sequence' in recorded &&
            typeof recorded.collectorId === 'string' &&
            typeof recorded.sequence === 'string'
          ) {
            const reference = { collectorId: recorded.collectorId, sequence: recorded.sequence }
            onRecorded?.(reference)
            return reference
          }
        }
        if (drainDiagnosticThenable(result)) {
          recordEnabled = false
          reportFailure()
        }
      } catch {
        recordEnabled = false
        reportFailure()
      }
      return undefined
    },
    close() {
      if (!emitter || closeAttempted) return
      closeAttempted = true
      try {
        const result: unknown = emitter.close()
        if (drainDiagnosticThenable(result)) reportFailure()
      } catch {
        reportFailure()
      }
    },
  }
}
