// The evidence adapter of the Agent consumer owner for a Model ACK (agent-contract J08 item 6,
// R2-D257). The Model asks it whether the retained evidence of an ACK is what this owner saved. It
// reads the durable received record that the result receiver committed for that very delivery,
// through the read face of the same Journal records (`AgentReceivedRecords`), and confirms only an
// exact match: the tenant, the delivery key (the call's invocation reference and result version),
// the complete consumer and the saved evidence. Evidence this owner could never have saved is refused
// as forged (model-contract SPEC "ACK": 伪证据拒绝) with `handoff-invalid`: a committed record that
// differs from it in the delivery key, the consumer or the saved evidence, and evidence that is not
// this owner's retained evidence for an Agent position. A record that is absent, unknown or
// excluded, and a read that fails, are `unavailable` (R2-D260): never a confirmation; the Model
// keeps the result and its share and asks again with the same ACK operation.
import type {
  AgentExecutionId,
  AgentReceivedRecords,
  ReceivedCommitValue,
} from '@omne-harness/agent-contract'
import type {
  ConsumerRef,
  DurableEvidence,
  Handoff,
  ModelCallId,
  ModelDeliveryKey,
  ModelFailure,
  ModelInvocationRef,
  ResultVersion,
} from '@omne-harness/model-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { canonical } from './canonical.ts'
import { AGENT_OWNER, positionExecution } from './loop/identities.ts'
import { receptionOperation } from './receiving.ts'

/** What the Model gives the adapter for one ACK of a call this owner consumes. */
export type AgentCustodyQuestion<P> = Readonly<{
  principal: P
  tenant: TenantId
  call: ModelCallId
  consumer: ConsumerRef
  reference: ModelInvocationRef
  result: ResultVersion
  evidence: Handoff
}>

export interface AgentCustodyEvidence<P> {
  /**
   * The saved evidence when the durable record confirms it; `handoff-invalid` for evidence this
   * owner did not save; `unavailable` while the record cannot be found or read.
   */
  verify(input: AgentCustodyQuestion<P>): Promise<Outcome<DurableEvidence, ModelFailure>>
}

const DEPENDENCY = 'consumer-evidence'
const unavailable = (diagnostic: string) =>
  fail<ModelFailure>({ kind: 'unavailable', dependency: DEPENDENCY, diagnostic })
const forged = (reason: string) => fail<ModelFailure>({ kind: 'handoff-invalid', reason })

type ResultKey = Extract<ModelDeliveryKey, { kind: 'result' }>

/** Where this owner saved the delivery the ACK names, or why the evidence is none of its own. */
function located<P>(
  input: AgentCustodyQuestion<P>,
): Readonly<{ saved: DurableEvidence; execution: AgentExecutionId; key: ResultKey }> | string {
  // This owner retains a result until its consumption; it gives no completion evidence.
  if (input.evidence.kind !== 'retained') return 'not-retained-evidence'
  const saved = input.evidence.custody
  if (input.consumer.owner !== AGENT_OWNER || saved.owner !== AGENT_OWNER)
    return 'not-the-agent-consumer'
  const execution = positionExecution(input.consumer)
  if (execution === null) return 'no-execution-in-the-consumer-position'
  return {
    saved,
    execution,
    key: { kind: 'result', reference: input.reference, result: input.result },
  }
}

/** Whether the committed record is the very delivery, consumer and saved evidence of the ACK. */
function sameRecord(
  value: ReceivedCommitValue,
  key: ResultKey,
  consumer: ConsumerRef,
  saved: DurableEvidence,
): boolean {
  return (
    value.entry.delivery.producer === 'model' &&
    canonical(value.entry.delivery.key) === canonical(key) &&
    canonical(value.entry.consumer) === canonical(consumer) &&
    canonical(value.saved) === canonical(saved)
  )
}

/** The adapter over the read face of the received records. */
export function createAgentCustodyEvidence<P>(
  records: AgentReceivedRecords<P>,
): AgentCustodyEvidence<P> {
  return Object.freeze({
    async verify(input: AgentCustodyQuestion<P>) {
      const found = located(input)
      if (typeof found === 'string') return forged(found)
      const access = { principal: input.principal, tenant: input.tenant }
      let read
      try {
        read = await records.query({
          ...access,
          execution: found.execution,
          operation: receptionOperation(access, found.key),
        })
      } catch (error) {
        return unavailable(`received-record-read-threw: ${String(error)}`)
      }
      if ('failure' in read) return unavailable(`received-record-${read.failure.kind}`)
      if (read.ok.kind !== 'committed') return unavailable(`received-record-${read.ok.kind}`)
      return sameRecord(read.ok.value, found.key, input.consumer, found.saved)
        ? succeed(structuredClone(found.saved))
        : forged('received-record-differs')
    },
  })
}
