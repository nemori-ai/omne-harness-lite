// The report of a run whose drive stopped on a failure (SPEC「运行失败」, R2-D282). The Loop of
// one execution stopped at a node and nobody drives it any more: the slot is `failed`, the execution
// is not ended. The factory caller gives the receiver and decides where the report goes; the host
// writes it to its log. The report is an observation: it decides no answer of the runtime.
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
  /** The Loop node where the run stopped; null when the drive threw outside every node. */
  node: string | null
  /** The failure as the node answered it. Its texts name identities and states only. */
  failure: Failure
}>

/** Receives each report synchronously, once per stopped run. It must not call back into the runtime. */
export type AgentRunFailedReceiver = (event: AgentRunFailed) => void

/**
 * The report of a run that ended with a `fail` conclusion (SPEC「以失败终结」). Unlike
 * `AgentRunFailed`, the execution is ended: the terminal is committed and the slot goes back. The
 * report names why: `cause` is the conclusion cause exactly as the Journal keeps it, and `failure`
 * the kind and step of the finish candidate when the snapshot still carries it. The report is an
 * observation: it decides no answer of the runtime.
 */
export type AgentRunEndedFailed = Readonly<{
  kind: 'run-ended-failed'
  tenant: TenantId
  instance: AgentInstanceId
  execution: AgentExecutionId
  cause: DurableEvidence
  failure: Readonly<{
    kind: FailureCandidate['kind']
    step: StepId | null
    /** The Model fault of a `no-reply` candidate whose call failed; null for every other candidate. */
    fault: ModelFault | null
  }> | null
}>

/** Receives each report synchronously, at most once per ended run. It must not call back into the runtime. */
export type AgentRunEndedFailedReceiver = (event: AgentRunEndedFailed) => void

/**
 * The report of a run that began to wait for a dependency: a port of the Loop answered
 * `unavailable` at `node`, and the run stands there until the dependency answers. The execution is
 * neither stopped nor ended. The Journal keeps only the owner and the node of the wait; `diagnostic`
 * is the reason as the port gave it, which nothing else keeps. One report goes out for each new
 * combination of step, node, owner and diagnostic, so a wait that is entered again for the same
 * reason is reported once. The report is an observation: it decides no answer of the runtime.
 */
export type AgentRunWaiting = Readonly<{
  kind: 'run-waiting'
  tenant: TenantId
  instance: AgentInstanceId
  execution: AgentExecutionId
  /** Null before the first read of the execution gave a step. */
  step: StepId | null
  node: string
  /** The owner of the dependency, as the failure named it. */
  owner: string
  /** Names identities and states only, like every failure text. */
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
