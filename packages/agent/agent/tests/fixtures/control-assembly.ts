import {
  agentEvaluator,
  createAgentRuntime,
  type AgentConfiguration,
  type AgentDependencies,
} from '@omne-harness/agent'
import type { ContentBlock } from '@omne-harness/content-block'
import { createTestAgentDependencies, type TestJournalOptions } from '@omne-harness/agent/testing'
import {
  createTestCancellationPolicy,
  testCancellationPolicyInstallation,
} from '@omne-harness/agent-contract/testing'
import { options } from '../factory-support.ts'
import { adoption, execution, ok, type Principal } from '../journal-support.ts'
import { conditions, selected } from '../loop-support.ts'

export async function controlAssembly(
  journal: TestJournalOptions<Principal> = {},
  wrap: (
    dependencies: AgentDependencies<Principal, ContentBlock>,
  ) => AgentDependencies<Principal, ContentBlock> = dependencies => dependencies,
  configuration: Partial<AgentConfiguration> = {},
) {
  const { dependencies, controls } = createTestAgentDependencies<Principal>({
    journal: {
      cancellation: {
        installation: testCancellationPolicyInstallation,
        policy: createTestCancellationPolicy(),
      },
      ...journal,
    },
    receivingPrincipal: 'alice',
  })
  controls.adoptions.define(adoption('definition'), {
    definition: { category: 'AgentDefinition', name: 'control', references: [], attributes: [] },
    evaluator: agentEvaluator,
    extensions: [],
  })
  controls.conditions.define(execution(), conditions())
  controls.selection.select.always(() => ({ ok: selected }))
  const assembled = wrap(dependencies)
  const provider = ok(
    await createAgentRuntime(assembled, options({ reconciliationDelayMs: 1000, ...configuration })),
  )
  return { provider, dependencies: assembled, controls }
}
