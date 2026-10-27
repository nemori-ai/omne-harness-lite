// The refusals of the in-memory ModelCommands at the dispatch boundary: which supplier a call may
// prepare a first dispatch for, which receipt binds a dispatch, and which completed terminal forms
// a message. Each refusal is a named `invalid` and leaves the call as it was.
import { describe, expect, it } from 'vitest'
import {
  decodeDispatchId,
  type FixedModelRequest,
  type MaterializationReceipt,
} from '@omne-harness/model-contract'
import { type TransportFact } from '@omne-harness/model-contract/provider'
import { judgeContentBlock } from '@omne-harness/content-block'
import { judgePart } from '@omne-harness/message'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import { adoption, fixture, instance, op, proof, request, unbox } from './memory-fixture.ts'

const second = {
  adoption: { ...adoption, name: 'second' },
  recipient: 'test.invalid',
  model: 'second',
  credential: { kind: 'factory' },
} as const

/** A request that may fall back to a second supplier. */
const twoSuppliers: FixedModelRequest = {
  ...request,
  suppliers: [request.suppliers[0], second],
  fallback: true,
  declarations: [request.declarations[0], request.declarations[0]],
}

/** An admitted and claimed call over `fixed`, with no dispatch yet. */
async function claimed(fixed: FixedModelRequest = request) {
  const f = fixture()
  const admit = { ...f.admit, request: fixed }
  const { commands } = createMemoryModelCommands(f.options)
  unbox(await commands.admit(admit))
  const execution = unbox(
    await commands.claim({
      ...admit,
      operation: op('claim'),
      instance: instance(),
      continuity: proof(admit.call),
    }),
  )
  let serial = 0
  async function write() {
    return {
      ...execution,
      operation: op(`write-${++serial}`),
      expected: unbox(await commands.loadRecovery(admit)).state.revision,
    }
  }
  return { ...f, admit, commands, write }
}

const dispatch = unbox(decodeDispatchId('mdisp_one'))

function textBlock() {
  const judged = judgeContentBlock({
    kind: 'text',
    id: 'text-one',
    visibility: { toHuman: true, toModel: true },
    text: 'hello',
  })
  if ('rejected' in judged || judged.ok.kind !== 'text') throw new Error('fixture block')
  return judged.ok
}

describe('the first dispatch of a call', () => {
  it('prepares for the first supplier of the request without a policy decision', async () => {
    const f = await claimed(twoSuppliers)
    unbox(
      await f.commands.prepareDispatch({
        ...(await f.write()),
        dispatch,
        supplier: twoSuppliers.suppliers[0],
        policyDecision: null,
      }),
    )
    expect(unbox(await f.commands.dispatches(f.admit)).map(record => record.supplier)).toEqual([
      twoSuppliers.suppliers[0],
    ])
  })

  it.each([
    ['a supplier that the request does not name', request, second, null, 'outside-request'],
    ['the second supplier of the request', twoSuppliers, second, null, 'first-supplier'],
    [
      'the first supplier with a policy decision',
      twoSuppliers,
      request.suppliers[0],
      proof('policy', 'retry'),
      'first-supplier',
    ],
  ] as const)(
    'refuses %s and records no dispatch',
    async (_name, fixed, supplier, policyDecision, reason) => {
      const f = await claimed(fixed)
      expect(
        await f.commands.prepareDispatch({
          ...(await f.write()),
          dispatch,
          supplier,
          policyDecision,
        }),
      ).toEqual({ failure: { kind: 'invalid', field: 'supplier', reason } })
      expect(unbox(await f.commands.dispatches(f.admit))).toEqual([])
    },
  )
})

describe('the receipt of a dispatch', () => {
  async function prepared() {
    const f = await claimed()
    unbox(
      await f.commands.prepareDispatch({
        ...(await f.write()),
        dispatch,
        supplier: request.suppliers[0],
        policyDecision: null,
      }),
    )
    return f
  }
  const bound: MaterializationReceipt = {
    supplier: request.suppliers[0].adoption,
    representation: request.representation,
    payloadDigest: 'a'.repeat(64),
  }

  it.each([
    ['names another supplier adoption', { ...bound, supplier: second.adoption }],
    ['names another representation', { ...bound, representation: second.adoption }],
    [
      'has a payload digest with a leading character too many',
      { ...bound, payloadDigest: `x${'a'.repeat(64)}` },
    ],
    [
      'has a payload digest with a trailing character too many',
      { ...bound, payloadDigest: `${'a'.repeat(64)}x` },
    ],
  ] as const)(
    'is refused when it %s, and the dispatch keeps no receipt',
    async (_name, receipt) => {
      const f = await prepared()
      expect(
        await f.commands.recordMaterialization({ ...(await f.write()), dispatch, receipt }),
      ).toEqual({ failure: { kind: 'invalid', field: 'receipt', reason: 'binding' } })
      const [record] = unbox(await f.commands.dispatches(f.admit))
      expect(record?.materialization).toBeNull()
    },
  )

  it('is recorded when it names the dispatch supplier, the request representation and a digest', async () => {
    const f = await prepared()
    unbox(
      await f.commands.recordMaterialization({ ...(await f.write()), dispatch, receipt: bound }),
    )
    const [record] = unbox(await f.commands.dispatches(f.admit))
    expect(record?.materialization?.receipt).toEqual(bound)
  })
})

