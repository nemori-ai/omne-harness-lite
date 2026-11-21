import type { Context } from '@deepseek-ai/cordis'
import { createAgentCompactionCustodyEvidence } from '@omne-harness/agent'
import type {
  AgentAccessCheck,
  AgentReceivedRecords,
  CompactionProviderBinding,
} from '@omne-harness/agent-contract'
import {
  agentAccessCheckKey,
  agentCompactionKey,
  agentReceivedRecordsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import {
  createCompactionSqlStore,
  type CompactionExecutor,
  type CompactionStore,
} from '@omne-harness/context-compaction'
import { createContextCompactionPlugin } from '@omne-harness/context-compaction/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { defineRow } from '../../row.ts'

export type ContextCompactionRowInput = Readonly<{
  binding: CompactionProviderBinding
  inject: readonly string[]
  provides?: readonly string[]
  executor(ctx: Context, store: CompactionStore): Promise<CompactionExecutor> | CompactionExecutor
}>

export function createContextCompactionRow(input: ContextCompactionRowInput) {
  const inject = [
    ...new Set([storageKey, agentAccessCheckKey, agentReceivedRecordsKey, ...input.inject]),
  ]
  return defineRow({
    row: 'context-compaction',
    implementation: 'real',
    manifest: {
      provides: [agentCompactionKey, ...(input.provides ?? [])],
      injects: inject,
      sameProviderGroup: null,
    },
    lifecycle: { kind: 'none' },
    plugin: createContextCompactionPlugin({
      inject,
      async create(ctx) {
        const storage = ctx.get(storageKey) as SqlStorage
        const access = ctx.get(agentAccessCheckKey) as AgentAccessCheck<unknown>
        const received = ctx.get(agentReceivedRecordsKey) as AgentReceivedRecords<unknown>
        const store = await createCompactionSqlStore(storage)
        if ('failure' in store)
          throw new Error(`compaction storage unavailable: ${store.failure.kind}`)
        const custody = createAgentCompactionCustodyEvidence(received)
        return {
          ...input.binding,
          store: store.ok,
          executor: await input.executor(ctx, store.ok),
          async authorize(given) {
            const { authority, task, requestDigest } = given.ref
            const decision = await access.check({
              access: given,
              operation: `compaction.${given.operation}`,
              target: { kind: 'compaction', task: { authority, task, requestDigest } },
            })
            if (decision.kind === 'allowed') return succeed(undefined)
            return decision.kind === 'denied'
              ? fail({ kind: 'denied', action: `compaction.${given.operation}` })
              : fail({
                  kind: 'unavailable',
                  dependency: 'agent-access-check',
                  diagnostic: decision.diagnostic,
                })
          },
          async custody(given) {
            const verified = await custody.verify(given)
            return 'failure' in verified ? verified : succeed(undefined)
          },
        }
      },
    }),
  })
}
