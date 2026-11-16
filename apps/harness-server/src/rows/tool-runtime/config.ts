import { isAbsolute } from 'node:path'
import type { ToolConfiguration } from '@omne-harness/tool'
import { z } from 'zod'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const nonNegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const timerMs = z.number().int().min(1).max(2_147_483_647)
const jsonLimits = z.strictObject({
  maxBytes: positive,
  maxDepth: positive,
  maxItems: positive,
  maxMembers: positive,
  maxStringLength: positive,
  maxNumberLength: positive,
})

export const toolConfigurationSchema = z.strictObject({
  authorBufferBytes: positive,
  authorBufferItems: positive,
  authorWaitHistoryBytes: positive,
  authorWaitHistoryItems: positive,
  processBatchBytes: positive,
  processBatchDelayMs: nonNegative,
  observerBufferBytes: positive,
  resultPageBytes: positive,
  offloading: z.strictObject({
    maxInlineUtf8Bytes: positive,
    maxRetentionMs: positive,
    maxBodyBytes: positive,
    previewUtf8Bytes: positive,
    maxPageBytes: positive,
    maxWriterMetadataBytes: positive,
    permitMs: positive,
    clockSkewMs: nonNegative,
    orphanGraceMs: positive,
    jsonDocument: jsonLimits,
    jsonRecord: jsonLimits,
  }),
  reconciliationDelayMs: nonNegative,
  ledgerCommitAttempts: positive,
  queueCapacity: positive,
  driverStepsPerRun: positive,
  driverRetryDelayMs: timerMs,
}) satisfies z.ZodType<Omit<ToolConfiguration, 'readResultArguments'>>

const absolutePath = z
  .string()
  .refine(value => (process.platform === 'win32' ? /^[a-z]:[\\/]/i.test(value) : isAbsolute(value)))

export const toolRuntimeConfigSchema = z.strictObject({
  filesRoot: absolutePath,
  combinationVersion: z.string().min(1).max(1024),
  configuration: toolConfigurationSchema,
  capacity: positive,
  observersPerCall: positive,
  observerQueueFrames: positive,
  observerResidenceMs: positive,
})

export type ToolRuntimeConfig = z.infer<typeof toolRuntimeConfigSchema>