describe('a completed terminal that forms no message', () => {
  async function receiving() {
    const f = await claimed()
    unbox(
      await f.commands.prepareDispatch({
        ...(await f.write()),
        dispatch,
        supplier: request.suppliers[0],
        policyDecision: null,
      }),
    )
    unbox(await f.commands.openReceiveWindow({ ...(await f.write()), dispatch, window: 'w' }))
    async function preserve(facts: readonly TransportFact[]) {
      return f.commands.preserve({ ...(await f.write()), dispatch, window: 'w', facts })
    }
    return { ...f, preserve }
  }
  const stop: TransportFact = { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } }
  const block = textBlock()

  it.each([
    ['holds no block', [stop]],
    [
      'holds a block that was opened and never sealed',
      [
        { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
        { kind: 'block-delta', index: '0', delta: 'hello' },
        stop,
      ],
    ],
    [
      'holds a sealed block and then a block that was opened and never sealed',
      [
        { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
        { kind: 'block-delta', index: '0', delta: 'hello' },
        { kind: 'block-seal', index: '0', block: textBlock() },
        { kind: 'block-open', index: '1', mode: 'append', content: 'text' },
        { kind: 'block-delta', index: '1', delta: 'more' },
        stop,
      ],
    ],
  ] as const)('is refused when the reply %s, and the batch is not kept', async (_name, facts) => {
    const f = await receiving()
    const before = unbox(await f.commands.loadRecovery(f.admit))
    expect(await f.preserve(facts)).toEqual({
      failure: { kind: 'invalid', field: 'termination', reason: 'unsealed-or-empty' },
    })
    expect(unbox(await f.commands.loadRecovery(f.admit))).toEqual(before)
  })

  it('is refused when the sealed blocks do not form one message: two blocks share an identity', async () => {
    const f = await receiving()
    const before = unbox(await f.commands.loadRecovery(f.admit))
    const twice: TransportFact[] = ['0', '1'].flatMap(index => [
      { kind: 'block-open', index, mode: 'append', content: 'text' } as const,
      { kind: 'block-delta', index, delta: block.text } as const,
      { kind: 'block-seal', index, block } as const,
    ])
    expect(await f.preserve([...twice, stop])).toEqual({
      failure: { kind: 'invalid', field: 'termination', reason: 'invalid-completion' },
    })
    expect(unbox(await f.commands.loadRecovery(f.admit))).toEqual(before)
  })

  it('is kept when every block of the reply is sealed', async () => {
    const f = await receiving()
    const snapshot = unbox(
      await f.preserve([
        { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
        { kind: 'block-delta', index: '0', delta: block.text },
        { kind: 'block-seal', index: '0', block },
        stop,
      ]),
    )
    expect(snapshot.blocks).toEqual([{ kind: 'sealed', index: '0', block }])
  })

  it('a reply cut at the output limit ends without forming a message, even when it holds no block', async () => {
    const f = await receiving()
    unbox(
      await f.preserve([{ kind: 'ended', termination: { kind: 'completed', reason: 'limit' } }]),
    )
    const [record] = unbox(await f.commands.dispatches(f.admit))
    expect(record?.terminal).toEqual({ kind: 'completed', reason: 'limit' })
  })
})

describe('the replay of a finish on a dispatch without a receipt', () => {
  async function unreceipted() {
    const f = await claimed()
    unbox(
      await f.commands.prepareDispatch({
        ...(await f.write()),
        dispatch,
        supplier: request.suppliers[0],
        policyDecision: null,
      }),
    )
    unbox(await f.commands.openReceiveWindow({ ...(await f.write()), dispatch, window: 'w' }))
    return f
  }
  const visibility = { toHuman: true, toModel: true }
  const stop: TransportFact = { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } }

  it('keeps a reply of thinking alone, as reasoning of unknown origin', async () => {
    const f = await unreceipted()
    const judged = judgePart({ kind: 'thinking', id: 'th', visibility, text: 'pondering' })
    if (!('ok' in judged) || judged.ok.kind !== 'thinking') throw new Error('fixture part')
    const thinking = judged.ok
    const snapshot = unbox(
      await f.commands.preserve({
        ...(await f.write()),
        dispatch,
        window: 'w',
        facts: [
          { kind: 'block-open', index: '0', mode: 'append', content: 'thinking' },
          { kind: 'block-delta', index: '0', delta: 'pondering' },
          { kind: 'block-seal', index: '0', block: thinking },
          stop,
        ],
      }),
    )
    expect(snapshot.blocks).toEqual([{ kind: 'sealed', index: '0', block: thinking }])
  })

  it('refuses a reply with reasoning state by name: the replay format is unknown', async () => {
    const f = await unreceipted()
    const judged = judgePart({
      kind: 'reasoning_state',
      id: 'rs',
      visibility: { toHuman: false, toModel: true },
      payload: 'opaque',
      pairs: [],
    })
    if (!('ok' in judged) || judged.ok.kind !== 'reasoning_state') throw new Error('fixture part')
    expect(
      await f.commands.preserve({
        ...(await f.write()),
        dispatch,
        window: 'w',
        facts: [{ kind: 'block-seal', index: '0', block: judged.ok }, stop],
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: 'termination', reason: 'replay-format-unknown' },
    })
  })
})
