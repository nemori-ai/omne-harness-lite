import { isAbsolute } from 'node:path'
import { z } from 'zod'

const absolutePath = z
  .string()
  .refine(value => (process.platform === 'win32' ? /^[a-z]:[\\/]/i.test(value) : isAbsolute(value)))

const positiveInteger = z.number().int().positive().safe()

export const telemetryBudgetsConfig = z.strictObject({
  maxRecordBytes: positiveInteger,
  maxQueueItems: positiveInteger,
  maxQueueBytes: positiveInteger,
  maxOpenSegments: positiveInteger,
  maxLogTextLength: positiveInteger,
  summaryIntervalMs: positiveInteger,
  maxSegmentLifetimeMs: z.exactOptional(positiveInteger),
})

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
