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
  verify(input: AgentCustodyQuestion<P>): Promise<Outcome<DurableEvidence, ModelFailure>>
}

const DEPENDENCY = 'consumer-evidence'
const unavailable = (diagnostic: string) =>
  fail<ModelFailure>({ kind: 'unavailable', dependency: DEPENDENCY, diagnostic })
const forged = (reason: string) => fail<ModelFailure>({ kind: 'handoff-invalid', reason })

type ResultKey = Extract<ModelDeliveryKey, { kind: 'result' }>

function located<P>(
  input: AgentCustodyQuestion<P>,
): Readonly<{ saved: DurableEvidence; execution: AgentExecutionId; key: ResultKey }> | string {
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
