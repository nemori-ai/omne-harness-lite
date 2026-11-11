import {
  TELEMETRY_LIMITS,
  type Admission,
  type CloseReport,
  type TelemetryPort,
} from '@omne-harness/telemetry-contract'
import { createPort } from './emitter.ts'
import { parseOptions, type TelemetryRuntimeOptions } from './options.ts'
import { openOutlet } from './outlet.ts'
import { createPipeline } from './pipeline.ts'
import { LOG_LEVELS, logRecord, type LogRecordInput } from './record.ts'

/**
 * The telemetry runtime that an application creates and holds. The application closes it
 * explicitly; the Cordis plugin only provides `port` as the `telemetry` service.
 */
export type TelemetryRuntime = Readonly<{
  port: TelemetryPort
  /**
   * Stops admission, drains the queue to the local sink until the deadline, and ends the outlet.
   * Every later call returns the same promise. Never rejects.
   */
  close(deadlineMs: number): Promise<CloseReport>
  /** Admits one Cordis log message as a `log` record. Synchronous; never throws. */
  ingestLog(record: LogRecordInput): Admission
}>

function isLogInput(input: LogRecordInput): boolean {
  return (
    LOG_LEVELS.includes(input.level) &&
    typeof input.time === 'string' &&
    input.time.length <= 64 &&
    typeof input.component === 'string' &&
    input.component !== '' &&
    typeof input.text === 'string'
  )
}

/**
 * Creates the runtime. Throws TypeError for invalid options, and an Error when the file outlet
 * cannot be opened: telemetry does not fall back to another outlet on its own.
 */
export function createTelemetryRuntime(input: TelemetryRuntimeOptions): TelemetryRuntime {
  const options = parseOptions(input)
  const { generation, instance, budgets, clock } = options
  const pipeline = createPipeline({
    generation,
    budgets,
    clock,
    outlet: openOutlet(options.outlet),
    summary: options.summary,
  })
  const port = createPort({ pipeline, generation, clock, randomBytes: options.randomBytes })

  function ingestLog(record: LogRecordInput): Admission {
    try {
      if (!pipeline.accepting()) return pipeline.drop('closed')
      if (!isLogInput(record)) return pipeline.drop('invalid')
      const cut = {
        ...record,
        component: record.component.slice(0, TELEMETRY_LIMITS.componentMaxLength),
        text: record.text.slice(0, budgets.maxLogTextLength),
      }
      return pipeline.admit(logRecord(cut, { generation, instance }))
    } catch {
      return pipeline.drop('invalid')
    }
  }

  return Object.freeze({ port, close: pipeline.close, ingestLog })
}
