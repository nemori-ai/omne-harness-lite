import type { RowSpec } from '../../../src/loader.ts'
import { createTelemetryBinding } from '../../../src/rows/telemetry/index.ts'
import { TELEMETRY_ROW_CONFIG } from '../server-entry/support.ts'
import { declared } from '../session-fixtures/tree.ts'

export function disabledTelemetryRow(): RowSpec {
  const binding = createTelemetryBinding({ write: () => {}, stderr: () => {} })
  return declared(binding.plugin, { ...TELEMETRY_ROW_CONFIG, implementation: 'disabled' })
}
