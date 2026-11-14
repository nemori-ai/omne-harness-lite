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

export type AccountTargetResolver<P> = (
  input: Readonly<{ access: Access<P>; call: ModelInvocationParts }>,
) => Promise<ContextTarget | null>

export const absentAccountTarget: AccountTargetResolver<unknown> = async () => null

export type AgentAccountOutletOptions<P> = Readonly<{
  inbox: ContextAccountingInbox<P>
  sender: Adoption
  resolveTarget: AccountTargetResolver<P>
}>

const unavailable = (diagnostic: string): AgentAccountOutcome => ({
  kind: 'unavailable',
  diagnostic,
})

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
        return { kind: 'unknown' }
      }
    },
  }
}
