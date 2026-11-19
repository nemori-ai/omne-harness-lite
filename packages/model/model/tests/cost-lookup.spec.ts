import { describe, expect, it } from 'vitest'
import {
  accountUndelivered,
  costLookupOf,
  decodeDispatchId,
  type DispatchRecord,
  type Termination,
} from '@omne-harness/model-contract'
import type { CallAccountReport, TransportFact } from '@omne-harness/model-contract/provider'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import { fixture, instance, op, proof, unbox } from './memory-fixture.ts'

const LOST: Termination = {
  kind: 'failed',
  fault: { cause: 'stream-lost', diagnostic: 'socket closed', upstreamStatus: null },
}
const found = (lexeme: string, revision = '1'): CallAccountReport => ({
  usage: [],
  cost: [{ state: 'known', lexeme, unit: 'openrouter-credit', source: 'billable' }],
  trimmed: { state: 'unknown', unit: 'token' },
  place: 'openrouter/OpenAI',
  duration: { state: 'unknown' },
  revision,
})

/** One call whose only dispatch went out, carried the upstream's request id or not, and ended. */
async function ended(facts: readonly TransportFact[]) {
  const f = fixture()
  const memory = createMemoryModelCommands(f.options)
  const { commands } = memory
  unbox(await commands.admit(f.admit))
  const execution = unbox(
    await commands.claim({
      ...f.admit,
      operation: op('claim'),
      instance: instance(),
      continuity: proof(f.admit.call),
    }),
  )
  let serial = 0
  const write = async () => ({
    ...execution,
    operation: op(`write-${++serial}`),
    expected: unbox(await commands.loadRecovery(f.admit)).state.revision,
  })
  const dispatch = unbox(decodeDispatchId('mdisp_one'))
  unbox(
    await commands.prepareDispatch({
      ...(await write()),
      dispatch,
      supplier: f.admit.request.suppliers[0],
      policyDecision: null,
    }),
  )
  unbox(
    await commands.recordMaterialization({
      ...(await write()),
      dispatch,
      receipt: {
        supplier: f.admit.request.suppliers[0].adoption,
        representation: f.admit.request.representation,
        payloadDigest: 'a'.repeat(64),
      },
      window: 'w-1',
    }),
  )
  unbox(await commands.recordSend({ ...(await write()), dispatch, state: 'started' }))
  unbox(await commands.preserve({ ...(await write()), dispatch, window: 'w-1', facts }))
  const record = async (): Promise<DispatchRecord> => {
    const [only] = unbox(await commands.dispatches(f.admit))
    if (!only) throw new Error('fixture dispatch')
    return only
  }
  const late = (operation: string, fact: Parameters<typeof commands.recordLateFact>[0]['fact']) =>
    commands.recordLateFact({
      ...f.admit,
      dispatch,
      operation: op(operation),
      source: proof(`${f.admit.call}/${dispatch}`, 'supplier'),
      fact,
    })
  const pending = async () =>
    unbox(await commands.scanPending({ ...f.admit, after: null, limit: 2 })).calls
  return { f, commands, record, late, pending, write }
}

