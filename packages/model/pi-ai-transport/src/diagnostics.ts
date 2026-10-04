import type { Diagnostic } from '@omne-harness-lite/model-request-runtime'
import type { DiagnosticEmitter, DiagnosticEvent } from '@omne-harness-lite/model-request-runtime'
import type {TransportDiagnosticFact, TransportExecutionDiagnostics} from '@omne-harness-lite/model-request-runtime'

/** The assembly binds scope and service generation; the registry only borrows record. */
export function registryDiagnosticReporter(sink?: Pick<DiagnosticEmitter, 'record'>): {
  readonly record: (event: DiagnosticEvent) => void
  readonly inspect: () => Readonly<{
    registryDiagnosticFailures: number | 'unknown'
    registryDiagnosticDropped: number | 'unknown'
  }>
} {
  let recordEnabled = !!sink
  let registryDiagnosticFailures: number | 'unknown' = 0
  let registryDiagnosticDropped: number | 'unknown' = 0
  function increment(value: number | 'unknown'): number | 'unknown' {
    return value === 'unknown' || value === Number.MAX_SAFE_INTEGER ? 'unknown' : value + 1
  }
  function ownData(
    value: unknown,
    names: readonly string[],
  ): Record<string, PropertyDescriptor> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const prototype: unknown = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return undefined
    const keys = Reflect.ownKeys(value)
    if (
      keys.length !== names.length ||
      keys.some(key => typeof key !== 'string' || !names.includes(key))
    )
      return undefined
    const descriptors = Object.getOwnPropertyDescriptors(value)
    for (const name of names) {
      const descriptor = descriptors[name]
      if (!descriptor || !('value' in descriptor)) return undefined
    }
    return descriptors
  }
  function resultKind(value: unknown): 'recorded' | 'dropped' | 'invalid' {
    const dropped = ownData(value, ['dropped'])
    if (dropped) {
      const reason: unknown = dropped.dropped?.value
      return reason === 'invalid' ||
        reason === 'unsupported' ||
        reason === 'oversize' ||
        reason === 'queue_full' ||
        reason === 'closed'
        ? 'dropped'
        : 'invalid'
    }
    return recordedResultKind(value)
  }
  function recordedResultKind(value: unknown): 'recorded' | 'invalid' {
    const outer = ownData(value, ['recorded'])
    const reference = ownData(outer?.recorded?.value, ['collectorId', 'sequence'])
    if (!reference) return 'invalid'
    const collectorId: unknown = reference.collectorId?.value
    const sequence: unknown = reference.sequence?.value
    return typeof collectorId === 'string' &&
      collectorId.length > 0 &&
      typeof sequence === 'string' &&
      /^[1-9][0-9]*$/u.test(sequence) &&
      sequence.length <= 16 &&
      BigInt(sequence) <= BigInt(Number.MAX_SAFE_INTEGER)
      ? 'recorded'
      : 'invalid'
  }
  return {
    record(event) {
      if (!recordEnabled || !sink) return
      try {
        const completion: unknown = sink.record(event)
        if (completion instanceof Promise) {
          registryDiagnosticFailures = increment(registryDiagnosticFailures)
          recordEnabled = false
          // A synchronous port returning a thenable is a contract violation. Own its
          // sole rejection and never start another delivery into the same outlet.
          void Promise.resolve(completion).catch(() => {})
          return
        }
        if (
          completion !== null &&
          (typeof completion === 'object' || typeof completion === 'function') &&
          'then' in completion &&
          typeof completion.then === 'function'
        ) {
          registryDiagnosticFailures = increment(registryDiagnosticFailures)
          recordEnabled = false
          return
        }
        const kind = resultKind(completion)
        if (kind === 'dropped') registryDiagnosticDropped = increment(registryDiagnosticDropped)
        else if (kind === 'invalid')
          registryDiagnosticFailures = increment(registryDiagnosticFailures)
      } catch {
        registryDiagnosticFailures = increment(registryDiagnosticFailures)
      }
    },
    inspect() {
      return Object.freeze({ registryDiagnosticFailures, registryDiagnosticDropped })
    },
  }
}

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
