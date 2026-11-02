import { expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { fixture, ok } from './fixture.ts'

it('keeps account work pending while its core completion contract is unsupported', async () => {
  const f = await fixture()
  await f.store.commit({
    domain: f.domain,
    expected: ok(decodeToolRevision('1')),
    revision: ok(decodeToolRevision('2')),
    writes: [
      {
        kind: 'put',
        record: {
          kind: 'task',
          task: {
            kind: 'account',
            operation: f.task.operation,
            state: 'pending',
            diagnostic: null,
            basis: f.result.source,
          },
        },
      },
    ],
  })
  expect(await f.drive()).toEqual(succeed({ pending: 1 }))
  expect(f.pushes.map(delivery => delivery.kind)).toEqual(['result'])
  expect(f.input.commands.recordTask).not.toHaveBeenCalled()
})
