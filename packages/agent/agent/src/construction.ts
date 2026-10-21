// Construction shapes of the generic Agent implementation, as docs/public-api.md defines them: the
// identity binding, the serializable configuration, the options and the named dependency record
// that the factory takes, and the four faces that it returns. Types only; no function runs here.
import type { ContentBlock } from '@omne-harness/content-block'
import type { TenantId } from '@omne-harness/legal-identity'
import type * as M from '@omne-harness/model-contract'
import type * as T from '@omne-harness/tool-contract'
import type {
  ActionAdmission,
  Adoption,
  AgentAccessCheck,
  AgentAdoptions,
  AgentClock,
  AgentExecutionRecovery,
  AgentHandle,
  AgentInstanceId,
  AgentJournal,
  AgentMaterials,
  AgentRegistrationHandle,
  AgentRuntime,
  AgentRuntimeControl,
  CallerCommit,
  CurrentConditions,
  DecisionCards,
  Evidence,
  ExtensionImplementations,
  MessageHandoff,
  ModelContextReader,
  ModelSelection,
  RegisteredReads,
  RequestPreparation,
} from '@omne-harness/agent-contract'

/** The identity of the instance that the factory builds. It is not configuration. */
export type AgentRuntimeBinding = Readonly<{
  instance: AgentInstanceId
  tenant: TenantId
  scope: Evidence
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
  loopGuardPolicy: Adoption
}>

export type AgentRuntimeOptions = Readonly<{
  binding: AgentRuntimeBinding
  configuration: AgentConfiguration
}>

/** The named, read-only record of the 17 injected capabilities. It is not a service container. */
export type AgentDependencies<P, B extends ContentBlock> = Readonly<{
  journal: AgentJournal<P>
  access: AgentAccessCheck<P>
  models: M.ModelRuntime<P>
  tools: T.ToolRuntime<P, B>
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

/** What a successful creation returns. `control` goes to the host only. */
export interface AgentProvider<P> {
  readonly runtime: AgentRuntime<P>
  readonly observation: AgentHandle<P>
  readonly recovery: AgentExecutionRecovery<P>
  readonly control: AgentRuntimeControl<P>
}
