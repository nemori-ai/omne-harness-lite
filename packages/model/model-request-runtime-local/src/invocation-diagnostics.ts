import type { BoundCredentialRedaction } from '@omne-harness-lite/model-request-runtime'
import type { DiagnosticEmitter, DiagnosticEvent } from '@omne-harness-lite/model-request-runtime'
import type {
  InvocationInput,
  PlannedSemantics,
  PublicDiagnosticAssociation,
  TransportExecutionDiagnostics,
} from '@omne-harness-lite/model-request-runtime'

function data(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (Object.keys(descriptors).some(key => !keys.includes(key))) return undefined
    const result: Record<string, unknown> = Object.create(null)
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!('value' in descriptor)) return undefined
      result[key] = descriptor.value
    }
    return result
  } catch {
    return undefined
  }
}

function clean(value: string, bound: BoundCredentialRedaction): boolean {
  if (value.length === 0) return false
  const result = bound.text(value)
  return 'ok' in result && result.ok === value
}

function association(
  input: unknown,
  bound: BoundCredentialRedaction,
): PublicDiagnosticAssociation | undefined {
  const value = data(input, ['executionId', 'causedBy'])
  if (!value || typeof value.executionId !== 'string' || !clean(value.executionId, bound))
    return undefined
  const reference =
    value.causedBy === undefined ? undefined : data(value.causedBy, ['collectorId', 'sequence'])
  const causedBy =
    reference &&
    typeof reference.collectorId === 'string' &&
    typeof reference.sequence === 'string' &&
    /^[1-9][0-9]*$/.test(reference.sequence) &&
    clean(reference.collectorId, bound) &&
    clean(reference.sequence, bound)
      ? Object.freeze({ collectorId: reference.collectorId, sequence: reference.sequence })
      : undefined
  return Object.freeze({ executionId: value.executionId, ...(causedBy ? { causedBy } : {}) })
}

/** Never await a diagnostic callback on the business path. Drain a violating thenable rejection. */
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

export function createInvocationDiagnostics<P extends PlannedSemantics, R>(
  input: InvocationInput<P, R>,
  bound: BoundCredentialRedaction,
  report: (kind: string) => void,
): {
  readonly record: (event: DiagnosticEvent) => void
  readonly transport?: TransportExecutionDiagnostics
  readonly close: () => void
} {
  let emitter: DiagnosticEmitter | undefined
  let recordEnabled = true
  let reportEnabled = true
  let closeAttempted = false
  let reportCallback: ((kind: string) => void) | undefined = report
  const reportFailure = (kind: string): void => {
    if (!reportEnabled || !reportCallback) return
    try {
      const returned: unknown = reportCallback(kind)
      if (drainDiagnosticThenable(returned)) reportEnabled = false
    } catch {
      reportEnabled = false
    }
  }
  if (input.diagnosticEmitterFactory !== undefined) {
    try {
      const fixed =
        input.diagnosticAssociation === undefined
          ? undefined
          : association(input.diagnosticAssociation, bound)
      const produced: unknown = input.diagnosticEmitterFactory(fixed)
      if (drainDiagnosticThenable(produced))
        reportFailure('model_invocation.diagnostic_contract_violation')
      else if (
        produced !== null &&
        typeof produced === 'object' &&
        typeof (produced as DiagnosticEmitter).record === 'function' &&
        typeof (produced as DiagnosticEmitter).close === 'function'
      )
        emitter = produced as DiagnosticEmitter
      else reportFailure('model_invocation.diagnostic_contract_violation')
    } catch {
      reportFailure('model_invocation.diagnostic_sink_failed')
    }
  }
  const record = (event: DiagnosticEvent): void => {
    if (!emitter || !recordEnabled) return
    try {
      const returned: unknown = emitter.record(event)
      if (drainDiagnosticThenable(returned)) {
        recordEnabled = false
        reportFailure('model_invocation.diagnostic_contract_violation')
      }
    } catch {
      recordEnabled = false
      reportFailure('model_invocation.diagnostic_sink_failed')
    }
  }
  const transport: TransportExecutionDiagnostics | undefined = emitter
    ? Object.freeze({
        record: (fact: Parameters<TransportExecutionDiagnostics['record']>[0]) => {
          record({ source: 'transport', ...fact })
        },
      })
    : undefined
  const close = (): void => {
    if (closeAttempted) return
    closeAttempted = true
    try {
      if (!emitter) return
      const returned: unknown = emitter.close()
      if (drainDiagnosticThenable(returned))
        reportFailure('model_invocation.diagnostic_contract_violation')
    } catch {
      reportFailure('model_invocation.diagnostic_sink_failed')
    } finally {
      // A transport may retain this facade after physical stop. Its closed
      // callbacks must not retain the invocation through the sink or reporter.
      emitter = undefined
      reportCallback = undefined
    }
  }
  return { record, ...(transport ? { transport } : {}), close }
}
