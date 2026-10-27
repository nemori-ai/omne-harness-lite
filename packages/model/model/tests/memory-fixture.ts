import {
  accountCodec,
  organizationCodec,
  tenant,
  tenantEquals,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  encodeModelInvocationRef,
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  type Adoption,
  type DurableEvidence,
  type FixedModelRequest,
} from '@omne-harness/model-contract'
import { type ModelConsumerOwnerDeclaration } from '@omne-harness/model-contract/provider'
import type {
  MemoryModelAuthority,
  MemoryModelCommandsOptions,
  MemoryModelEvidence,
} from '../src/testing/types.ts'

export function unbox<T>(outcome: { ok: T } | { failure: unknown }): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`fixture failure: ${JSON.stringify(outcome.failure)}`)
}
export function identity(suffix = '5'): TenantId {
  const a = accountCodec.parse(`acc_abcdefghjkmnpqrstvwxyz234${suffix}`)
  const o = organizationCodec.parse(`org_abcdefghjkmnpqrstvwxyz234${suffix}`)
  if (!a.ok || !o.ok) throw new Error('fixture identity')
  return tenant(o.value, a.value)
}
export const callId = (suffix = 'one') => unbox(decodeModelCallId(`mcall_${suffix}`))
export const op = (suffix: string) => unbox(decodeModelOperationId(`mop_${suffix}`))
export const instance = (suffix = 'one') => unbox(decodeModelInstanceId(`minst_${suffix}`))
export const adoption: Adoption = {
  owner: 'test-owner',
  name: 'test',
  revision: '1',
  digest: '0'.repeat(64),
}
export const owner: ModelConsumerOwnerDeclaration = {
  consumerOwner: 'consumer',
  work: { kind: 'exempt' },
  evidence: adoption,
}
export const request: FixedModelRequest = {
  profile: adoption,
  suppliers: [
    { adoption, recipient: 'test.invalid', model: 'test', credential: { kind: 'factory' } },
  ],
  fallback: false,
  retryPolicy: adoption,
  parameters: [],
  system: [],
  messages: [],
  tools: [],
  toolChoice: 'none',
  declarations: [
    { produces: 'test.invalid/test', accepts: ['test.invalid/test'], foreignThinking: 'omit' },
  ],
  representation: adoption,
  parameterAdoptions: [],
  source: adoption,
}
export function proof(record: string, owner = 'host'): DurableEvidence {
  return { owner, record, revision: '1', digest: '1'.repeat(64) }
}
export function fixture() {
  const scope = identity()
  const principal = Object.freeze({ subject: 'trusted' })
  const principals = new WeakSet([principal])
  const denied = new Set<string>()
  const completeWindows = new Set<string>()
  let trustedExecution = true
  let evidenceAvailable = true
  let now = '2026-10-19T00:00:00.000Z'
  const authority: MemoryModelAuthority<typeof principal> = {
    authorize: ({ access, action }) =>
      principals.has(access.principal) && tenantEquals(scope, access.tenant) && !denied.has(action)
        ? { ok: { owner: 'identity', subject: principal.subject, revision: '1' } }
        : { failure: { kind: 'denied', action } },
    execution: () =>
      trustedExecution
        ? { ok: { owner: 'host', subject: 'channel', revision: '1' } }
        : { failure: { kind: 'denied', action: 'execution-channel' } },
  }
  const evidence: MemoryModelEvidence = {
    adoption,
    continuity: i =>
      !evidenceAvailable
        ? {
            failure: {
              kind: 'unavailable',
              dependency: 'consumer-evidence',
              diagnostic: 'fixture-offline',
            },
          }
        : i.source.owner === 'host' && i.source.record === i.call
          ? { ok: structuredClone(i.source) }
          : { failure: { kind: 'invalid', field: 'continuity', reason: 'untrusted' } },
    materialization: i =>
      evidenceAvailable
        ? { ok: proof(`${i.call}/${i.dispatch}`, 'materializer') }
        : {
            failure: {
              kind: 'unavailable',
              dependency: 'consumer-evidence',
              diagnostic: 'fixture-offline',
            },
          },
    lateFact: i =>
      i.source.owner === 'supplier' && i.source.record === `${i.call}/${i.dispatch}`
        ? { ok: i.source }
        : { failure: { kind: 'invalid', field: 'source', reason: 'untrusted' } },
    retry: i =>
      i.source.owner === 'retry' && i.source.record === i.position.operation
        ? { ok: i.source }
        : { failure: { kind: 'invalid', field: 'source', reason: 'untrusted' } },
    handoff: i => {
      if (!evidenceAvailable)
        return {
          failure: {
            kind: 'unavailable',
            dependency: 'consumer-evidence',
            diagnostic: 'fixture-offline',
          },
        }
      const source = i.evidence.kind === 'processed' ? i.evidence.completion : i.evidence.custody
      return source.owner === i.consumer.owner && source.record === `${i.call}/${i.result}`
        ? { ok: source }
        : { failure: { kind: 'handoff-invalid', reason: 'fixture-proof' } }
    },
    receive: i =>
      completeWindows.has(`${i.call}/${i.window}/${i.batchDigest}`)
        ? { ok: { window: i.window, batchDigest: i.batchDigest, paused: true, noPrefetch: true } }
        : {
            failure: {
              kind: 'unavailable',
              dependency: 'receive-record',
              diagnostic: 'complete-window-not-registered',
            },
          },
  }
  const options: MemoryModelCommandsOptions<typeof principal> = {
    owners: [owner],
    authority,
    evidence: [evidence],
    clock: { now: () => now },
    limits: {
      scanPageCalls: 2,
      resultPageParts: 1,
      resultPageTargetBytes: 1024,
      readIdleMs: 1000,
      capacity: { bytes: '1000000', blocks: '1000', attachmentBytes: '1000000' },
    },
  }
  const admit = {
    principal,
    tenant: scope,
    call: callId(),
    operation: op('admit'),
    request,
    consumer: { owner: 'consumer', work: 'work', position: 'position', purpose: 'test' },
    capacity: { bytes: '100000', blocks: '100', attachmentBytes: '100000' },
  }
  return {
    options,
    reference: unbox(
      encodeModelInvocationRef({ tenant: scope, call: admit.call, admission: admit.operation }),
    ),
    admit,
    principal,
    tenant: scope,
    denied,
    completeWindows,
    setTrustedExecution: (value: boolean) => {
      trustedExecution = value
    },
    setEvidenceAvailable: (value: boolean) => {
      evidenceAvailable = value
    },
    advance: (value: string) => {
      now = value
    },
  }
}
