// The usage rows: the query service and its source registry, and the adapters that register the
// model and tool sources and give a session's consumer scopes. Taking both away leaves the core as it was.
import type { Context } from '@deepseek-ai/cordis'
import { DEFAULT_COMPACTION_CONSUMER } from '@omne-harness/context-compaction'
import { createUsageAdaptersPlugin } from '@omne-harness/usage-adapters/cordis'
import {
  usageKey,
  usageSessionScopeKey,
  usageSourcesKey,
} from '@omne-harness/usage-cordis-contract/cordis'
import { createUsagePlugin, UsageSourcesProvider } from '@omne-harness/usage/cordis'
import { defineRow } from '../../row.ts'

/** The agent's consumer owner; the same text as the owner the agent loop writes into its calls. */
export const USAGE_AGENT_OWNER = '@omne-harness/agent'
export const USAGE_LIMITS = { page: 200, pages: 2000, buckets: 1000 } as const

export const usageRow = defineRow({
  row: 'usage',
  implementation: 'real',
  manifest: { provides: [usageKey, usageSourcesKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'usage',
    apply(ctx: Context) {
      ctx.plugin(UsageSourcesProvider)
      ctx.plugin(createUsagePlugin({ limits: USAGE_LIMITS }))
    },
  },
})

export const usageAdaptersRow = defineRow({
  row: 'usage-adapters',
  implementation: 'real',
  manifest: {
    provides: [usageSessionScopeKey],
    injects: [usageSourcesKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: createUsageAdaptersPlugin({
    owners: { agent: USAGE_AGENT_OWNER, compaction: DEFAULT_COMPACTION_CONSUMER },
    limits: { model: { page: 200, works: 100 }, tool: { page: 500, works: 64 } },
    pageBytes: 1 << 20,
  }),
})
