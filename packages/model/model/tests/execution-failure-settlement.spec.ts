import { expect, it } from 'vitest'
import { decodeDispatchId, type Termination } from '@omne-harness/model-contract'
import type { WriteContext } from '@omne-harness/model-contract/provider'
import { createMemoryModelCommands } from '../src/testing/index.ts'
import { fixture, instance, op, proof, unbox } from './memory-fixture.ts'

const persistence: Termination = {
  kind: 'failed',
  fault: { cause: 'persistence', diagnostic: 'execution-write-refused', upstreamStatus: null },
}
async function claimed() {
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
  let serial = 0
  async function write(): Promise<WriteContext> {
    return {
      ...execution,
      operation: op(`write-${++serial}`),
      expected: unbox(await commands.loadRecovery(f.admit)).state.revision,
    }
  }
  return { ...f, commands, write }
}
async function receiving() {
  const f = await claimed()
  const dispatch = unbox(decodeDispatchId('mdisp_execution-failure'))
  unbox(
    await f.commands.prepareDispatch({
      ...(await f.write()),
      dispatch,
      supplier: f.admit.request.suppliers[0],
      policyDecision: null,
    }),
  )
  unbox(await f.commands.openReceiveWindow({ ...(await f.write()), dispatch, window: 'first' }))
  return { ...f, dispatch }
}

it('settles an execution failure on a call that has no dispatch', async () => {
  const f = await claimed()
  const settled = unbox(await f.commands.settle({ ...(await f.write()), termination: persistence }))
  expect(settled.termination).toEqual(persistence)
  expect(unbox(await f.commands.loadRecovery(f.admit)).state.phase).toBe('settled')
  expect(unbox(await f.commands.dispatches(f.admit))).toEqual([])
})

it('settles an execution failure while a receive window is open, and refuses later facts', async () => {
  const f = await receiving()
  unbox(
    await f.commands.preserve({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'first',
      facts: [
        { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
        { kind: 'block-delta', index: '0', delta: 'kept' },
      ],
    }),
  )
  unbox(
    await f.commands.openReceiveWindow({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'second',
    }),
  )
  const settled = unbox(await f.commands.settle({ ...(await f.write()), termination: persistence }))
  expect(settled.termination).toEqual(persistence)
  expect(
    await f.commands.preserve({
      ...(await f.write()),
      dispatch: f.dispatch,
      window: 'second',
      facts: [{ kind: 'block-delta', index: '0', delta: 'late' }],
    }),
  ).toMatchObject({ failure: { kind: 'invalid', field: 'window', reason: 'not-open' } })
})

it('still requires the recorded terminal for every other failure cause', async () => {
  const f = await claimed()
  expect(
    await f.commands.settle({
      ...(await f.write()),
      termination: {
        kind: 'failed',
        fault: { cause: 'upstream-unavailable', diagnostic: 'none', upstreamStatus: null },
      },
    }),
  ).toMatchObject({ failure: { kind: 'invalid', field: 'termination', reason: 'not-actual' } })
})
