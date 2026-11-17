import { describe, expect, it } from 'vitest'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelInstanceId,
} from '@omne-harness/model-contract'
import type { SendDemand, TransportFact } from '@omne-harness/model-contract/provider'
import { OPENAI_RECORDS } from '@omne-harness/pi-ai-openai'
import {
  createReceiveRecord,
  receiveRecords,
  recordingFacts,
  type ReceiveProofInput,
} from '../src/receive-evidence.ts'
import { readRecordFixture } from './support/records.ts'

const diagnostic: TransportFact = {
  kind: 'diagnostic',
  value: { kind: 'reasoning-disabled', reason: 'foreign-prefix' },
}
const open: TransportFact = { kind: 'block-open', index: '0', content: 'text', mode: 'append' }
const delta: TransportFact = { kind: 'block-delta', index: '0', delta: 'a' }
const failed: TransportFact = {
  kind: 'ended',
  termination: {
    kind: 'failed',
    fault: { cause: 'upstream-unavailable', diagnostic: 'http-503', upstreamStatus: '503' },
  },
}
const completed: TransportFact = {
  kind: 'ended',
  termination: { kind: 'completed', reason: 'stop' },
}

function record(...facts: TransportFact[]) {
  const made = createReceiveRecord()
  for (const fact of facts) made.yielded(fact)
  return made
}

describe('receive record: one proof request', () => {
  it('proves the whole tail before the transport reads the response body', () => {
    const made = record(diagnostic, failed)
    expect(made.prove('w1', [diagnostic, failed])).toBe(true)
  })

  it('proves the whole tail after the transport ended, with the body read', () => {
    const made = record(diagnostic)
    made.bodyClaimed()
    made.yielded(failed)
    expect(made.prove('w1', [diagnostic, failed])).toBe(true)
  })

  it('proves batch after batch while the body is unread, each batch the facts since the last proof', () => {
    const made = record(diagnostic)
    expect(made.prove('w1', [diagnostic])).toBe(true)
    made.yielded(failed)
    expect(made.prove('w2', [failed])).toBe(true)
  })

  it('answers a replay of the last proven window with the same batch and keeps its state', () => {
    const made = record(diagnostic)
    expect(made.prove('w1', [diagnostic])).toBe(true)
    expect(made.prove('w1', [structuredClone(diagnostic)])).toBe(true)
    made.yielded(failed)
    expect(made.prove('w2', [failed])).toBe(true)
  })

  it('refuses a replay of the last proven window with another batch, and every proof after it', () => {
    const made = record(diagnostic)
    expect(made.prove('w1', [diagnostic])).toBe(true)
    expect(made.prove('w1', [failed])).toBe(false)
    expect(made.prove('w1', [diagnostic])).toBe(false)
  })

  it('refuses while the body is read and the transport did not end, and every proof after it', () => {
    const made = record()
    made.bodyClaimed()
    made.yielded(diagnostic)
    expect(made.prove('w1', [diagnostic])).toBe(false)
    made.yielded(failed)
    expect(made.prove('w2', [failed])).toBe(false)
  })

  it.each([
    ['a fact is missing', [open, completed]],
    ['a fact is added', [open, delta, delta, completed]],
    ['the order differs', [delta, open, completed]],
    ['the end is not the one the transport yielded', [open, delta, failed]],
    ['the batch is empty', []],
  ] as const)('refuses when %s', (_name, batch) => {
    const made = record()
    made.bodyClaimed()
    for (const fact of [open, delta, completed]) made.yielded(fact)
    expect(made.prove('w1', batch)).toBe(false)
    expect(made.prove('w2', [open, delta, completed])).toBe(false)
  })

  it('does not record facts after it was voided', () => {
    const made = record(diagnostic)
    expect(made.prove('w1', [failed])).toBe(false)
    made.yielded(failed)
    expect(made.prove('w2', [failed])).toBe(false)
  })
})

function take<T>(value: { ok: T } | { failure: unknown }): T {
  if ('ok' in value) return value.ok
  throw new Error('fixture identity')
}
const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
const other = organizationCodec.parse('org_bcdefghjkmnpqrstvwxyz23456')
if (!account.ok || !organization.ok || !other.ok) throw new Error('fixture tenant')
const scope = tenant(organization.value, account.value)
const call = take(decodeModelCallId('mcall_receive'))
const request = readRecordFixture('pi-ai-openai', OPENAI_RECORDS[0]).request
const demand: SendDemand<unknown> = {
  principal: null,
  tenant: scope,
  call,
  execution: {
    tenant: scope,
    call,
    instance: take(decodeModelInstanceId('minst_receive')),
    generation: '1',
  },
  dispatch: take(decodeDispatchId('mdisp_receive')),
  request,
  supplier: request.suppliers[0],
  consumer: { owner: 'tests', work: 'work', position: '1', purpose: 'receive' },
  initiator: { owner: 'tests', subject: 'actor', revision: '1' },
}
function ask(
  window: string,
  facts: readonly TransportFact[],
  overrides: Partial<ReceiveProofInput> = {},
): ReceiveProofInput {
  return {
    tenant: demand.tenant,
    call: demand.call,
    execution: demand.execution,
    consumer: demand.consumer,
    request: demand.request,
    requestDigest: 'r'.repeat(64),
    dispatch: demand.dispatch,
    window,
    facts,
    batchDigest: 'b'.repeat(64),
    ...overrides,
  }
}
const UNPROVEN = {
  failure: {
    kind: 'unavailable',
    dependency: 'model-receive-evidence',
    diagnostic: 'receive-window-unproven',
  },
}

