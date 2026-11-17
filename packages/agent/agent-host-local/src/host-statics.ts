import type { AgentDependencies } from '@omne-harness/agent'
import type { AgentJournal } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ModelRuntime } from '@omne-harness/model-contract'

/** The dependencies the host binds once and shares with every instance it creates. */
export type HostStatics = Readonly<{
  journal: AgentJournal<unknown>
  entries: AgentDependencies<unknown, ContentBlock>['entries']
  access: AgentDependencies<unknown, ContentBlock>['access']
  models: ModelRuntime<unknown>
  adoptions: AgentDependencies<unknown, ContentBlock>['adoptions']
  conditions: AgentDependencies<unknown, ContentBlock>['conditions']
  requests: AgentDependencies<unknown, ContentBlock>['requests']
  compaction: AgentDependencies<unknown, ContentBlock>['compaction']
  compactionInputs: AgentDependencies<unknown, ContentBlock>['compactionInputs']
  received: AgentDependencies<unknown, ContentBlock>['received']
  selection: AgentDependencies<unknown, ContentBlock>['selection']
  modelContext: AgentDependencies<unknown, ContentBlock>['modelContext']
  handoff: AgentDependencies<unknown, ContentBlock>['handoff']
  clock: AgentDependencies<unknown, ContentBlock>['clock']
}>
