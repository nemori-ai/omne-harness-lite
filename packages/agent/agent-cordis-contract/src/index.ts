// The root entry of the Agent Cordis definition package exports types only, so a consumer can name
// them without loading Cordis. The one reference to Cordis is the type of the caller context in
// `AgentPublicationAuthority`: it is erased from the built `index.js` and is the only edge from the
// root declaration to `@deepseek-ai/cordis`. The Agent types live in `@omne-harness/agent-contract`
// and the Cordis definitions at `./cordis`.
import type { Context } from '@deepseek-ai/cordis'
import type {
  AgentHandle,
  AgentInstanceHost,
  AgentRuntime,
  Failure,
} from '@omne-harness/agent-contract'
import type { Outcome } from '@omne-harness/operation-result'

/** What the host knows about one live instance, in this process only. The directory hands it out. */
export type AgentLocalRoute<P> = Readonly<{
  runtime: AgentRuntime<P>
  observation: AgentHandle<P>
}>
/** The input of `AgentInstancesService.register`: the input of the host's `publish`. */
export type AgentRegistrationInput<P> = Parameters<AgentInstanceHost<P>['publish']>[0]
/** The input of `AgentInstancesService.withdraw`: the input of the host's `withdraw`. */
export type AgentWithdrawalInput<P> = Parameters<AgentInstanceHost<P>['withdraw']>[0]
/**
 * The host's synchronous, final check of one registration or withdrawal. `caller` is the context
 * of the fiber that calls the directory. The directory asks before it writes anything.
 */
export interface AgentPublicationAuthority<P> {
  check(
    input: AgentRegistrationInput<P> | AgentWithdrawalInput<P>,
    caller: Context,
  ): Outcome<void, Failure>
}
