// The row configuration of `model-records` (R2-D6, facts a.3): data only. The member's own part
// (`owners`, `limits`, `maxCallBytes`, `maxCommandBytes`, `combinationVersion`, `send`, optional
// `observation`) is validated by the member's schema; the application's part is validated here:
// - `initial`: the bounds of the first-execution run of this process.
// - `sendStage`: what the send child needs beside its one member bound `maxRetainedAttempts`:
//   the materialization record bound, the factory credential query id, the official profiles input
//   (equal to the `model-profiles` row), the preparation and OpenAI family configuration (equal to
//   the `model-request-preparation` row), the network, the routes and the transport limits.
// - `diagnostics`: the read face `modelDiagnostics` the row provides beside the commands (#1140 A5):
//   the eligibility mapping `diagnosticsRead` (only `tenant-self`) and the retention adoption. The
//   member's schema validates it; without `retention` every `list` answers `unavailable`.
// Every number is the operator's; the release layer writes none.
import {
  createSqlModelDiagnosticsPlugin,
  createSqlModelRecordsPlugin,
  type SqlModelDiagnosticsConfig,
  type SqlModelRecordsConfig,
} from '@omne-harness/model-storage-sql/cordis'
import { z } from 'zod'
import { modelRequestPreparationConfig } from '../model-request-preparation/config.ts'

const text = z.string().min(1)
const count = z.number().int().positive().safe()
const adoption = z.strictObject({ owner: text, name: text, revision: text, digest: text })

const route = z.strictObject({
  /** The complete `https:` endpoint; the member holds no URL. */
  url: z.string().url(),
  endMarker: z.string().nullable(),
  /** Where the provider serves a response and the unit of its cost, from the provider body. */
  accounting: z.strictObject({ place: text, costUnit: text }),
})

const jsonLimits = z.strictObject({
  maxBytes: count,
  maxDepth: count,
  maxItems: count,
  maxMembers: count,
  maxStringLength: count,
  maxNumberLength: count,
})

export const modelRecordsAppConfig = z
  .object({
    initial: z.strictObject({
      maxRecords: count,
      maxBindings: count,
      maxCallsPerBinding: count,
    }),
    sendStage: z.strictObject({
      maxRetainedAttempts: count,
      materialization: z.strictObject({ maxRecords: count }),
      /** The credential query id of the factory source (`{kind:'factory', official:true, queryId}`). */
      factoryQueryId: text,
      profiles: z.strictObject({
        retryPolicy: adoption,
        compactionTriggerPercent: z.string().regex(/^(100|[1-9][0-9]?)$/),
      }),
      preparation: modelRequestPreparationConfig,
      network: z.strictObject({
        maxConnections: count,
        idleConnectionTimeoutMs: count,
      }),
      routes: z.record(z.string().min(1), route),
      transportLimits: z.strictObject({
        connectTimeoutMs: count.nullable(),
        streamStallTimeoutMs: count.optional(),
        /** Required: the retries before the request bytes left are an operator decision, never a default. */
        connectRetry: z.strictObject({ backoffMs: z.array(count).max(8) }),
        maxErrorBodyBytes: count,
        maxEventBytes: count,
        json: jsonLimits,
      }),
    }),
  })
  .passthrough()

export type ModelRecordsAppConfig = z.output<typeof modelRecordsAppConfig>

/**
 * The member's configuration schema. The member exports it only as the static `Config` of the plugin
 * class, so a class with no live objects is created once to read it; it is never loaded.
 */
const memberSchema = createSqlModelRecordsPlugin<unknown, never>({
  inject: [],
  resolve: () => {
    throw new Error('the schema probe class is never activated')
  },
  sendStage: () => {
    throw new Error('the schema probe class is never activated')
  },
}).Config

/** The diagnostics read schema of the member, read the same way. */
const diagnosticsSchema = createSqlModelDiagnosticsPlugin<unknown>({
  inject: [],
  resolve: () => {
    throw new Error('the schema probe class is never activated')
  },
}).Config

export type ModelRecordsConfig = Readonly<{
  app: ModelRecordsAppConfig
  member: SqlModelRecordsConfig
  diagnostics: SqlModelDiagnosticsConfig
}>

/** The three parts of the row configuration, each by its owner's schema. */
export const modelRecordsConfig = {
  '~standard': {
    version: 1 as const,
    vendor: 'harness-server',
    validate(value: unknown) {
      const app = modelRecordsAppConfig.safeParse(value)
      if (!app.success)
        return {
          issues: app.error.issues.map(issue => ({
            message: `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`,
          })),
        }
      const member = memberSchema['~standard'].validate(value)
      if ('issues' in member) return member
      const diagnostics = diagnosticsSchema['~standard'].validate(app.data['diagnostics'])
      if ('issues' in diagnostics)
        return {
          issues: diagnostics.issues.map(issue => ({ message: `diagnostics: ${issue.message}` })),
        }
      return {
        value: {
          app: app.data,
          member: member.value,
          diagnostics: diagnostics.value,
        } satisfies ModelRecordsConfig,
      }
    },
  },
}
