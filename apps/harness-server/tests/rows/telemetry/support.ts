// The `telemetry` row for a tree that loads an emitting row (`session-provider`, `agent-host`) alone:
// the row's own plugin over the disabled implementation, which admits no record. The row is a
// required inject of both (D04), and disabled is a present provider, not an absent one (IC-9). It
// does not import vitest.
import type { RowSpec } from '../../../src/loader.ts'
import { createTelemetryBinding } from '../../../src/rows/telemetry/index.ts'
import { TELEMETRY_ROW_CONFIG } from '../server-entry/support.ts'
import { declared } from '../session-fixtures/tree.ts'

/** A fresh declared `telemetry` row over the disabled implementation. */
export function disabledTelemetryRow(): RowSpec {
  const binding = createTelemetryBinding({ write: () => {}, stderr: () => {} })
  return declared(binding.plugin, { ...TELEMETRY_ROW_CONFIG, implementation: 'disabled' })
}
