// The report of a run whose drive stopped on a failure (SPEC「运行失败」, R2-D282). The Loop of
// one execution stopped at a node and nobody drives it any more: the slot is `failed`, the execution
// is not ended. The factory caller gives the receiver and decides where the report goes; the host
// writes it to its log. The report is an observation: it decides no answer of the runtime.
import type { AgentExecutionId, AgentInstanceId, Failure } from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'

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
