import { z } from 'zod'

const count = (minimum: number) => z.number().int().safe().min(minimum)

export const modelHostConfig = z.strictObject({
  host: z.strictObject({
    concurrencyLimit: count(1),
    wakeCapacity: count(1),
    scanBatchSize: count(1),
    scanIntervalMs: count(1),
  }),
  runtime: z.strictObject({
    outputBatchBytes: count(1),
    outputBatchDelayMs: count(0),
    observerBufferBytes: count(1),
    observerCheckIntervalMs: count(1),
    readIdleMs: count(1),
    resultPageTargetBytes: count(1),
    retryBackoffMs: count(0),
    cleanupRetryMs: count(0),
  }),
  results: z.strictObject({
    maxConcurrentCalls: count(1),
    maxRedeliveries: count(0),
    maxCleanupSteps: count(1),
    maxPendingAccountsPerTenant: count(1),
    maxPendingAccounts: count(1),
  }),
})

export type ModelHostConfig = z.output<typeof modelHostConfig>
