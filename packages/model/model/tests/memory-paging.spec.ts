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
  // This fixture uses 1961 material bytes, 5 capacity digits and 22579 reserved bytes.
  const accepted = await attempt(24545)
  unbox(accepted.reply)
  const refused = await attempt(24544)
  expect(refused.reply).toMatchObject({ failure: { kind: 'capacity' } })
  expect(unbox(await refused.memory.commands.query(refused.input))).toEqual({
    kind: 'not-committed',
  })
  expect(
    unbox(
      await refused.memory.commands.recall({
        ...refused.input,
        admission: refused.input.operation,
      }),
    ),
  ).toEqual({ kind: 'not-accepted', operation: refused.input.operation })
  expect(await refused.memory.commands.loadRecovery(refused.input)).toEqual({
    failure: { kind: 'invalid', field: 'call', reason: 'not-found' },
  })
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
