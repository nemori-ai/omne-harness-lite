import { expect, it } from 'vitest'
import { decodeDispatchId } from '@omne-harness/model-contract'
import type { TransportFact, WriteContext } from '@omne-harness/model-contract/provider'
import { createMemoryModelCommands } from '../src/testing/index.ts'
import { fixture, instance, op, proof, unbox } from './memory-fixture.ts'

async function prepared() {
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
  const dispatch = unbox(decodeDispatchId('mdisp_zero-start'))
  let serial = 0
  async function write(): Promise<WriteContext> {
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
  unbox(await commands.openReceiveWindow({ ...(await write()), dispatch, window: 'zero-start' }))
  const termination = {
    kind: 'failed',
    fault: { cause: 'upstream-unavailable', diagnostic: 'synthetic-no-send', upstreamStatus: null },
  } as const
  const facts: TransportFact[] = [{ kind: 'ended', termination }]
  return { ...f, commands, dispatch, write, termination, facts }
}

for (const prior of ['prepared', 'unknown'] as const) {
  it(`derives no content from confirmed not-sent after ${prior} and retains the retry decision guard`, async () => {
    const f = await prepared()
    if (prior === 'unknown')
      unbox(
        await f.commands.recordSend({ ...(await f.write()), dispatch: f.dispatch, state: prior }),
      )
    unbox(
      await f.commands.recordSend({
        ...(await f.write()),
        dispatch: f.dispatch,
        state: 'not-sent',
      }),
    )
    unbox(
      await f.commands.preserve({
        ...(await f.write()),
        dispatch: f.dispatch,
        window: 'zero-start',
        facts: f.facts,
      }),
    )
    expect(unbox(await f.commands.dispatches(f.admit))[0]?.firstContent).toBe('none-proven')
    expect(
      await f.commands.settle({ ...(await f.write()), termination: f.termination }),
    ).toMatchObject({
      failure: { kind: 'invalid', field: 'termination', reason: 'retry-not-decided' },
    })
  })
  it(`does not infer not-sent from ${prior} alone`, async () => {
    const f = await prepared()
    if (prior === 'unknown')
      unbox(
        await f.commands.recordSend({ ...(await f.write()), dispatch: f.dispatch, state: prior }),
      )
    unbox(
      await f.commands.preserve({
        ...(await f.write()),
        dispatch: f.dispatch,
        window: 'zero-start',
        facts: f.facts,
      }),
    )
    expect(unbox(await f.commands.dispatches(f.admit))[0]?.firstContent).toBe('uncertain')
  })
}

it('retains uncertainty for another unconfirmed receive window', async () => {
  const f = await prepared()
  unbox(
    await f.commands.openReceiveWindow({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'other',
    }),
  )
  unbox(
    await f.commands.recordSend({ ...(await f.write()), dispatch: f.dispatch, state: 'not-sent' }),
  )
  unbox(
    await f.commands.preserve({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'zero-start',
      facts: f.facts,
    }),
  )
  expect(unbox(await f.commands.dispatches(f.admit))[0]?.firstContent).toBe('uncertain')
})

it('does not treat an empty batch as a terminal no-send proof', async () => {
  const f = await prepared()
  unbox(
    await f.commands.recordSend({ ...(await f.write()), dispatch: f.dispatch, state: 'not-sent' }),
  )
  unbox(
    await f.commands.preserve({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'zero-start',
      facts: [],
    }),
  )
  expect(unbox(await f.commands.dispatches(f.admit))[0]?.firstContent).toBe('uncertain')
})

it('rejects a whole contradictory batch after not-sent without publishing its earlier fact', async () => {
  const f = await prepared()
  unbox(
    await f.commands.recordSend({ ...(await f.write()), dispatch: f.dispatch, state: 'not-sent' }),
  )
  const before = unbox(await f.commands.loadRecovery(f.admit))
  const facts: TransportFact[] = [
    { kind: 'diagnostic', value: { kind: 'reasoning-disabled', reason: 'foreign-prefix' } },
    { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
    { kind: 'block-delta', index: '0', delta: 'contradiction' },
  ]
  expect(
    await f.commands.preserve({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'zero-start',
      facts,
    }),
  ).toMatchObject({ failure: { kind: 'invalid', field: 'facts', reason: 'not-sent-content' } })
  expect(unbox(await f.commands.loadRecovery(f.admit))).toEqual(before)
})

for (const delta of ['', 'observed']) {
  it(`rejects not-sent after an existing block with ${delta || 'no'} content`, async () => {
    const f = await prepared()
    const facts: TransportFact[] = [
      { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
      { kind: 'block-delta', index: '0', delta },
    ]
    unbox(
      await f.commands.preserve({
        ...(await f.write()),
        dispatch: f.dispatch,
        window: 'zero-start',
        facts,
      }),
    )
    const before = unbox(await f.commands.loadRecovery(f.admit))
    expect(
      await f.commands.recordSend({
        ...(await f.write()),
        dispatch: f.dispatch,
        state: 'not-sent',
      }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'state', reason: 'not-sent-content' } })
    expect(unbox(await f.commands.loadRecovery(f.admit))).toEqual(before)
  })
}
