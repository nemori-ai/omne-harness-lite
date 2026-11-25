import type { Context } from '@deepseek-ai/cordis'
import {
  createSessionAgentJournalPlugin,
  sessionModelHistoryReadinessKey,
  type SessionAgentJournalPluginInput,
} from '@omne-harness/session-adapters/cordis'
import {
  agentCompactionInputsKey,
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
  agentModelReceptionTargetsKey,
  agentReceivedCommitsKey,
  agentReceivedRecordsKey,
  agentToolReceptionTargetsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { SessionExecutionLog } from '@omne-harness/session-cordis-contract'
import {
  sessionAccessCheckKey,
  sessionAdoptedRequestsKey,
  sessionExecutionLogKey,
} from '@omne-harness/session-cordis-contract/cordis'
import {
  runtimeContextKey,
  runtimeContextReaderEligibilityKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import type { TenantDomains } from '@omne-harness/sql-contract'
import {
  storageKey,
  tenantDomainLookupKey,
  tenantDomainsKey,
} from '@omne-harness/sql-contract/cordis'
import { sessionContextBlocks } from '../../assembly/context-definitions.ts'
import { sessionWorkingDirectoryKey } from '../session-ad03/working-directory.ts'
import { releaseCancellation } from '../../entry/cancellation-installation.ts'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import { defineRow } from '../../row.ts'
import { openRegisteredTenants } from '../registered-tenants.ts'
import { agentJournalCombination, combinationConfig, type CombinationConfig } from './config.ts'

export { agentJournalCombination, COMBINATION_VERSION } from './config.ts'

const INJECTS = [
  sessionAccessCheckKey,
  storageKey,
  tenantDomainLookupKey,
  tenantDomainsKey,
  TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
]

function openTenantOf(ctx: Context) {
  return async (tenant: string): Promise<void> => {
    const parsed = tenantCodec.parse(tenant)
    if (!parsed.ok) throw new Error('the tenant text does not parse')
    const log = ctx.get(sessionExecutionLogKey) as SessionExecutionLog | undefined
    if (log === undefined) throw new Error('the execution log is not provided')
    const opened = await log.openTenant(parsed.value)
    if (opened.kind === 'unavailable') throw new Error(opened.diagnostic)
  }
}

export function createAgentJournalRow(input: SessionAgentJournalPluginInput = {}) {
  return defineRow({
    row: 'agent-journal',
    implementation: 'real',
    manifest: {
      provides: [
        agentCompactionInputsKey,
        agentJournalKey,
        agentJournalEntriesKey,
        agentMaterialsKey,
        agentReceivedCommitsKey,
        agentReceivedRecordsKey,
        agentModelReceptionTargetsKey,
        agentToolReceptionTargetsKey,
        sessionAdoptedRequestsKey,
        sessionExecutionLogKey,
        sessionModelHistoryReadinessKey,
      ],
      injects: [
        ...INJECTS,
        ...(input.reminders === undefined
          ? []
          : [runtimeContextKey, runtimeContextReaderEligibilityKey]),
      ],
      sameProviderGroup: 'agent-journal',
    },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'agent-journal',
      inject: INJECTS,
      Config: combinationConfig,
      async apply(ctx: Context, config: CombinationConfig) {
        await ctx.plugin(
          createSessionAgentJournalPlugin(input),
          agentJournalCombination(config.combinationVersion),
        )
        const directory = ctx.get(tenantDomainsKey) as TenantDomains<unknown>
        const scanner: unknown = ctx.get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY)
        ctx.effect(() => {
          const first = setTimeout(() => {
            void openRegisteredTenants('execution log opening', {
              listing: () => directory.enumerate({ principal: scanner }),
              open: openTenantOf(ctx),
              warn: message => ctx.logger('agent-journal').warn(message),
            })
          }, 0)
          return () => clearTimeout(first)
        }, 'agent-journal.open-registered')
      },
    },
  })
}

// Before each step the release settles the working directory, then tells the model the context.
export const agentJournalRow = createAgentJournalRow({
  cancellation: releaseCancellation,
  reminders: { descriptors: sessionContextBlocks },
  workingDirectory: ctx => ({
    inspectHistory: async (input, scopes) =>
      (await ctx.get(sessionWorkingDirectoryKey)?.inspectHistory(input, scopes)) ?? {
        failure: {
          kind: 'unavailable',
          diagnostic: 'workspace history qualification has no publisher',
        },
      },
    qualifyHistory: async (input, scopes) =>
      (await ctx.get(sessionWorkingDirectoryKey)?.qualifyHistory(input, scopes)) ?? {
        failure: {
          kind: 'unavailable',
          diagnostic: 'workspace guidance history qualification has no publisher',
        },
      },
    refresh: async input =>
      (await ctx.get(sessionWorkingDirectoryKey)?.refresh(input)) ?? {
        kind: 'unavailable',
        diagnostic: 'the working directory of the session has no publisher',
      },
  }),
})
