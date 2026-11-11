import { afterEach, describe, expect, it } from 'vitest'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { operationId, succeeded } from '@omne-harness/session-contract/testing'
import { assemble, type Assembly } from './fixtures/assembly.ts'

const opened: Assembly[] = []
afterEach(async () => {
  for (const app of opened.splice(0)) await app.close()
})

describe('Todo faces on real Cordis with offline access and transaction providers', () => {
  it('intercepts coordinator only, checks each call, never invokes Agent and closes held references', async () => {
    const app = await assemble()
    opened.push(app)
    const intake = await app.caller('intake')
    await app.create(intake)
    const coordinator = app.ctx.intercept(sessionKey, { caller: 'coordinator' }).get(sessionKey)
    if (coordinator === undefined) throw new Error('missing Session')
    const input = { ...app.access(), operation: operationId('todo'), text: 'one' }
    const added = succeeded(await coordinator.work.addTodo(input), 'add')
    for (const caller of ['reader', 'intake', 'maintainer'] as const) {
      const service = app.ctx.intercept(sessionKey, { caller }).get(sessionKey)
      if (service === undefined) throw new Error('missing Session')
      const before = app.checks.controls.asked().length
      for (const [action, result] of [
        ['addTodo', await service.work.addTodo(input)],
        ['removeTodo', await service.work.removeTodo({ ...input, item: added.item.id })],
        [
          'markTodoComplete',
          await service.work.markTodoComplete({ ...input, item: added.item.id }),
        ],
        ['listTodos', await service.work.listTodos({ ...app.access(), after: null, limit: 1 })],
      ] as const)
        expect(result).toEqual({ failure: { kind: 'denied', action } })
      expect(app.checks.controls.asked()).toHaveLength(before)
    }
    expect(await coordinator.work.addTodo({ ...input, principal: 'b:stranger' })).toEqual({
      failure: { kind: 'denied', action: 'addTodo' },
    })
    expect(
      succeeded(
        await coordinator.work.listTodos({ ...app.access(), after: null, limit: 1 }),
        'list',
      ).items,
    ).toHaveLength(1)
    expect(app.hooks.invoked).toHaveLength(0)
    await app.provider.dispose()
    expect(app.ctx.get(sessionKey)).toBeUndefined()
    expect(await coordinator.work.addTodo(input)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(
      await coordinator.work.listTodos({ ...app.access(), after: null, limit: 1 }),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})
