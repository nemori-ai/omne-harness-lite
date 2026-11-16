import type { ContentBlock } from '@omne-harness/content-block'
import type { TenantId } from '@omne-harness/legal-identity'
import type * as M from '@omne-harness/model-contract'
import type * as T from '@omne-harness/tool-contract'
import type { RetryPolicy } from '@omne-harness/retry'
import type {
  ActionAdmission,
  Access,
  ActionId,
  ActionToolCall,
  AgentExecutionId,
  Adoption,
  AgentAccessCheck,
  AgentAdoptions,
  AgentClock,
  AgentExecutionRecovery,
  AgentHandle,
  AgentInstanceId,
  AgentJournal,
  AgentJournalEntries,
  AgentMaterials,
  AgentRegistrationHandle,
  AgentRuntime,
  AgentRuntimeControl,
  CallerCommit,
  CurrentConditions,
  DecisionCards,
  DurableEvidence,
  ExtensionImplementations,
  JournalCapabilities,
  MessageHandoff,
  ModelContextReader,
  ModelSelection,
  RegisteredReads,
  Reply,
  RequestPreparation,
} from '@omne-harness/agent-contract'

export type AgentRuntimeBinding = Readonly<{
  instance: AgentInstanceId
  tenant: TenantId
  scope: DurableEvidence
  definition: Adoption
}>

export type AgentConfiguration = Readonly<{
  observerBufferBytes: number
  reconciliationDelaysMs: readonly number[]
  reconciliationBatchLimit: number
  denialBackoffMs: number
  toolConcurrency: number
  jointCommits: readonly Exclude<CallerCommit['kind'], 'none'>[]
  coordination: JournalCapabilities['coordination']
  loopGuardPolicy: Adoption
  modelRetry: RetryPolicy
  maxRunSteps?: number
}>

export type AgentRuntimeOptions = Readonly<{
  binding: AgentRuntimeBinding
  configuration: AgentConfiguration
}>

export type AgentDependencies<P, B extends ContentBlock> = Readonly<{
  journal: AgentJournal<P>
  entries: AgentJournalEntries<P>
  access: AgentAccessCheck<P>
  models: M.ModelRuntime<P>
  tools: T.ToolRuntime<P, B>
  toolRequests?: Readonly<{
    describe(input: ToolRequestInput<P>): Reply<ToolCallDescription>
    prepare(
      input: ToolRequestInput<P> & Readonly<{ definition: Adoption; admission: DurableEvidence }>,
    ): Reply<T.ToolInvokeRequest>
  }>
  adoptions: AgentAdoptions<P>
  conditions: CurrentConditions<P>
  requests: RequestPreparation<P>
  selection: ModelSelection<P>
  modelContext: ModelContextReader<P>
  extensions: ExtensionImplementations<P>
  cards: DecisionCards<P>
  admission: ActionAdmission<P>
  handoff: MessageHandoff<P>
  materials: AgentMaterials<P, B>
  reads: RegisteredReads<P>
  registration: AgentRegistrationHandle<P> | null
  clock: AgentClock
  random: () => number
}>

export type ToolCallDescription =
  | Readonly<{ kind: 'tool'; definition: Adoption }>
  | Readonly<{ kind: 'answered'; text: string }>
export type ToolCallAnswer = Extract<ToolCallDescription, { kind: 'answered' }>

type ToolRequestInput<P> = Access<P> &
  Readonly<{
    execution: AgentExecutionId
    action: ActionId
    original: ActionToolCall
    effectiveArguments: string
    consumer: T.ToolInvokeRequest['consumer']
  }>

export interface AgentProvider<P> {
  readonly runtime: AgentRuntime<P>
  readonly observation: AgentHandle<P>
  readonly recovery: AgentExecutionRecovery<P>
  readonly control: AgentRuntimeControl<P>
}
