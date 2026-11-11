import { expect, it } from 'vitest'
import { requestHead } from '@omne-harness/model-contract/provider'
import { createMemoryModelCommands } from '../src/testing/index.ts'
import { callId, fixture, unbox } from './memory-fixture.ts'

it('reads the whole request of an admitted call, while the state of the call carries its head', async () => {
  const f = fixture()
  const { commands } = createMemoryModelCommands(f.options)
  unbox(await commands.admit(f.admit))
  expect(await commands.loadRequest(f.admit)).toEqual({ ok: f.admit.request })
  expect(unbox(await commands.loadRecovery(f.admit)).request).toEqual(requestHead(f.admit.request))
})

it('answers a call that does not exist as it answers the state of that call', async () => {
  const f = fixture()
  const { commands } = createMemoryModelCommands(f.options)
  unbox(await commands.admit(f.admit))
  const absent = { ...f.admit, call: callId('absent') }
  const state = await commands.loadRecovery(absent)
  expect(state).toHaveProperty('failure')
  expect(await commands.loadRequest(absent)).toEqual(state)
})
