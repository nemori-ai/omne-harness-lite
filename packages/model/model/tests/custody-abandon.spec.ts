import { describe, expect, it } from 'vitest'
import { decodeDispatchId, type AbandonBasis } from '@omne-harness/model-contract'
import { judgePart } from '@omne-harness/message'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import { contactOf } from '../src/contact.ts'
import { callId, fixture, instance, op, proof, unbox } from './memory-fixture.ts'

const refused: AbandonBasis = { kind: 'refused', refusal: 'denied' }

/** One call that settled with a single text block, its execution, and the inputs that end its custody. */
async function settled(share?: number) {
  const f = fixture()
  if (share !== undefined) Object.assign(f.options.limits, { unacknowledgedResults: share })
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
  unbox(await commands.openReceiveWindow({ ...(await write()), dispatch, window: 'window' }))
  const part = judgePart({
    kind: 'text',
    id: 'text',
    visibility: { toHuman: true, toModel: true },
    text: 'kept',
  })
  if ('rejected' in part || part.ok.kind !== 'text') throw new Error('fixture block')
  unbox(
    await commands.preserve({
      ...(await write()),
      dispatch,
      window: 'window',
      facts: [
        { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
        { kind: 'block-delta', index: '0', delta: 'kept' },
        { kind: 'block-seal', index: '0', block: part.ok },
        { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
      ],
    }),
  )
  const settlement = unbox(
    await commands.settle({
      ...(await write()),
      termination: { kind: 'completed', reason: 'stop' },
    }),
  )
  const abandon = (operation = 'abandon', basis: AbandonBasis = refused) => ({
    ...f.admit,
    operation: op(operation),
    result: settlement.version,
    basis,
  })
  const handoff = (operation = 'ack') => ({
    ...f.admit,
    operation: op(operation),
    result: settlement.version,
    evidence: {
      kind: 'processed' as const,
      completion: proof(`${f.admit.call}/${settlement.version}`, 'consumer'),
    },
  })
  const custody = async () => unbox(await commands.loadRecovery(f.admit)).state.custody
  return { ...f, ...memory, execution, write, settlement, abandon, handoff, custody }
}

describe('abandoning a settled result (T4)', () => {
  it('ends producer custody of a settled result as abandoned, with its basis and a record', async () => {
    const f = await settled()
    const receipt = unbox(await f.commands.abandon(f.abandon()))
    expect(receipt).toMatchObject({
      call: f.admit.call,
      result: f.settlement.version,
      custody: {
        kind: 'abandoned',
        operation: op('abandon'),
        basis: refused,
        record: {
          owner: 'model-memory',
          record: `${f.admit.call}/${f.settlement.version}/abandoned`,
        },
        cleanup: 'pending',
        diagnostic: null,
      },
    })
    expect(await f.custody()).toEqual(receipt.custody)
  })

  it('answers the original abandonment to the same operation and to a later one', async () => {
    const f = await settled()
    const first = unbox(await f.commands.abandon(f.abandon()))
    expect(unbox(await f.commands.abandon(f.abandon()))).toEqual(first)
    const later = unbox(
      await f.commands.abandon(f.abandon('abandon-again', { kind: 'unreadable', reason: 'gone' })),
    )
    expect(later.custody).toEqual(first.custody)
  })

  it('refuses before the call settled, and for another result than the settled one', async () => {
    const f = fixture()
    const { commands } = createMemoryModelCommands(f.options)
    unbox(await commands.admit(f.admit))
    const s = await settled()
    expect(
      await commands.abandon({
        ...f.admit,
        operation: op('early'),
        result: s.settlement.version,
        basis: refused,
      }),
    ).toEqual({ failure: { kind: 'not-settled' } })
    const other = await settled()
    expect(await s.commands.abandon({ ...s.abandon(), result: other.settlement.version })).toEqual({
      failure: { kind: 'invalid', field: 'result', reason: 'not-original' },
    })
    expect(
      await s.commands.abandon({
        ...s.abandon(),
        result: 'mrver_' as typeof other.settlement.version,
      }),
    ).toEqual({ failure: { kind: 'invalid', field: 'result', reason: 'identity' } })
    expect(await s.custody()).toEqual({ kind: 'producer' })
  })

  it('refuses a basis that is neither a refusal nor an unreadable result', async () => {
    const f = await settled()
    for (const basis of [
      { kind: 'refused', refusal: 'unavailable' },
      { kind: 'unknown' },
      { kind: 'unreadable', reason: '' },
      { kind: 'unreadable', reason: 5 },
      null,
    ])
      expect(
        await f.commands.abandon({ ...f.abandon(), basis: basis as unknown as AbandonBasis }),
        JSON.stringify(basis),
      ).toEqual({
        failure: { kind: 'invalid', field: 'basis', reason: 'not-a-refusal-or-unreadable' },
      })
    expect(await f.custody()).toEqual({ kind: 'producer' })
  })

  it.each(['denied', 'invalid', 'conflict'] as const)(
    'abandons on a %s refusal and on an unreadable result',
    async refusal => {
      const refused = await settled()
      expect(
        unbox(
          await refused.commands.abandon(refused.abandon('abandon', { kind: 'refused', refusal })),
        ).custody.basis,
      ).toEqual({ kind: 'refused', refusal })
      const unreadable = await settled()
      const basis = { kind: 'unreadable', reason: `pages-${refusal}` } as const
      expect(
        unbox(await unreadable.commands.abandon(unreadable.abandon('abandon', basis))).custody
          .basis,
      ).toEqual(basis)
    },
  )

  it('refuses a principal the authority denies, and keeps producer custody', async () => {
    const f = await settled()
    f.denied.add('handoff')
    expect(await f.commands.abandon(f.abandon())).toEqual({
      failure: { kind: 'denied', action: 'handoff' },
    })
    f.denied.delete('handoff')
    expect(await f.custody()).toEqual({ kind: 'producer' })
  })

  it('keeps acknowledgement and abandonment apart: each refuses the other', async () => {
    const acked = await settled()
    unbox(await acked.commands.handoff(acked.handoff()))
    expect(await acked.commands.abandon(acked.abandon())).toEqual({
      failure: { kind: 'invalid', field: 'custody', reason: 'acknowledged' },
    })
    const abandoned = await settled()
    unbox(await abandoned.commands.abandon(abandoned.abandon()))
    expect(await abandoned.commands.handoff(abandoned.handoff())).toEqual({
      failure: { kind: 'invalid', field: 'custody', reason: 'abandoned' },
    })
    expect((await abandoned.custody()).kind).toBe('abandoned')
  })

  it('refuses a new read of an abandoned result', async () => {
    const f = await settled()
    unbox(await f.commands.abandon(f.abandon()))
    expect(
      await f.commands.acquireRead({
        ...f.admit,
        operation: op('read-after'),
        result: f.settlement.version,
      }),
    ).toEqual({ failure: { kind: 'invalid', field: 'custody', reason: 'abandoned' } })
  })

  it('cleans an abandoned result up, releases its material and gives the share back', async () => {
    const f = await settled(1)
    const second = { ...f.admit, call: callId('two'), operation: op('admit-second') }
    expect(await f.commands.admit(second)).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'model-capacity' },
    })
    expect(
      await f.commands.advanceCleanup({ ...f.execution, operation: op('too-early') }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'custody' } })
    unbox(await f.commands.abandon(f.abandon()))
    expect(
      unbox(await f.commands.advanceCleanup({ ...f.execution, operation: op('cleanup') })),
    ).toMatchObject({ kind: 'abandoned', cleanup: 'released' })
    expect(await f.commands.loadRecovery(f.admit)).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'recovery-material-released' },
    })
    expect(unbox(await f.commands.admit(second)).call).toBe(callId('two'))
  })

  it('wakes the start scan for an abandoned result until its cleanup released it', async () => {
    const f = await settled()
    const pending = async () =>
      unbox(await f.commands.scanPending({ ...f.admit, after: null, limit: 2 })).calls
    unbox(await f.commands.abandon(f.abandon()))
    expect(await pending()).toEqual([f.admit.call])
    unbox(await f.commands.advanceCleanup({ ...f.execution, operation: op('cleanup') }))
    expect(await pending()).toEqual([])
  })

  it('answers lost for an abandoned result, with the abandonment record as evidence', async () => {
    const f = await settled()
    const access = { principal: f.principal, tenant: f.tenant, reference: f.reference }
    expect(await contactOf(f.commands, undefined, access)).toEqual({ ok: { kind: 'unknown' } })
    const { custody } = unbox(await f.commands.abandon(f.abandon()))
    expect(await contactOf(f.commands, undefined, access)).toEqual({
      ok: { kind: 'lost', evidence: custody.record },
    })
  })
})
