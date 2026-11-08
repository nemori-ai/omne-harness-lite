import { sameFactValue } from './evidence.ts'
import { fail, succeed } from '@omne-harness/operation-result'
import type { DurableEvidence, ToolOperationId } from '@omne-harness/tool-contract'
import type { Decision, Snapshot } from './ledger-decider.ts'

import type { BodyPolicy } from './result-offloading.ts'

export type ResultPolicyRecord = Readonly<{
  operation: ToolOperationId
  source: DurableEvidence
  policy: BodyPolicy
}>

export function pinResultPolicy(
  snapshot: Snapshot,
  proposed: ResultPolicyRecord,
): Decision<BodyPolicy> {
  const known = snapshot.resultPolicies.get(proposed.operation)
  if (known !== undefined)
    return {
      kind: 'reply',
      outcome: sameFactValue(known.source, proposed.source)
        ? succeed(known.policy)
        : fail({ kind: 'conflict', operation: proposed.operation }),
    }
  return {
    kind: 'commit',
    value: proposed.policy,
    writes: [{ kind: 'put', record: { kind: 'result-policy', policy: proposed } }],
  }
}
