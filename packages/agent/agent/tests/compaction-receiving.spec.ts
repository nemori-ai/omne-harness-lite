import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { fail, succeed } from '@omne-harness/operation-result'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  decodeActionId,
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeConsumptionId,
  decodeCompactionTaskId,
  decodeExecutionRevision,
  type CompactionState,
  type ReceivedCommitValue,
  type Material,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  receiveCompaction,
  cancelCompaction,
  type CompactionConsumerPorts,
} from '../src/loop/compaction.ts'
import { createAgentCompactionCustodyEvidence } from '../src/compaction-custody.ts'

function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}
const parsed = tenantCodec.parse(
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000000"}',
)
if (!parsed.ok) throw new Error('tenant fixture')
const tenant = parsed.value
const evidence = { owner: 'test', record: 'original', revision: '1', digest: 'original' }
const materialEvidence = { ...evidence, record: 'material', digest: 'material' }
const adoption = { owner: 'test', name: 'rules', revision: '1', digest: 'a'.repeat(64) }
const execution = ok(decodeAgentExecutionId('execution-1'))
const state: CompactionState = {
  action: ok(decodeActionId('compact')),
  task: { authority: 'test', task: ok(decodeCompactionTaskId('task')), requestDigest: 'original' },
  provider: adoption,
  consumer: {
    owner: '@omne-harness/agent',
    work: `${execution}/step-0`,
    purpose: 'compaction',
    position: 'C1',
  },
  input: { source: evidence, schema: adoption, digest: 'input' },
  consumption: ok(decodeConsumptionId('consume')),
  result: null,
  received: null,
  transition: null,
  ended: null,
}
const input = {
  principal: 'caller',
  tenant,
  execution,
  state,
  preparation: ok(decodeActionId('prepare')),
}
const result = {
  version: '1',
  evidence,
  digest: `sha256:${createHash('sha256').update('{"diagnostic":"bounded","kind":"failed","reason":"execution-limit"}').digest('hex')}`,
}
const outcome = { kind: 'failed', reason: 'execution-limit', diagnostic: 'bounded' } as const

function fixture() {
  const trace: string[] = []
  let saved: ReceivedCommitValue | null = null
  let material: Material<ContentBlock> | null = null
  const receipt = {
    execution,
    operation: ok(decodeAgentOperationId('received')),
    revision: ok(decodeExecutionRevision('2')),
    evidence,
    state: 'applied',
  } as const
  const ports: CompactionConsumerPorts<string> = {
    compaction: {
      admit: async () => {
        throw new Error('must recognize the original task')
      },
      inspect: async () => {
        trace.push('inspect')
        return succeed({
          kind: 'found',
          state: {
            ref: { ...state.task, tenant },
            revision: '2',
            phase: 'terminal',
            result,
            outcome,
            custody: 'provider',
            physical: 'settled',
          },
        })
      },
      cancel: async () => {
        throw new Error('not cancelling')
      },
      acknowledge: async call => {
        trace.push('ack')
        expect(saved).not.toBeNull()
        expect(call.handoff).toEqual({
          kind: 'retained',
          consumer: state.consumer,
          custody: saved?.saved,
        })
        return succeed({ ref: call.ref, result, receipt: evidence })
      },
    },
    compactionInputs: {
      read: async () => {
        throw new Error('accepted task no longer needs input source')
      },
    },
    received: {
      commit: async call => {
        trace.push('commit')
        material = call.material
        saved = { receipt, saved: evidence, entry: { ...call.entry, material: materialEvidence } }
        return succeed({ kind: 'committed', value: saved })
      },
      query: async () =>
        saved === null
          ? succeed({ kind: 'unknown' })
          : succeed({ kind: 'committed', value: saved }),
    },
    materials: {
      read: async call => {
        expect(call.source).toEqual(materialEvidence)
        return material === null
          ? fail({ kind: 'invalid', field: 'material', reason: 'absent' })
          : succeed(material)
      },
    },
    journal: {
      recordResult: async call => {
        trace.push(call.release.kind === 'confirmed' ? 'released' : 'track')
        return succeed(receipt)
      },
      query: async () => succeed({ kind: 'committed', receipt }),
    },
  }
  return { ports, trace }
}

it('durably retains the result before ACK and restores after the provider releases it', async () => {
  const f = fixture()
  expect(ok(await receiveCompaction(f.ports, input))).toMatchObject({
    kind: 'received',
    result,
    received: materialEvidence,
    outcome,
    release: evidence,
  })
  expect(f.trace).toEqual(['inspect', 'commit', 'track', 'ack', 'released'])
  f.ports.compaction.inspect = async () => {
    throw new Error('released provider body must not be requested')
  }
  expect(ok(await receiveCompaction(f.ports, input))).toMatchObject({ kind: 'received', outcome })
})

it('proves compaction custody from the committed receiver record and refuses substitutions', async () => {
  const f = fixture()
  const verifier = createAgentCompactionCustodyEvidence(f.ports.received)
  const question = {
    principal: input.principal,
    tenant,
    ref: { ...state.task, tenant },
    result,
    handoff: { kind: 'retained' as const, consumer: state.consumer, custody: evidence },
  }
  expect(await verifier.verify(question)).toHaveProperty('failure.kind', 'unavailable')
  ok(await receiveCompaction(f.ports, input))
  expect(await verifier.verify(question)).toEqual(succeed(evidence))
  for (const variant of [
    { ...question, result: { ...result, digest: 'another-result' } },
    {
      ...question,
      handoff: { ...question.handoff, custody: { ...evidence, digest: 'another-custody' } },
    },
    {
      ...question,
      handoff: { ...question.handoff, consumer: { ...state.consumer, position: 'another' } },
    },
  ])
    expect(await verifier.verify(variant)).toHaveProperty('failure.kind', 'handoff-invalid')
  const denied = createAgentCompactionCustodyEvidence<string>({
    query: async () => fail({ kind: 'denied', action: 'read-custody' }),
  })
  expect(await denied.verify(question)).toHaveProperty('failure.kind', 'denied')
})

it('cancellation closes consumer responsibility without waiting for physical settlement', async () => {
  const f = fixture()
  f.ports.compaction.cancel = async call => {
    f.trace.push('cancel')
    return succeed({
      ref: call.ref,
      revision: '2',
      phase: 'terminal',
      result,
      outcome,
      custody: 'provider',
      physical: 'pending',
    })
  }
  const writes: unknown[] = []
  const record = f.ports.journal.recordResult
  f.ports.journal.recordResult = async call => {
    writes.push(call.transfer)
    return record(call)
  }
  expect(await cancelCompaction(f.ports, { ...input, completion: evidence })).toEqual(
    succeed(undefined),
  )
  expect(f.trace).toEqual(['cancel', 'inspect', 'commit', 'track', 'ack', 'released', 'released'])
  expect(writes.at(-1)).toMatchObject({ kind: 'processed', completion: evidence })
})

it('leaves provider custody untouched while the received commit is unknown', async () => {
  const f = fixture()
  f.ports.received.commit = async call =>
    fail({ kind: 'commit-unknown', operation: call.operation })
  f.ports.received.query = async () => succeed({ kind: 'unknown' })
  expect(await receiveCompaction(f.ports, input)).toHaveProperty('failure.kind', 'commit-unknown')
  expect(f.trace).toEqual(['inspect'])
})
