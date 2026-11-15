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

export type TelemetryRuntime = Readonly<{
  port: TelemetryPort
  close(deadlineMs: number): Promise<CloseReport>
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
