// The row configuration of `model-host` (R2-D6, facts a.2): the four host bounds, the eight numbers
// of `ModelConfiguration` and the five of `ResultPushLimits`. Every number is the operator's: the
// member gives no default, the release layer writes none (the first values follow the rule "E9
// initial value times 1.5, then the curve of the first measurement"). The row checks shape and
// range here; the member checks its own rules again when the plugin is built.
import { z } from 'zod'

const count = (minimum: number) => z.number().int().safe().min(minimum)

export const modelHostConfig = z.strictObject({
  /** `ModelHostSettings` of model-host-local: concurrency, wake capacity, scan batch and interval. */
  host: z.strictObject({
    concurrencyLimit: count(1),
    wakeCapacity: count(1),
    scanBatchSize: count(1),
    scanIntervalMs: count(0),
  }),
  /** `ModelConfiguration` of `@omne-harness/model`. */
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
  /** `ResultPushLimits` of model-host-local. */
  results: z.strictObject({
    maxConcurrentCalls: count(1),
    maxRedeliveries: count(0),
    maxCleanupSteps: count(1),
    maxPendingAccountsPerTenant: count(1),
    maxPendingAccounts: count(1),
  }),
})

export type ModelHostConfig = z.output<typeof modelHostConfig>
