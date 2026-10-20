import { tenantEquals } from '@omne-harness/legal-identity'
import type { DurableEvidence } from '@omne-harness/model-contract'
import type { MemoryModelEvidence } from '@omne-harness/model/testing'
import { digest, tenantKey } from '../src/testing/value.ts'

type Context = Parameters<MemoryModelEvidence['handoff']>[0]
type Completed = Pick<Context, 'tenant' | 'call' | 'consumer' | 'result'> &
  Readonly<{
    label: string
    outcome: string
  }>

/** Consumer-owned test records simulate completion storage, not production durability. */
export function completionRecords() {
  const records = new Map<string, Completed & { proof: DurableEvidence }>()
  return {
    finish(input: Completed): DurableEvidence {
      const { tenant, call, result, consumer, label, outcome } = input
      const record = digest({ tenant: tenantKey(tenant), call, result, consumer, label, outcome })
      const proof = { owner: consumer.owner, record, revision: '1', digest: record }
      records.set(record, {
        tenant,
        call,
        result,
        consumer: structuredClone(consumer),
        label,
        outcome,
        proof,
      })
      return { ...proof }
    },
    verify(input: Context): ReturnType<MemoryModelEvidence['handoff']> {
      if (input.evidence.kind !== 'processed')
        return { failure: { kind: 'handoff-invalid', reason: 'processed-only' } }
      const source = input.evidence.completion
      const record = records.get(source.record)
      return record &&
        tenantEquals(record.tenant, input.tenant) &&
        record.call === input.call &&
        record.result === input.result &&
        digest(record.consumer) === digest(input.consumer) &&
        record.outcome.length > 0 &&
        digest(record.proof) === digest(source)
        ? { ok: { ...record.proof } }
        : { failure: { kind: 'handoff-invalid', reason: 'completion-record' } }
    },
  }
}
