// The account outlet of Agent as a Request Context account fact (AG-17). It translates one handoff
// into one fact for the accounting inbox and keeps nothing between calls.
import type {
  AgentAccountHandoff,
  AgentAccountOutcome,
  AgentAccountOutlet,
} from '@omne-harness/agent-contract'
import { tenantEquals } from '@omne-harness/legal-identity'
import { resolveModelInvocationRef, type ModelInvocationParts } from '@omne-harness/model-contract'
import type {
  AccountReceipt,
  Access,
  Adoption,
  ContextAccountingInbox,
  ContextTarget,
} from '@omne-harness/request-context-contract'

/**
 * Names the account target (tenant and scope) that one call belongs to, or null when it cannot.
 * It never guesses a scope from the call or the execution text.
 */
export type AccountTargetResolver<P> = (
  input: Readonly<{ access: Access<P>; call: ModelInvocationParts }>,
) => Promise<ContextTarget | null>

/** The resolver of the first wave: no call has a known target. */
export const absentAccountTarget: AccountTargetResolver<unknown> = async () => null

export type AgentAccountOutletOptions<P> = Readonly<{
  inbox: ContextAccountingInbox<P>
  /** The adoption identity that this outlet gives as the sender of every fact. */
  sender: Adoption
  resolveTarget: AccountTargetResolver<P>
}>

const unavailable = (diagnostic: string): AgentAccountOutcome => ({
  kind: 'unavailable',
  diagnostic,
})

/** The answer of the inbox, by name. Nothing is added and no class changes into another. */
function outcomeOf(receipt: AccountReceipt): AgentAccountOutcome {
  switch (receipt.kind) {
    case 'received':
      return { kind: 'received' }
    case 'conflict':
      return { kind: 'conflict' }
    case 'invalid':
      return { kind: 'invalid', field: receipt.field, reason: receipt.reason }
    case 'unavailable':
      return unavailable(receipt.diagnostic)
    case 'denied':
    case 'unknown':
      return { kind: receipt.kind }
  }
}

/** Creates the outlet. The tenant of the call is checked first; a foreign call reaches nothing. */
export function createAgentAccountOutlet<P>(
  options: AgentAccountOutletOptions<P>,
): AgentAccountOutlet<P> {
  const { inbox, sender, resolveTarget } = options
  return {
    async deliver({
      access,
      handoff,
    }: Readonly<{
      access: Access<P>
      handoff: AgentAccountHandoff
    }>): Promise<AgentAccountOutcome> {
      const call = resolveModelInvocationRef(handoff.call, access.tenant)
      if (!('ok' in call)) {
        return call.failure.kind === 'malformed'
          ? { kind: 'invalid', field: 'handoff.call', reason: 'reference-malformed' }
          : { kind: 'denied' }
      }
      let target: ContextTarget | null
      try {
        target = await resolveTarget({ access, call: call.ok })
      } catch {
        return unavailable('scope-resolver-failed')
      }
      if (target === null) return unavailable('scope-unresolved')
      if (!tenantEquals(target.tenant, call.ok.tenant)) return { kind: 'denied' }
      try {
        return outcomeOf(
          await inbox.receive({
            access,
            input: {
              kind: 'account',
              origin: { producer: 'model', sender, resultVersion: handoff.resultVersion },
              target,
              call: { tenant: call.ok.tenant, call: call.ok.call },
              dispatch: handoff.dispatch,
              account: handoff.account,
              committed: handoff.committed,
            },
          }),
        )
      } catch {
        // The write may have happened: the receiver keeps its duty and retries the same handoff.
        return { kind: 'unknown' }
      }
    },
  }
}
