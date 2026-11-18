import { describe, expect, it } from 'vitest'
import {
  decodeDispatchId,
  type MaterializationReceipt,
  type ModelBlock,
} from '@omne-harness/model-contract'
import { type TransportFact } from '@omne-harness/model-contract/provider'
import { judgePart, REPLAY_PREFIX_MAX_LENGTH } from '@omne-harness/message'
import { createMemoryModelCommands } from '../src/testing/index.ts'
import { digest } from '../src/testing/value.ts'
import { fixture, instance, op, proof, unbox } from './memory-fixture.ts'

const FORMAT = 'test-format-v1'
const COMPLETED = { kind: 'completed', reason: 'stop' } as const

function part(value: unknown): ModelBlock {
  const judged = judgePart(value)
  if (!('ok' in judged)) throw new Error('fixture part')
  const block = judged.ok
  if (block.kind === 'reasoning_state' || block.kind === 'thinking' || block.kind === 'text')
    return block
  throw new Error(`fixture part of kind ${block.kind}`)
}

const state = part({
  kind: 'reasoning_state',
  id: 'rs',
  visibility: { toHuman: false, toModel: true },
  payload: 'opaque',
  pairs: [],
})
const text = part({
  kind: 'text',
  id: 'tx',
  visibility: { toHuman: true, toModel: true },
  text: 'hello',
})
const thinking = part({
  kind: 'thinking',
  id: 'th',
  visibility: { toHuman: true, toModel: true },
  text: 'pondering',
})

async function running() {
  const f = fixture()
  const { commands } = createMemoryModelCommands(f.options)
  unbox(await commands.admit(f.admit))
  const execution = unbox(
    await commands.claim({
      ...f.admit,
      operation: op('claim'),
      instance: instance(),
      continuity: proof(f.admit.call),
    }),
  )
  const dispatch = unbox(decodeDispatchId('mdisp_one'))
  let serial = 0
  async function write() {
    return {
      ...execution,
      operation: op(`write-${++serial}`),
      expected: unbox(await commands.loadRecovery(f.admit)).state.revision,
    }
  }
  unbox(
    await commands.prepareDispatch({
      ...(await write()),
      dispatch,
      supplier: f.admit.request.suppliers[0],
      policyDecision: null,
    }),
  )
  return { ...f, commands, dispatch, write }
}

async function sent(replayFormat: string | undefined) {
  const f = await running()
  const receipt: MaterializationReceipt = {
    supplier: f.admit.request.suppliers[0].adoption,
    representation: f.admit.request.representation,
    payloadDigest: 'a'.repeat(64),
    ...(replayFormat === undefined ? {} : { replayFormat }),
  }
  unbox(
    await f.commands.recordMaterialization({
      ...(await f.write()),
      dispatch: f.dispatch,
      receipt,
      window: 'w',
    }),
  )
  unbox(
    await f.commands.recordSend({ ...(await f.write()), dispatch: f.dispatch, state: 'started' }),
  )
  async function preserve(facts: readonly TransportFact[]) {
    f.completeWindows.add(`${f.admit.call}/w/${digest(facts)}`)
    return f.commands.preserve({ ...(await f.write()), dispatch: f.dispatch, window: 'w', facts })
  }
  async function settle() {
    return f.commands.settle({ ...(await f.write()), termination: COMPLETED })
  }
  return { ...f, preserve, settle }
}

const reply: readonly TransportFact[] = [
  { kind: 'block-seal', index: '0', block: state },
  { kind: 'block-open', index: '1', mode: 'append', content: 'text' },
  { kind: 'block-delta', index: '1', delta: 'hello' },
  { kind: 'block-seal', index: '1', block: text },
]
const ended: TransportFact = { kind: 'ended', termination: COMPLETED }

describe('the finish of a reply that holds reasoning state', () => {
  it('settles when the receipt names the replay format', async () => {
    const f = await sent(FORMAT)
    unbox(await f.preserve([...reply, ended]))
    expect(unbox(await f.settle()).termination).toEqual(COMPLETED)
  })

  it('fails named without a replay format, and keeps nothing of the batch', async () => {
    const f = await sent(undefined)
    const before = unbox(await f.commands.loadRecovery(f.admit))
    expect(await f.preserve([...reply, ended])).toEqual({
      failure: { kind: 'invalid', field: 'termination', reason: 'replay-format-unknown' },
    })
    expect(unbox(await f.commands.loadRecovery(f.admit))).toEqual(before)
  })

  it('settles thinking alone without a replay format, as a message of unknown reasoning origin', async () => {
    const f = await sent(undefined)
    unbox(
      await f.preserve([
        { kind: 'block-open', index: '0', mode: 'append', content: 'thinking' },
        { kind: 'block-delta', index: '0', delta: 'pondering' },
        { kind: 'block-seal', index: '0', block: thinking },
        ended,
      ]),
    )
    expect(unbox(await f.settle()).termination).toEqual(COMPLETED)
  })

  it('settles thinking alone with a replay format, in the replay range of the dispatch supplier', async () => {
    const f = await sent(FORMAT)
    unbox(
      await f.preserve([
        { kind: 'block-open', index: '0', mode: 'append', content: 'thinking' },
        { kind: 'block-delta', index: '0', delta: 'pondering' },
        { kind: 'block-seal', index: '0', block: thinking },
        ended,
      ]),
    )
    expect(unbox(await f.settle()).termination).toEqual(COMPLETED)
  })

  it('refuses a receipt whose replay format is not a replay tag', async () => {
    const f = await running()
    expect(
      await f.commands.recordMaterialization({
        ...(await f.write()),
        dispatch: f.dispatch,
        receipt: {
          supplier: f.admit.request.suppliers[0].adoption,
          representation: f.admit.request.representation,
          payloadDigest: 'a'.repeat(64),
          replayFormat: '',
        },
        window: 'w',
      }),
    ).toEqual({ failure: { kind: 'invalid', field: 'receipt', reason: 'binding' } })
  })
})

