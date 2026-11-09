// The ledger plans the final when the execution records it: the result is planned under its body
// policy and, when it offloads, the ledger's own writer seals the system body now (model Begin,
// Put, StoreSeal, LedgerSeal). The fact then stores the plan; settlement only links the body.
import type { ContentBlock } from '@omne-harness/content-block'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { Adoption, Reply, ToolFailure } from '@omne-harness/tool-contract'
import type {
  ResultPolicy,
  ToolFinalEnvelope,
  ToolFinalPlanner,
} from '@omne-harness/tool-contract/provider'
import { invalid, judgeMutationInput, type CallInput } from './boundary.ts'
import type { ToolLedgerConfiguration } from './construction.ts'
import { sameFactValue } from './evidence.ts'
import { fixFinalPlanningInput } from './facts-boundary.ts'
import type { BodyWriting } from './ledger-body-writer.ts'
import type { Snapshot } from './ledger-decider.ts'
import { authoredBodyOf, prepareResult, type PreparedBody } from './ledger-result-material.ts'
import { resultBodyPolicy, systemBodyPolicy, type BodyPolicy } from './result-offloading.ts'
import { firstResultReference } from './result-address.ts'

export function createLedgerFinalPlanner<P, B extends ContentBlock>(
  ports: Readonly<{
    policy: ResultPolicy<B>
    adoption: Adoption
    configuration: ToolLedgerConfiguration
    entry(input: unknown, action: 'write'): Reply<CallInput<P>>
    load(input: CallInput<P>): Reply<Snapshot>
    writeBody: BodyWriting<P>['writeBody']
  }>,
): ToolFinalPlanner<P, B> {
  return {
    planFinal: async supplied => {
      const context = judgeMutationInput<P>(supplied, 'write')
      if ('failure' in context) return context
      const fields = fixFinalPlanningInput(supplied, ports.policy, ports.adoption)
      if ('failure' in fields) return fields
      const input = { ...context.ok, ...fields.ok }
      const qualified = await ports.entry(supplied, 'write')
      if ('failure' in qualified) return qualified
      const snapshot = await ports.load(input)
      if ('failure' in snapshot) return snapshot
      const call = snapshot.ok.call
      if (call === null || call.start === null || !sameFactValue(call.start, input.start))
        return invalid('start', 'not-original-invocation')
      const policy = policyOf(snapshot.ok, input.final, call.request, ports.configuration)
      if ('failure' in policy) return policy
      const target = firstResultReference({
        tenant: input.tenant,
        call: input.call,
        admission: call.admission,
      })
      if ('failure' in target) return target
      const planned = await prepareResult(
        input,
        input.final.result,
        policy.ok.policy,
        policy.ok.authored,
        target.ok,
        ports.writeBody,
      )
      if ('failure' in planned) return planned
      const disclosure = await ports.entry(supplied, 'write')
      if ('failure' in disclosure) return disclosure
      return succeed({ ...input.final, result: planned.ok.value })
    },
  }
}

/** An authored body keeps its own policy; otherwise the declared policy, or the system's for a failure. */
function policyOf<B extends ContentBlock>(
  snapshot: Snapshot,
  final: ToolFinalEnvelope<B>,
  request: NonNullable<Snapshot['call']>['request'],
  configuration: ToolLedgerConfiguration,
): Outcome<Readonly<{ policy: BodyPolicy; authored: PreparedBody | null }>, ToolFailure> {
  if (final.result.original.kind === 'offloaded') {
    const authored = authoredBodyOf(snapshot, final.result.original.source)
    if ('failure' in authored) return authored
    return succeed({ policy: authored.ok.policy, authored: authored.ok.prepared })
  }
  if (final.terminal.kind !== 'completed')
    return succeed({
      policy: systemBodyPolicy(configuration.offloading, configuration.readResultArguments),
      authored: null,
    })
  const declared = resultBodyPolicy(
    request,
    configuration.offloading,
    configuration.readResultArguments,
  )
  return 'failure' in declared ? declared : succeed({ policy: declared.ok, authored: null })
}
