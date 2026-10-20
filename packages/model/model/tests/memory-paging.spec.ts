import { expect, it } from 'vitest'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import { fixture, unbox } from './memory-fixture.ts'

it('reserves the maximum paging representation in the smallest accepted call budget', async () => {
  async function attempt(bytes: number) {
    const f = fixture()
    const memory = createMemoryModelCommands(f.options)
    const input = { ...f.admit, capacity: { ...f.admit.capacity, bytes: String(bytes) } }
    return { f, memory, input, reply: await memory.commands.admit(input) }
  }
  let low = 1
  let high = 100000
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if ('ok' in (await attempt(middle)).reply) high = middle
    else low = middle + 1
  }
  const accepted = await attempt(low)
  unbox(accepted.reply)
  expect((await attempt(low - 1)).reply).toMatchObject({ failure: { kind: 'capacity' } })
  const before = await accepted.memory.commands.loadRecovery(accepted.input)
  for (const value of [Number.MAX_SAFE_INTEGER, 1, 1024]) {
    expect(() =>
      accepted.memory.control.configureResultPaging({
        ...accepted.input,
        resultPageParts: value,
        resultPageTargetBytes: value,
      }),
    ).not.toThrow()
    expect(await accepted.memory.commands.loadRecovery(accepted.input)).toEqual(before)
  }
})
