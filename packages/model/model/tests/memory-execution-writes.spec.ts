import { expect, it } from 'vitest'
import { judgeContentBlock } from '@omne-harness/content-block'
import { decodeDispatchId } from '@omne-harness/model-contract'
import type { TransportFact, WriteContext } from '@omne-harness/model-contract/provider'
import { createMemoryModelCommands } from '../src/testing/memory.ts'
import { fixture, instance, op, proof, unbox } from './memory-fixture.ts'

// What the execution writes record once their expected call is found: the settlement source,
// the window that preserve requires, the block capacity of a preserved batch, and the retry
// position with the state it moves the call to.

type Principal = ReturnType<typeof fixture>['admit']['principal']

function block(id: string) {
  const judged = judgeContentBlock({
    kind: 'text',
    id,
    visibility: { toHuman: true, toModel: true },
    text: id,
  })
  if ('rejected' in judged) throw new Error('fixture block')
  return judged.ok
}

async function running(capacityBlocks = '100') {
  const f = fixture()
  const commands = createMemoryModelCommands<Principal>(f.options).commands
  const admit = { ...f.admit, capacity: { ...f.admit.capacity, blocks: capacityBlocks } }
  unbox(await commands.admit(admit))
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
  async function write(): Promise<WriteContext> {
    return {
      ...execution,
      operation: op(`write-${++serial}`),
      expected: unbox(await commands.loadRecovery(f.admit)).state.revision,
    }
  }
  const revision = async () => unbox(await commands.loadRecovery(f.admit)).state.revision
  unbox(
    await commands.prepareDispatch({
      ...(await write()),
      dispatch,
      supplier: f.admit.request.suppliers[0],
      policyDecision: null,
    }),
  )
  async function open(window: string) {
    unbox(await commands.openReceiveWindow({ ...(await write()), dispatch, window }))
  }
  return { ...f, commands, dispatch, write, revision, open }
}

const sealed = (ids: string[]): TransportFact[] =>
  ids.flatMap((id, index) => [
    { kind: 'block-open', index: String(index), mode: 'append', content: 'text' },
    { kind: 'block-delta', index: String(index), delta: id },
    { kind: 'block-seal', index: String(index), block: block(id) },
  ])

it('settles with a model-memory source for this call at the revision that the settlement writes', async () => {
  const f = await running()
  await f.open('window')
  unbox(
    await f.commands.preserve({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'window',
      facts: [
        ...sealed(['one']),
        { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
      ],
    }),
  )
  const before = await f.revision()
  const settlement = unbox(
    await f.commands.settle({
      ...(await f.write()),
      termination: { kind: 'completed', reason: 'stop' },
    }),
  )
  const after = await f.revision()
  expect(settlement.source.owner).toBe('model-memory')
  expect(settlement.source.record).toBe(`${f.admit.call}/${settlement.version}`)
  expect(settlement.source.revision).toBe(String(BigInt(before) + 1n))
  expect(after).toBe(settlement.source.revision)
})

it('preserves only into an open window and changes nothing otherwise', async () => {
  const f = await running()
  const before = unbox(await f.commands.loadRecovery(f.admit))
  expect(
    await f.commands.preserve({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'never-opened',
      facts: sealed(['one']),
    }),
  ).toEqual({ failure: { kind: 'invalid', field: 'window', reason: 'not-open' } })
  expect(unbox(await f.commands.loadRecovery(f.admit))).toEqual(before)
})

it('refuses a preserved batch whose blocks exceed the block capacity of the call', async () => {
  const exact = await running('2')
  await exact.open('window')
  expect(
    await exact.commands.preserve({
      ...(await exact.write()),
      dispatch: exact.dispatch,
      window: 'window',
      facts: sealed(['one', 'two']),
    }),
  ).toHaveProperty('ok')
  const over = await running('1')
  await over.open('window')
  const before = unbox(await over.commands.loadRecovery(over.admit))
  expect(
    await over.commands.preserve({
      ...(await over.write()),
      dispatch: over.dispatch,
      window: 'window',
      facts: sealed(['one', 'two']),
    }),
  ).toEqual({
    failure: { kind: 'capacity', required: { ...over.admit.capacity, blocks: '1' } },
  })
  expect(unbox(await over.commands.loadRecovery(over.admit))).toEqual(before)
})

async function failedDispatch() {
  const f = await running()
  await f.open('failure')
  const facts = [
    {
      kind: 'ended',
      termination: {
        kind: 'failed',
        fault: { cause: 'upstream-unavailable', diagnostic: 'offline', upstreamStatus: '503' },
      },
    },
  ] satisfies [TransportFact]
  const { digest } = await import('../src/testing/value.ts')
  f.completeWindows.add(`${f.admit.call}/failure/${digest(facts)}`)
  unbox(
    await f.commands.preserve({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'failure',
      facts,
    }),
  )
  return f
}

it('positions one retry for the failed dispatch and moves the call to its retry decision', async () => {
  const f = await failedDispatch()
  const before = await f.revision()
  const position = unbox(
    await f.commands.prepareRetry({ ...(await f.write()), dispatch: f.dispatch }),
  )
  expect(position.consumer).toEqual({
    owner: f.admit.request.retryPolicy.owner,
    work: f.admit.call,
    position: f.dispatch,
    purpose: 'model-retry',
  })
  const record = unbox(await f.commands.loadRecovery(f.admit))
  expect(record.state).toMatchObject({ phase: 'retry-decision', dispatch: f.dispatch })
  expect(record.state.revision).toBe(String(BigInt(before) + 1n))
  expect(await f.commands.prepareRetry({ ...(await f.write()), dispatch: f.dispatch })).toEqual({
    failure: { kind: 'invalid', field: 'retry', reason: 'already-positioned' },
  })
})