const withRequest: TransportFact[] = [
  { kind: 'response', request: 'gen-17950-abc' },
  { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
  { kind: 'block-delta', index: '0', delta: 'half' },
  { kind: 'ended', termination: LOST },
]

describe('the after-the-fact cost lookup of a dispatch (T5)', () => {
  it('is pending for a sent and ended dispatch with a request id and no known cost, and the start scan wakes its call', async () => {
    const s = await ended(withRequest)
    const record = await s.record()
    expect(record.account).toBeNull()
    expect(record.request).toBe('gen-17950-abc')
    expect(costLookupOf(record)).toBe('pending')
    expect(await s.pending()).toContain(s.f.admit.call)
  })

  it('counts each miss, stays pending, and gives up with the cost unknown on the final miss', async () => {
    const s = await ended(withRequest)
    unbox(await s.late('miss-1', { kind: 'cost-miss', event: 'miss-1', final: false }))
    expect((await s.record()).lookup).toEqual({ misses: 1, exhausted: false })
    expect(costLookupOf(await s.record())).toBe('pending')
    unbox(await s.late('miss-2', { kind: 'cost-miss', event: 'miss-2', final: true }))
    const record = await s.record()
    expect(record.lookup).toEqual({ misses: 2, exhausted: true })
    expect(costLookupOf(record)).toBe('not-found')
    expect(record.account).toBeNull()
    expect(
      await s.late('miss-3', { kind: 'cost-miss', event: 'miss-3', final: false }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'dispatch' } })
  })

  it('records a found cost as a late account of the original dispatch, and looks no further', async () => {
    const s = await ended(withRequest)
    unbox(
      await s.late('found', { kind: 'account', event: 'cost-lookup', value: found('0.0000916') }),
    )
    const record = await s.record()
    expect(record.account).toMatchObject({
      receipt: 'late',
      cost: [{ state: 'known', lexeme: '0.0000916' }],
    })
    expect(costLookupOf(record)).toBe('found')
    expect(
      await s.late('miss-after', { kind: 'cost-miss', event: 'miss-after', final: false }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'dispatch' } })
  })

  it('keeps a late account undelivered until the consumer confirms its revision (C15)', async () => {
    const s = await ended(withRequest)
    unbox(
      await s.late('found', { kind: 'account', event: 'cost-lookup', value: found('0.0000916') }),
    )
    expect(accountUndelivered(await s.record())).toBe(true)
    const confirm = (operation: string, revision: string) =>
      s.commands.confirmAccount({
        ...s.f.admit,
        operation: op(operation),
        dispatch: unbox(decodeDispatchId('mdisp_one')),
        revision,
        receipt: proof('saved', 'consumer'),
      })
    expect(await confirm('ahead', '2')).toMatchObject({
      failure: { kind: 'invalid', field: 'revision', reason: 'not-recorded' },
    })
    unbox(await confirm('confirm', '1'))
    expect((await s.record()).lateDelivered).toBe('1')
    expect(accountUndelivered(await s.record())).toBe(false)
  })

  it('counts an account event delivered twice once, in the stream and late (C15)', async () => {
    const twice = await ended([
      { kind: 'response', request: 'gen-twice' },
      { kind: 'account', event: 'usage', value: found('0.0002522') },
      { kind: 'account', event: 'usage', value: found('0.0002522') },
      { kind: 'ended', termination: LOST },
    ])
    expect((await twice.record()).account).toMatchObject({
      revision: '1',
      cost: [{ lexeme: '0.0002522' }],
    })
    const late = await ended(withRequest)
    const fact = { kind: 'account', event: 'cost-lookup', value: found('0.0000916') } as const
    expect(unbox(await late.late('first', fact))).toMatchObject({ recovered: false })
    expect(unbox(await late.late('again', fact))).toMatchObject({ recovered: true })
    expect((await late.record()).account).toMatchObject({ revision: '1', receipt: 'late' })
  })

  it('refuses to confirm an account that came with its stream', async () => {
    const known = await ended([
      { kind: 'account', event: 'usage', value: found('0.0002522') },
      { kind: 'ended', termination: LOST },
    ])
    expect(
      await known.commands.confirmAccount({
        ...known.f.admit,
        operation: op('confirm'),
        dispatch: unbox(decodeDispatchId('mdisp_one')),
        revision: '1',
        receipt: proof('saved', 'consumer'),
      }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'account', reason: 'not-late' } })
  })

  it('answers the same miss given again as recovered, and a different fact under the same event as a conflict', async () => {
    const s = await ended(withRequest)
    const miss = { kind: 'cost-miss', event: 'miss-1', final: false } as const
    unbox(await s.late('miss-1', miss))
    expect(unbox(await s.late('miss-1b', miss))).toMatchObject({ recovered: true })
    expect((await s.record()).lookup?.misses).toBe(1)
    expect(await s.late('miss-1c', { ...miss, final: true })).toMatchObject({
      failure: { kind: 'invalid', field: 'event', reason: 'conflict' },
    })
  })

  it('does not look up a dispatch without a request id, nor one whose cost came with its stream', async () => {
    const without = await ended(withRequest.slice(1))
    expect(costLookupOf(await without.record())).toBe('no-request-id')
    expect(
      await without.late('miss', { kind: 'cost-miss', event: 'miss', final: false }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'dispatch' } })
    const known = await ended([
      { kind: 'response', request: 'gen-known' },
      { kind: 'account', event: 'usage', value: found('0.0002522') },
      { kind: 'ended', termination: LOST },
    ])
    expect(costLookupOf(await known.record())).toBe('not-needed')
  })
})