describe('receive records by dispatch', () => {
  function world() {
    let allowed = true
    const records = receiveRecords({
      execution: reference =>
        (reference as unknown) === null
          ? { failure: { kind: 'invalid', field: 'execution', reason: 'asked-without-execution' } }
          : allowed
            ? { ok: { owner: 'host', subject: 'channel', revision: '1' } }
            : { failure: { kind: 'denied', action: 'execution-channel' } },
    })
    return { records, deny: () => (allowed = false) }
  }

  it('answers the proof of the record of that dispatch, with the window and the digest it was asked', () => {
    const { records } = world()
    const owner = {}
    records.open(owner, demand)?.yielded(failed)
    expect(records.reader.prove(ask('w1', [failed]))).toEqual({
      ok: { window: 'w1', batchDigest: 'b'.repeat(64), paused: true, noPrefetch: true },
    })
  })

  it('answers unproven for a batch the record does not prove', () => {
    const { records } = world()
    records.open({}, demand)?.yielded(failed)
    expect(records.reader.prove(ask('w1', [completed]))).toEqual(UNPROVEN)
  })

  it('answers unproven without a record: never opened, another dispatch, another tenant, no execution', () => {
    const { records } = world()
    expect(records.reader.prove(ask('w1', []))).toEqual(UNPROVEN)
    records.open({}, demand)
    expect(
      records.reader.prove(ask('w1', [], { dispatch: take(decodeDispatchId('mdisp_other')) })),
    ).toEqual(UNPROVEN)
    expect(
      records.reader.prove(ask('w1', [], { tenant: tenant(other.value, account.value) })),
    ).toEqual(UNPROVEN)
    expect(records.reader.prove(ask('w1', [], { execution: null }))).toEqual(UNPROVEN)
  })

  it('gives the refusal of the execution authority and does not touch the record', () => {
    const { records, deny } = world()
    records.open({}, demand)?.yielded(failed)
    deny()
    expect(records.reader.prove(ask('w1', [completed]))).toEqual({
      failure: { kind: 'denied', action: 'execution-channel' },
    })
  })

  it('keeps one record for a dispatch: a second open gets none, and only the owner releases it', () => {
    const { records } = world()
    const owner = {}
    const first = records.open(owner, demand)
    expect(first).not.toBeNull()
    expect(records.open({}, demand)).toBeNull()
    first?.yielded(failed)
    records.release({}, demand)
    expect(records.reader.prove(ask('w1', [failed]))).toHaveProperty('ok')
    records.release(owner, demand)
    expect(records.reader.prove(ask('w1', [failed]))).toEqual(UNPROVEN)
    expect(records.open({}, demand)).not.toBeNull()
  })

  it('opens no record for a demand whose execution is of another tenant', () => {
    const { records } = world()
    const foreign = {
      ...demand,
      execution: { ...demand.execution, tenant: tenant(other.value, account.value) },
    }
    expect(records.open({}, foreign)).toBeNull()
  })
})

describe('recording the facts of a stream', () => {
  async function* source(facts: readonly TransportFact[], log: string[]) {
    try {
      for (const fact of facts) yield fact
    } finally {
      log.push('closed')
    }
  }

  it('records each fact when the consumer takes it, and nothing the consumer did not take', async () => {
    const made = createReceiveRecord()
    const iterator = recordingFacts(source([diagnostic, failed], []), made)[Symbol.asyncIterator]()
    await iterator.next()
    expect(made.prove('w1', [diagnostic])).toBe(true)
    await iterator.next()
    expect(made.prove('w2', [failed])).toBe(true)
    expect(await iterator.next()).toEqual({ done: true, value: undefined })
  })

  it('closes the source when the consumer returns early', async () => {
    const log: string[] = []
    const iterator = recordingFacts(source([diagnostic, failed], log), createReceiveRecord())[
      Symbol.asyncIterator
    ]()
    await iterator.next()
    expect(await iterator.return?.()).toEqual({ done: true, value: undefined })
    expect(log).toEqual(['closed'])
  })

  function bare(facts: readonly TransportFact[]): AsyncIterable<TransportFact> {
    const queue = [...facts]
    return {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          const value = queue.shift()
          return value === undefined ? { done: true, value: undefined } : { done: false, value }
        },
      }),
    }
  }

  it('answers done to an early return when the source has no return', async () => {
    const iterator = recordingFacts(bare([diagnostic]), createReceiveRecord())[
      Symbol.asyncIterator
    ]()
    expect(await iterator.return?.()).toEqual({ done: true, value: undefined })
  })

  it('rethrows the error of the consumer when the source has no throw', async () => {
    const iterator = recordingFacts(bare([diagnostic]), createReceiveRecord())[
      Symbol.asyncIterator
    ]()
    await expect(iterator.throw?.(new Error('consumer closed'))).rejects.toThrow('consumer closed')
  })

  it('passes a throw of the consumer to the source', async () => {
    const log: string[] = []
    const iterator = recordingFacts(source([diagnostic, failed], log), createReceiveRecord())[
      Symbol.asyncIterator
    ]()
    await iterator.next()
    await expect(iterator.throw?.(new Error('consumer closed'))).rejects.toThrow('consumer closed')
    expect(log).toEqual(['closed'])
  })
})