describe('a late terminal fact over a reply that holds reasoning state', () => {
  async function late(f: Awaited<ReturnType<typeof sent>>) {
    return f.commands.recordLateFact({
      ...f.admit,
      operation: op('late-terminal'),
      dispatch: f.dispatch,
      source: proof(`${f.admit.call}/${f.dispatch}`, 'supplier'),
      fact: { kind: 'terminal', event: 'terminal', actual: COMPLETED },
    })
  }

  it('fixes the logical terminal when the receipt names the replay format', async () => {
    const f = await sent(FORMAT)
    unbox(await f.preserve(reply))
    expect(await f.settle()).toMatchObject({ failure: { reason: 'not-actual' } })
    unbox(await late(f))
    expect(unbox(await f.settle()).termination).toEqual(COMPLETED)
  })

  it('refuses the fact named without a replay format, and leaves the dispatch as it was', async () => {
    const f = await sent(undefined)
    unbox(await f.preserve(reply))
    const before = unbox(await f.commands.dispatches(f.admit))
    expect(await late(f)).toEqual({
      failure: { kind: 'invalid', field: 'termination', reason: 'replay-format-unknown' },
    })
    expect(unbox(await f.commands.dispatches(f.admit))).toEqual(before)
    expect(await f.settle()).toMatchObject({ failure: { reason: 'not-actual' } })
  })
})

describe('the replay range a settlement records', () => {
  async function receipted(extra: Partial<MaterializationReceipt>) {
    const f = await running()
    const receipt: MaterializationReceipt = {
      supplier: f.admit.request.suppliers[0].adoption,
      representation: f.admit.request.representation,
      payloadDigest: 'a'.repeat(64),
      ...extra,
    }
    return {
      ...f,
      record: async () =>
        f.commands.recordMaterialization({
          ...(await f.write()),
          dispatch: f.dispatch,
          receipt,
          window: 'w',
        }),
    }
  }

  async function settledWith(
    extra: Partial<MaterializationReceipt>,
    facts: readonly TransportFact[],
  ) {
    const f = await receipted(extra)
    unbox(await f.record())
    unbox(
      await f.commands.recordSend({ ...(await f.write()), dispatch: f.dispatch, state: 'started' }),
    )
    f.completeWindows.add(`${f.admit.call}/w/${digest(facts)}`)
    unbox(
      await f.commands.preserve({ ...(await f.write()), dispatch: f.dispatch, window: 'w', facts }),
    )
    const end = facts.at(-1)
    if (end?.kind !== 'ended' || end.termination.kind === 'interrupted') throw new Error('an end')
    return {
      ...f,
      settled: unbox(
        await f.commands.settle({ ...(await f.write()), termination: end.termination }),
      ),
    }
  }

  it('names the scope, the format and the call that produced the reasoning', async () => {
    const f = await settledWith({ replayFormat: FORMAT }, [...reply, ended])
    expect(f.settled.replay).toEqual({
      scope: f.admit.request.declarations[0].produces,
      format: FORMAT,
      call: String(f.admit.call),
    })
  })

  it('keeps the prefix the receipt recorded', async () => {
    const f = await settledWith({ replayFormat: FORMAT, replayPrefix: 'h:1.s:2.t:3.p:4' }, [
      ...reply,
      ended,
    ])
    expect(f.settled.replay).toEqual({
      scope: f.admit.request.declarations[0].produces,
      format: FORMAT,
      prefix: 'h:1.s:2.t:3.p:4',
      call: String(f.admit.call),
    })
  })

  it('records none for a reply without reasoning', async () => {
    const f = await settledWith({ replayFormat: FORMAT }, [
      { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
      { kind: 'block-delta', index: '0', delta: 'hello' },
      { kind: 'block-seal', index: '0', block: text },
      ended,
    ])
    expect(Object.hasOwn(f.settled, 'replay')).toBe(false)
  })

  it('records none when the call failed after the reasoning arrived', async () => {
    const f = await settledWith({ replayFormat: FORMAT }, [
      { kind: 'block-seal', index: '0', block: state },
      {
        kind: 'ended',
        termination: {
          kind: 'failed',
          fault: { cause: 'stream-lost', diagnostic: 'stream lost', upstreamStatus: null },
        },
      },
    ])
    expect(f.settled.termination.kind).toBe('failed')
    expect(Object.hasOwn(f.settled, 'replay')).toBe(false)
  })

  it('binds a prefix only with a format, and only within its length', async () => {
    const binding = { failure: { kind: 'invalid', field: 'receipt', reason: 'binding' } }
    const max = REPLAY_PREFIX_MAX_LENGTH
    expect(await (await receipted({ replayPrefix: 'h:1' })).record()).toEqual(binding)
    expect(await (await receipted({ replayFormat: FORMAT, replayPrefix: '' })).record()).toEqual(
      binding,
    )
    expect(
      await (await receipted({ replayFormat: FORMAT, replayPrefix: 'x'.repeat(max + 1) })).record(),
    ).toEqual(binding)
    expect(
      'ok' in
        (await (await receipted({ replayFormat: FORMAT, replayPrefix: 'x'.repeat(max) })).record()),
    ).toBe(true)
  })
})
