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
      profiles: z.strictObject({
        retryPolicy: adoption,
        compactionTriggerPercent: z.string().regex(/^(100|[1-9][0-9]?)$/),
      }),
      preparation: modelRequestPreparationConfig,
      network: z.strictObject({
        maxConnections: count,
        idleConnectionTimeoutMs: count,
      }),
      endpoints: z.record(text, z.string().url()),
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

const memberSchema = createSqlModelRecordsPlugin<unknown, never>({
  inject: [],
  resolve: () => {
    throw new Error('the schema probe class is never activated')
  },
  sendStage: () => {
    throw new Error('the schema probe class is never activated')
  },
}).Config

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
      if (member.value.observation === undefined)
        return {
          issues: [{ message: 'observation: required, the public Model stream is always opened' }],
        }
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
