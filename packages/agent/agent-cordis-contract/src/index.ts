// The root entry of the Agent Cordis definition package exports types only, and it has no edge to
// Cordis, at run time or in its declaration. The Agent types live in `@omne-harness/agent-contract`
// and the Cordis definitions, with the publication authority that takes a Cordis context, at
// `./cordis`.
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

/** What the host knows about one live instance, in this process only. The directory hands it out. */
export type AgentLocalRoute<P> = Readonly<{
  runtime: AgentRuntime<P>
  observation: AgentHandle<P>
}>
/** The input of `AgentInstancesService.register`: the input of the host's `publish`. */
export type AgentRegistrationInput<P> = Parameters<AgentInstanceHost<P>['publish']>[0]
/** The input of `AgentInstancesService.withdraw`: the input of the host's `withdraw`. */
export type AgentWithdrawalInput<P> = Parameters<AgentInstanceHost<P>['withdraw']>[0]

/** The instance slot: the tenant comes from `Access`, the other two are the scope and the exact adoption. */
export type AgentInstanceSlotInput<P> = Access<P> &
  Readonly<{
    scope: DurableEvidence
    definition: Adoption
  }>
/**
 * The entry through which the host gives out the published instance of a slot. The runtime object
 * does not leave the host, and there is no entry that retires an instance.
 */
export interface AgentInstanceProvision<P> {
  acquire(input: AgentInstanceSlotInput<P>): Reply<
    Readonly<{
      instance: AgentInstanceId
      registration: Registration
    }>
  >
}
