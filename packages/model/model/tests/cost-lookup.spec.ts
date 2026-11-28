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
import { callId, fixture, instance, op, proof, unbox } from './memory-fixture.ts'

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
async function ended(facts: readonly TransportFact[], send: 'started' | 'unknown' = 'started') {
  const f = fixture()
  const seen: unknown[] = []
  const [evidence] = f.options.evidence
  if (evidence) {
    const judge = evidence.lateFact.bind(evidence)
    Object.assign(evidence, {
      lateFact: (input: Parameters<typeof judge>[0]) => (seen.push(input), judge(input)),
    })
  }
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
  unbox(await commands.recordSend({ ...(await write()), dispatch, state: send }))
  if (send === 'started')
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
  return { f, commands, execution, record, late, pending, write, seen }
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
    ).toMatchObject({
      failure: { kind: 'invalid', field: 'dispatch', reason: 'no-pending-cost-lookup' },
    })
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

  it('holds the cleanup of an acknowledged call while a late account waits for its consumer (C15)', async () => {
    const s = await ended(withRequest)
    const settlement = unbox(await s.commands.settle({ ...(await s.write()), termination: LOST }))
    unbox(
      await s.commands.handoff({
        ...s.f.admit,
        operation: op('ack'),
        result: settlement.version,
        evidence: {
          kind: 'processed',
          completion: proof(`${s.f.admit.call}/${settlement.version}`, 'consumer'),
        },
      }),
    )
    unbox(
      await s.late('found', { kind: 'account', event: 'cost-lookup', value: found('0.0000916') }),
    )
    const cleanup = async (operation: string) =>
      unbox(await s.commands.advanceCleanup({ ...s.execution, operation: op(operation) }))
    expect(await cleanup('held')).toMatchObject({
      cleanup: 'blocked',
      diagnostic: 'unresolved-write-or-receive',
    })
    unbox(
      await s.commands.confirmAccount({
        ...s.f.admit,
        operation: op('confirm'),
        dispatch: unbox(decodeDispatchId('mdisp_one')),
        revision: '1',
        receipt: proof('saved', 'consumer'),
      }),
    )
    expect(await cleanup('released')).toMatchObject({ cleanup: 'released' })
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

/** The call of `ended`, settled as lost and ended for its consumer by `end`. */
async function settledLost(end: 'ack' | 'abandon') {
  const s = await ended(withRequest)
  const settlement = unbox(await s.commands.settle({ ...(await s.write()), termination: LOST }))
  const result = { ...s.f.admit, operation: op(end), result: settlement.version }
  if (end === 'ack')
    unbox(
      await s.commands.handoff({
        ...result,
        evidence: {
          kind: 'processed',
          completion: proof(`${s.f.admit.call}/${settlement.version}`, 'consumer'),
        },
      }),
    )
  else unbox(await s.commands.abandon({ ...result, basis: { kind: 'refused', refusal: 'denied' } }))
  const tasks = async () => unbox(await s.commands.loadRecovery(s.f.admit)).tasks
  return { ...s, tasks }
}

describe('the late account of an ended call: who may confirm it, and what work it leaves', () => {
  it('confirms only for an authorized principal, a known call and dispatch, and a revision it recorded', async () => {
    const s = await ended(withRequest)
    unbox(
      await s.late('found', {
        kind: 'account',
        event: 'cost-lookup',
        value: found('0.0000916', '12'),
      }),
    )
    const confirm = (operation: string, over: Record<string, unknown> = {}) =>
      s.commands.confirmAccount({
        ...s.f.admit,
        operation: op(operation),
        dispatch: unbox(decodeDispatchId('mdisp_one')),
        revision: '12',
        receipt: proof('saved', 'consumer'),
        ...over,
      })
    s.f.denied.add('handoff')
    expect(await confirm('denied')).toMatchObject({ failure: { kind: 'denied' } })
    s.f.denied.delete('handoff')
    expect(await confirm('no-call', { call: callId('other') })).toMatchObject({
      failure: { kind: 'invalid', field: 'call', reason: 'not-found' },
    })
    expect(
      await confirm('no-dispatch', { dispatch: unbox(decodeDispatchId('mdisp_other')) }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'dispatch', reason: 'not-found' } })
    for (const revision of ['0', '01', '1x', '13'])
      expect(await confirm(`bad-${revision}`, { revision }), revision).toMatchObject({
        failure: { kind: 'invalid', field: 'revision', reason: 'not-recorded' },
      })
    const first = unbox(await confirm('confirm-12'))
    expect(await confirm('confirm-12')).toEqual({ ok: first })
    expect(await confirm('confirm-12', { revision: '11' })).toMatchObject({
      failure: { kind: 'conflict' },
    })
    expect((await s.record()).lateDelivered).toBe('12')
    unbox(await confirm('confirm-11', { revision: '11' }))
    expect((await s.record()).lateDelivered).toBe('12')
  })

  it('refuses to confirm a dispatch that has no account yet', async () => {
    const s = await ended(withRequest)
    expect(
      await s.commands.confirmAccount({
        ...s.f.admit,
        operation: op('confirm'),
        dispatch: unbox(decodeDispatchId('mdisp_one')),
        revision: '1',
        receipt: proof('saved', 'consumer'),
      }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'account', reason: 'not-late' } })
  })

  it('owes account work for a dispatch whose send is unknown', async () => {
    const s = await ended([], 'unknown')
    expect(unbox(await s.commands.loadRecovery(s.f.admit)).tasks).toContain('account')
  })

  it('raises the confirmed revision, never lowers it', async () => {
    const s = await ended(withRequest)
    unbox(await s.late('found', { kind: 'account', event: 'cost-lookup', value: found('1', '2') }))
    const confirm = (revision: string) =>
      s.commands.confirmAccount({
        ...s.f.admit,
        operation: op(`confirm-${revision}`),
        dispatch: unbox(decodeDispatchId('mdisp_one')),
        revision,
        receipt: proof('saved', 'consumer'),
      })
    unbox(await confirm('1'))
    expect((await s.record()).lateDelivered).toBe('1')
    unbox(await confirm('2'))
    expect((await s.record()).lateDelivered).toBe('2')
  })

  it('owes account work while the cost is looked up, and not once the lookup gave up', async () => {
    const s = await ended(withRequest)
    expect(unbox(await s.commands.loadRecovery(s.f.admit)).tasks).toContain('account')
    for (const [event, final] of [
      ['miss-1', false],
      ['miss-2', true],
    ] as const)
      unbox(await s.late(event, { kind: 'cost-miss', event, final }))
    expect(unbox(await s.commands.loadRecovery(s.f.admit)).tasks).not.toContain('account')
  })

  it('owes the delivery of a late account to the consumer that took the result, and holds its cleanup', async () => {
    const acked = await settledLost('ack')
    unbox(await acked.late('found', { kind: 'account', event: 'cost-lookup', value: found('1') }))
    expect(await acked.tasks()).toContain('account')
  })

  it('owes nothing of a late account once the result was abandoned, and cleans up without it', async () => {
    const abandoned = await settledLost('abandon')
    unbox(
      await abandoned.late('found', { kind: 'account', event: 'cost-lookup', value: found('1') }),
    )
    expect(await abandoned.tasks()).not.toContain('account')
    expect(
      unbox(
        await abandoned.commands.advanceCleanup({
          ...abandoned.execution,
          operation: op('cleanup'),
        }),
      ),
    ).toMatchObject({ kind: 'abandoned', cleanup: 'released' })
  })

  it('judges a late fact with the request id the dispatch kept, and refuses a terminal past the byte limit or with a malformed cause', async () => {
    const s = await ended(withRequest)
    unbox(await s.late('found', { kind: 'account', event: 'cost-lookup', value: found('1') }))
    expect(s.seen).toMatchObject([{ upstreamRequest: 'gen-17950-abc' }])
    const anonymous = await ended(withRequest.filter(fact => fact.kind !== 'response'))
    await anonymous.late('found', { kind: 'account', event: 'cost-lookup', value: found('1') })
    expect(anonymous.seen).toMatchObject([{ upstreamRequest: null }])
    const huge: Termination = {
      kind: 'failed',
      fault: { cause: 'stream-lost', diagnostic: 'x'.repeat(70_000), upstreamStatus: null },
    }
    expect(await s.late('huge', { kind: 'terminal', event: 'huge', actual: huge })).toMatchObject({
      failure: { kind: 'invalid', field: 'termination', reason: 'encoded-byte-limit' },
    })
    const malformed = {
      kind: 'failed',
      fault: { cause: 'rate-limited', diagnostic: 'late', upstreamStatus: null },
    } as unknown as Termination
    expect(
      await s.late('malformed', { kind: 'terminal', event: 'malformed', actual: malformed }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'termination', reason: 'fault-shape' } })
  })
})
