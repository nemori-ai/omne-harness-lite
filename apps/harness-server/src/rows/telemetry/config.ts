// The configuration of the `telemetry` row: data only (IC-14, IC-16). The release layer writes the
// implementation and the local outlet; the budgets are factory numbers that the operator layer
// gives (R2-D229), so the six first-version budgets are required and the code holds no default.
// The disabled implementation writes nothing and holds no segment, so it needs neither an outlet
// nor budgets: both may be left out, and are accepted when given. There is no remote destination:
// slice 1 writes to this host only (D06 is open).
import { isAbsolute } from 'node:path'
import { z } from 'zod'

const absolutePath = z
  .string()
  .refine(value => (process.platform === 'win32' ? /^[a-z]:[\\/]/i.test(value) : isAbsolute(value)))

const positiveInteger = z.number().int().positive().safe()

/**
 * The run-time budgets of the Node provider. Their meaning is the provider's (`TelemetryBudgets`).
 * `maxSegmentLifetimeMs` is optional there, with the provider's default; the row hands it on as
 * given.
 */
export const telemetryBudgetsConfig = z.strictObject({
  maxRecordBytes: positiveInteger,
  maxQueueItems: positiveInteger,
  maxQueueBytes: positiveInteger,
  maxOpenSegments: positiveInteger,
  maxLogTextLength: positiveInteger,
  summaryIntervalMs: positiveInteger,
  maxSegmentLifetimeMs: z.exactOptional(positiveInteger),
})

/** Where records go: the application's stdout or stderr record writer, or a file this host owns. */
export const telemetryOutletConfig = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('stdout') }),
  z.strictObject({ kind: z.literal('stderr') }),
  z.strictObject({ kind: z.literal('file'), path: absolutePath }),
])

const nodeRowConfig = z.strictObject({
  implementation: z.literal('node'),
  outlet: telemetryOutletConfig,
  budgets: telemetryBudgetsConfig,
})

const disabledRowConfig = z.strictObject({
  implementation: z.literal('disabled'),
  outlet: z.exactOptional(telemetryOutletConfig),
  budgets: z.exactOptional(telemetryBudgetsConfig),
})

export const telemetryRowConfig = z.discriminatedUnion('implementation', [
  nodeRowConfig,
  disabledRowConfig,
])

export type TelemetryRowConfig = z.infer<typeof telemetryRowConfig>
export type NodeTelemetryRowConfig = z.infer<typeof nodeRowConfig>
export type TelemetryOutletConfig = z.infer<typeof telemetryOutletConfig>
