import type { ContentBlock } from '@omne-harness/content-block'
import type { Reply } from '@omne-harness/agent-contract'
import { fail } from '@omne-harness/operation-result'
import type { AgentDependencies, AgentProvider, AgentRuntimeOptions } from './construction.ts'

/**
 * Creates the runtime of one Agent instance; see docs/public-api.md. The factory is not
 * implemented yet: every call returns the failure `unavailable` and names that fact. It reads no
 * dependency, writes no Journal record and builds no runtime, so no caller can take the failure
 * for a half-ready instance.
 */
export function createAgentRuntime<P, B extends ContentBlock>(
  _dependencies: AgentDependencies<P, B>,
  _options: AgentRuntimeOptions,
): Reply<AgentProvider<P>> {
  return Promise.resolve(
    fail({
      kind: 'unavailable',
      owner: '@omne-harness/agent',
      diagnostic: 'createAgentRuntime is not implemented yet',
    }),
  )
}
