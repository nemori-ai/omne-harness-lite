import type {
  Admission,
  CloseReport,
  Emitter,
  TelemetryPort,
} from '@omne-harness/telemetry-contract'
import type { TelemetryRuntime } from './runtime.ts'

type Dropped = Extract<Admission, { kind: 'dropped' }>

const DISABLED: Dropped = Object.freeze({ kind: 'dropped', reason: 'disabled' })
const CLOSED: Dropped = Object.freeze({ kind: 'dropped', reason: 'closed' })

/**
 * The explicit disabled implementation, with the shape of a runtime. Every call answers
 * `dropped(disabled)` and is counted in `droppedBy.disabled`; after close every call answers
 * `dropped(closed)`. Disabled is a present provider, not an absent one.
 */
export function createDisabledTelemetry(): TelemetryRuntime {
  let disabled = 0
  let closing: Promise<CloseReport> | undefined

  function answer(): Dropped {
    if (closing !== undefined) return CLOSED
    disabled += 1
    return DISABLED
  }

  const emitter: Emitter = Object.freeze({
    event: answer,
    record: answer,
    startSegment: answer,
    bind: () => emitter,
  })
  const port: TelemetryPort = Object.freeze({ bind: () => emitter, discard: answer })

  return Object.freeze({
    port,
    ingestLog: answer,
    close(): Promise<CloseReport> {
      closing ??= Promise.resolve(
        Object.freeze({
          generation: 'disabled',
          admission: 'closed',
          admitted: 0,
          dropped: disabled,
          droppedBy: Object.freeze(disabled > 0 ? { disabled } : {}),
          pending: 0,
          // Nothing was written, so no boundary was reached and nothing is confirmed.
          flush: 'unconfirmed',
          boundary: 'none',
          transport: 'closed',
        } as const),
      )
      return closing
    },
  })
}
