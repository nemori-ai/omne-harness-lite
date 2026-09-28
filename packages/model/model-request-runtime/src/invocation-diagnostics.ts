import type { BoundCredentialRedaction } from './credential-redaction-types.ts'
import type { DiagnosticEmitter, DiagnosticEvent } from './diagnostics-types.ts'
import type {
  InvocationInput,
  PlannedSemantics,
  PublicDiagnosticAssociation,
  TransportExecutionDiagnostics,
} from './types.ts'

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
function drainThenable(value: unknown): boolean {
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
  if (input.diagnosticEmitterFactory !== undefined) {
    try {
      const fixed =
        input.diagnosticAssociation === undefined
          ? undefined
          : association(input.diagnosticAssociation, bound)
      const produced: unknown = input.diagnosticEmitterFactory(fixed)
      if (drainThenable(produced)) report('model_invocation.diagnostic_contract_violation')
      else if (
        produced !== null &&
        typeof produced === 'object' &&
        typeof (produced as DiagnosticEmitter).record === 'function' &&
        typeof (produced as DiagnosticEmitter).close === 'function'
      )
        emitter = produced as DiagnosticEmitter
      else report('model_invocation.diagnostic_contract_violation')
    } catch {
      report('model_invocation.diagnostic_sink_failed')
    }
  }
  const record = (event: DiagnosticEvent): void => {
    if (!emitter) return
    try {
      const returned: unknown = emitter.record(event)
      if (drainThenable(returned)) report('model_invocation.diagnostic_contract_violation')
    } catch {
      report('model_invocation.diagnostic_sink_failed')
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
    if (!emitter) return
    try {
      const returned: unknown = emitter.close()
      if (drainThenable(returned)) report('model_invocation.diagnostic_contract_violation')
    } catch {
      report('model_invocation.diagnostic_sink_failed')
    }
  }
  return { record, ...(transport ? { transport } : {}), close }
}
