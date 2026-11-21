import type { Context } from '@deepseek-ai/cordis'
import {
  createSessionAgentJournalPlugin,
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
import {
  sessionAccessCheckKey,
  sessionAdoptedRequestsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import {
  runtimeContextKey,
  runtimeContextReaderEligibilityKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { sessionContextBlocks } from '../../assembly/context-definitions.ts'
import { sessionWorkingDirectoryKey } from '../session-ad03/working-directory.ts'
import { releaseCancellation } from '../../entry/cancellation-installation.ts'
import { defineRow } from '../../row.ts'
import { agentJournalCombination, combinationConfig, type CombinationConfig } from './config.ts'

export { agentJournalCombination, COMBINATION_VERSION } from './config.ts'

const INJECTS = [sessionAccessCheckKey, storageKey, tenantDomainLookupKey]

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
      },
    },
  })
}

// Before each step the release settles the working directory, then tells the model the context.
export const agentJournalRow = createAgentJournalRow({
  cancellation: releaseCancellation,
  reminders: { descriptors: sessionContextBlocks },
  workingDirectory: ctx => ({
    refresh: async input =>
      (await ctx.get(sessionWorkingDirectoryKey)?.refresh(input)) ?? {
        kind: 'unavailable',
        diagnostic: 'the working directory of the session has no publisher',
      },
  }),
})
