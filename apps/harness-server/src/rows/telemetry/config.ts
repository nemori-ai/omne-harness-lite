// The configuration of the `telemetry` row: data only (IC-14, IC-16). The release layer writes the
// implementation and the local outlet; the budgets are factory numbers that the operator layer
// gives (R2-D229), so every member is required and the code holds no default. There is no remote
// destination: slice 1 writes to this host only (D06 is open).
import { isAbsolute } from 'node:path'
import { z } from 'zod'

export const TELEMETRY_IMPLEMENTATIONS = ['node', 'disabled'] as const
export type TelemetryImplementation = (typeof TELEMETRY_IMPLEMENTATIONS)[number]

const absolutePath = z
  .string()
  .refine(value => (process.platform === 'win32' ? /^[a-z]:[\\/]/i.test(value) : isAbsolute(value)))

const positiveInteger = z.number().int().positive().safe()

/** The six run-time budgets of the Node provider. Their meaning is the provider's (`TelemetryBudgets`). */
export const telemetryBudgetsConfig = z.strictObject({
  maxRecordBytes: positiveInteger,
  maxQueueItems: positiveInteger,
  maxQueueBytes: positiveInteger,
  maxOpenSegments: positiveInteger,
  maxLogTextLength: positiveInteger,
  summaryIntervalMs: positiveInteger,
})

/** Where records go: the application's stdout or stderr record writer, or a file this host owns. */
export const telemetryOutletConfig = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('stdout') }),
  z.strictObject({ kind: z.literal('stderr') }),
  z.strictObject({ kind: z.literal('file'), path: absolutePath }),
])

export const telemetryRowConfig = z.strictObject({
  implementation: z.enum(TELEMETRY_IMPLEMENTATIONS),
  outlet: telemetryOutletConfig,
  budgets: telemetryBudgetsConfig,
})

export type TelemetryRowConfig = z.infer<typeof telemetryRowConfig>
export type TelemetryOutletConfig = z.infer<typeof telemetryOutletConfig>
