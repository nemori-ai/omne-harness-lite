// Construction shapes of the generic Agent implementation, as docs/public-api.md defines them: the
// identity binding, the serializable configuration, the options and the named dependency record
// that the factory takes, and the four faces that it returns. Types only; no function runs here.
import type { ContentBlock } from '@omne-harness/content-block'
import type { TenantId } from '@omne-harness/legal-identity'
import type * as M from '@omne-harness/model-contract'
import type * as T from '@omne-harness/tool-contract'
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

/** The identity of the instance that the factory builds. It is not configuration. */
export type AgentRuntimeBinding = Readonly<{
  instance: AgentInstanceId
  tenant: TenantId
  scope: DurableEvidence
  definition: Adoption
}>

/** The validated, serializable configuration; see public-api.md "工厂配置". */
export type AgentConfiguration = Readonly<{
  observerBufferBytes: number
  reconciliationDelayMs: number
  reconciliationBatchLimit: number
  denialBackoffMs: number
  toolConcurrency: number
  jointCommits: readonly Exclude<CallerCommit['kind'], 'none'>[]
  /** The coordination mode this assembly requires of the Journal binding; no implicit default. */
  coordination: JournalCapabilities['coordination']
  loopGuardPolicy: Adoption
  /**
   * The most steps one execution takes (M2 fallback of R2-D221; the full loop judgment is wave 3).
   * Absent: `DEFAULT_MAX_RUN_STEPS`. A step is one main Model request and the tools it calls.
   */
  maxRunSteps?: number
}>

export type AgentRuntimeOptions = Readonly<{
  binding: AgentRuntimeBinding
  configuration: AgentConfiguration
}>

/** The named, read-only record of the 18 injected capabilities. It is not a service container. */
export type AgentDependencies<P, B extends ContentBlock> = Readonly<{
  journal: AgentJournal<P>
  /**
   * The receiving entries of the same Journal provider: the loop reads the received results of a
   * consumption here, not from the snapshot (agent-contract SPEC "日志条目" 6).
   */
  entries: AgentJournalEntries<P>
  access: AgentAccessCheck<P>
  models: M.ModelRuntime<P>
  tools: T.ToolRuntime<P, B>
  toolRequests?: Readonly<{
    describe(input: ToolRequestInput<P>): Reply<Adoption | ToolCallAnswer>
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
}>

/**
 * What the trusted request source answers for a call it answers without running a tool: the text
 * the model reads as the result of the call. A call that names a multi-command tool but none of its
 * commands gets the guide of the tool (D-104). The action is denied with the answer; the other
 * actions of the batch are judged as usual.
 */
export type ToolCallAnswer = Readonly<{ kind: 'answered'; text: string }>

type ToolRequestInput<P> = Access<P> &
  Readonly<{
    execution: AgentExecutionId
    action: ActionId
    original: ActionToolCall
    effectiveArguments: string
    consumer: T.ToolInvokeRequest['consumer']
  }>

/** What a successful creation returns. `control` goes to the host only. */
export interface AgentProvider<P> {
  readonly runtime: AgentRuntime<P>
  readonly observation: AgentHandle<P>
  readonly recovery: AgentExecutionRecovery<P>
  readonly control: AgentRuntimeControl<P>
}
