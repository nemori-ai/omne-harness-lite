import type {
  Access,
  Adoption,
  AgentHandle,
  AgentInstanceHost,
  AgentInstanceId,
  AgentRuntime,
  DurableEvidence,
  Registration,
  Reply,
} from '@omne-harness/agent-contract'

export type AgentLocalRoute<P> = Readonly<{
  runtime: AgentRuntime<P>
  observation: AgentHandle<P>
}>
export type AgentRegistrationInput<P> = Parameters<AgentInstanceHost<P>['publish']>[0]
export type AgentWithdrawalInput<P> = Parameters<AgentInstanceHost<P>['withdraw']>[0]

export type AgentInstanceSlotInput<P> = Access<P> &
  Readonly<{
    scope: DurableEvidence
    definition: Adoption
  }>
export interface AgentInstanceProvision<P> {
  acquire(input: AgentInstanceSlotInput<P>): Reply<
    Readonly<{
      instance: AgentInstanceId
      registration: Registration
    }>
  >
}
