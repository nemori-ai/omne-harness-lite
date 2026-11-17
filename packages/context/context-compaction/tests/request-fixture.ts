import {
  decodeActionId,
  decodeCompactionOperationId,
  decodeCompactionTaskId,
  type CompactionRequest,
  type CompactionTaskRef,
} from '@omne-harness/agent-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { sampleCompactionInput } from '@omne-harness/agent-contract/testing'
import { compactionRequestDigest } from '@omne-harness/context-compaction'
export function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}
const parsedTenant = tenantCodec.parse(
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000000"}',
)
if (!parsedTenant.ok) throw new Error('invalid fixture tenant')
export const tenant = parsedTenant.value
export const access = { principal: 'caller', tenant }
export const adoption = { owner: 'test', name: 'rules', revision: '1', digest: 'a'.repeat(64) }
export const ref: CompactionTaskRef = {
  authority: 'compaction/test',
  tenant,
  task: ok(decodeCompactionTaskId('task-1')),
  requestDigest: 'request-1',
}
export const operation = ok(decodeCompactionOperationId('cancel-1'))
export const result = {
  version: '1',
  digest: 'result',
  evidence: { owner: 'test', record: 'result', revision: '1', digest: 'result' },
}

export function request(): CompactionRequest {
  const candidate: CompactionRequest = {
    ref,
    provider: adoption,
    consumer: {
      owner: 'test',
      work: 'independent-work',
      position: 'prepare',
      purpose: 'compaction',
    },
    preparation: ok(decodeActionId('preparation-1')),
    input: sampleCompactionInput(),
  }
  return { ...candidate, ref: { ...ref, requestDigest: compactionRequestDigest(candidate) } }
}
