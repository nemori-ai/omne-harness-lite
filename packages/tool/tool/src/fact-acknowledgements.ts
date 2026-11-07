// The recovery binding is the authority for source confirmations, including after live removal.
import type { ToolBindings } from '@omne-harness/tool-contract/provider'
import { judgeEvidenceField } from './boundary.ts'
import type { ToolFactAcknowledgementGuard, SourceVerdict } from './ledger-guards.ts'
import { sameFactValue } from './ledger-facts.ts'

/** Pair this guard with the exact bindings object supplied to the runtime. */
export function createToolFactAcknowledgementGuard<P, E>(
  bindings: Pick<ToolBindings<P, E>, 'recover'>,
): ToolFactAcknowledgementGuard<P> {
  const unavailable = (): SourceVerdict => ({
    kind: 'unavailable',
    diagnostic: 'the original source confirmation is unavailable',
  })
  return {
    verify: async input => {
      try {
        const { principal, tenant, call, start, receipt, sourceReceipt } = input
        const recovery = await bindings.recover({ principal, tenant, call, start })
        if (!('ok' in recovery)) return unavailable()
        const confirmed = await recovery.ok.acknowledge(receipt)
        if (!('ok' in confirmed)) return unavailable()
        const evidence = judgeEvidenceField(confirmed.ok, 'sourceReceipt')
        if ('failure' in evidence) return unavailable()
        return sameFactValue(evidence.ok, sourceReceipt)
          ? { kind: 'trusted' }
          : { kind: 'forged', reason: 'source-confirmation-mismatch' }
      } catch {
        return unavailable()
      }
    },
  }
}
