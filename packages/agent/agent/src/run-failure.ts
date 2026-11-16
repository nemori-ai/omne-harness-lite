import type {
  AgentExecutionId,
  AgentInstanceId,
  AgentInstant,
  DurableEvidence,
  Failure,
  FailureCandidate,
  StepId,
} from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ModelFault } from '@omne-harness/model-contract'

export type AgentRunFailed = Readonly<{
  kind: 'run-failed'
  tenant: TenantId
  instance: AgentInstanceId
  execution: AgentExecutionId
  node: string | null
  failure: Failure
}>

/** Receives each report synchronously, once per stopped run. It must not call back into the runtime. */
export type AgentRunFailedReceiver = (event: AgentRunFailed) => void

export type AgentRunEndedFailed = Readonly<{
  kind: 'run-ended-failed'
  tenant: TenantId
  instance: AgentInstanceId
  execution: AgentExecutionId
  cause: DurableEvidence
  failure: Readonly<{
    kind: FailureCandidate['kind']
    step: StepId | null
    fault: ModelFault | null
  }> | null
}>

/** Receives each report synchronously, at most once per ended run. It must not call back into the runtime. */
export type AgentRunEndedFailedReceiver = (event: AgentRunEndedFailed) => void

export type AgentRunWaiting = Readonly<{
  kind: 'run-waiting'
  tenant: TenantId
  instance: AgentInstanceId
  execution: AgentExecutionId
  step: StepId | null
  node: string
  owner: string
  diagnostic: string
}>

/** Receives each report synchronously. It must not call back into the runtime. */
export type AgentRunWaitingReceiver = (event: AgentRunWaiting) => void

export type AgentModelRetrying = Readonly<{
  kind: 'model-retrying'
  tenant: TenantId
  instance: AgentInstanceId
  execution: AgentExecutionId
  step: StepId
  attempt: number
  fault: ModelFault
  notBefore: AgentInstant
}>

export type AgentModelRetryingReceiver = (event: AgentModelRetrying) => void
