import { afterEach, expect, it } from 'vitest'
import { openWorld, command, context, type World } from './world.ts'

const worlds: World[] = []
async function open(options: Parameters<typeof openWorld>[0] = {}) {
  const world = await openWorld(options)
  worlds.push(world)
  return world
}
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})

it('persists state, original operation and value-free changes across reopening the SQL provider', async () => {
  const first = await open()
  expect(await first.backend.commit(context, command())).toEqual({
    kind: 'committed',
    operationId: 'operation-1',
    revision: 1,
    changed: true,
  })
  await first.close()
  const reopened = await open({ root: first.root })
  expect(reopened.counts()).toEqual([1, 1, 1])
  expect(await reopened.backend.readState(context, command().target)).toMatchObject({
    kind: 'state',
    state: {
      revision: 1,
      sources: [
        { id: 'organization', values: [] },
        {
          id: 'tenant',
          values: [{ itemId: 'enabled', value: { kind: 'value', value: true }, locked: false }],
        },
      ],
    },
  })
  expect(
    await reopened.backend.getOperation(context, {
      target: command().target,
      operationId: 'operation-1',
    }),
  ).toEqual({ kind: 'committed', operationId: 'operation-1', revision: 1, changed: true })
  expect(
    await reopened.backend.readChanges(context, {
      target: command().target,
      afterRevision: 0,
      limit: 10,
    }),
  ).toEqual({
    kind: 'changes',
    changes: [{ revision: 1, operationId: 'operation-1', itemId: 'enabled', sourceId: 'tenant' }],
    nextRevision: null,
  })
})
