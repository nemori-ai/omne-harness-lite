import { afterEach, describe, expect, it } from 'vitest'
import { operationId, sessionId, succeeded } from '@omne-harness/session-contract/testing'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { TodoPage, TodoPageCursor } from '@omne-harness/session-contract'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, type Harness } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})
async function service() {
  const h = await harness({ backend: memoryBackend })
  open.push(h)
  await h.create()
  return h
}

describe('Session Todo face', () => {
  it('reads every page at current authorization and rejects mixed revisions', async () => {
    const h = await service()
    const work = h.faces('coordinator').work
    const input = h.access()
    for (const text of ['one', 'two', 'three'])
      succeeded(await work.addTodo({ ...input, operation: operationId(text), text }), text)
    const before = h.checks.count()
    const first = succeeded(await work.listTodos({ ...input, after: null, limit: 2 }), 'list first')
    expect(first.items.map(item => item.text)).toEqual(['one', 'two'])
    expect(first.next).not.toBeNull()
    h.checks.script({ kind: 'denied' })
    expect(await work.listTodos({ ...input, after: first.next, limit: 2 })).toEqual({
      failure: { kind: 'denied', action: 'listTodos' },
    })
    const last = succeeded(
      await work.listTodos({ ...input, after: first.next, limit: 2 }),
      'list last',
    )
    expect(last.items.map(item => item.text)).toEqual(['three'])
    expect(last.next).toBeNull()
    expect(h.checks.count() - before).toBe(3)
    const changed = succeeded(
      await work.addTodo({ ...input, operation: operationId('four'), text: 'four' }),
      'add',
    )
    expect(await work.listTodos({ ...input, after: first.next, limit: 2 })).toEqual({
      failure: { kind: 'changed', revision: changed.receipt.revision },
    })
  })

  it('lists completed items in insertion order, hides tombstones and freezes returned snapshots', async () => {
    const h = await service()
    const work = h.faces('coordinator').work
    const input = h.access()
    const added = []
    for (const text of ['one', 'two', 'three', 'four', 'five'])
      added.push(
        succeeded(await work.addTodo({ ...input, operation: operationId(text), text }), text).item,
      )
    const first = added[0]
    const second = added[1]
    if (first === undefined || second === undefined) throw new Error('fixture items')
    succeeded(
      await work.markTodoComplete({ ...input, operation: operationId('complete'), item: first.id }),
      'complete',
    )
    succeeded(
      await work.removeTodo({ ...input, operation: operationId('remove'), item: second.id }),
      'remove',
    )
    const seen = []
    let after: TodoPageCursor | null = null
    do {
      const page: TodoPage = succeeded(await work.listTodos({ ...input, after, limit: 2 }), 'page')
      expect(Object.isFrozen(page)).toBe(true)
      expect(Object.isFrozen(page.items)).toBe(true)
      expect(page.items.every(Object.isFrozen)).toBe(true)
      seen.push(...page.items)
      after = page.next
    } while (after !== null)
    expect(seen.map(item => item.text)).toEqual(['one', 'three', 'four', 'five'])
    expect(seen[0]?.status).toBe('completed')
    expect(new Set(seen.map(item => item.id)).size).toBe(4)
    const state = succeeded(await work.readWork(input), 'state')
    expect(state.run.kind).toBe('none')
    expect(state.tasks).toEqual([])
  })

  it('rejects malformed or foreign cursors and page bounds without returning a partial page', async () => {
    const h = await service()
    const work = h.faces('coordinator').work
    const input = h.access()
    const added = succeeded(
      await work.addTodo({ ...input, operation: operationId('one'), text: 'one' }),
      'add',
    )
    const page = succeeded(await work.listTodos({ ...input, after: null, limit: 1 }), 'page')
    const tenant = tenantCodec.encode(input.tenant)
    if (!tenant.ok) throw new Error('fixture tenant')
    const cursor: TodoPageCursor = {
      tenant: tenant.value,
      session: input.session,
      revision: page.revision,
      after: added.item.id,
    }
    for (const after of [
      { ...cursor, tenant: 'invalid' },
      { ...cursor, after: `todo_${'f'.repeat(64)}` },
      { ...cursor, session: sessionId('other') },
      { ...cursor, extra: true },
      { ...cursor, revision: '-1' },
      undefined,
    ]) {
      expect(
        await work.listTodos({ ...input, after: after as TodoPageCursor, limit: 1 }),
      ).toMatchObject({ failure: { kind: 'invalid', field: 'after' } })
    }
    for (const limit of [0, 101, 1.5, NaN, Infinity])
      expect(await work.listTodos({ ...input, after: null, limit })).toMatchObject({
        failure: { kind: 'invalid', field: 'limit' },
      })
    expect(await work.listTodos({ ...h.access('missing'), after: null, limit: 1 })).toMatchObject({
      failure: { kind: 'denied' },
    })
    expect(
      await work.listTodos({ ...input, principal: 'b:stranger', after: null, limit: 1 }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    h.checks.script({ kind: 'unavailable', diagnostic: 'offline' })
    expect(await work.listTodos({ ...input, after: null, limit: 1 })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })

  it('recalls an archived original before deciding current lifecycle', async () => {
    const h = await service()
    const work = h.faces('coordinator').work
    const input = { ...h.access(), operation: operationId('add'), text: 'one' }
    const added = succeeded(await work.addTodo(input), 'add')
    succeeded(
      await h.faces('maintainer').work.control({
        ...h.access(),
        operation: operationId('archive'),
        intent: { kind: 'archive' },
      }),
      'archive',
    )
    expect(succeeded(await work.addTodo(input), 'recall')).toEqual({
      ...added,
      receipt: { ...added.receipt, recovered: true },
    })
    expect(await work.addTodo({ ...input, operation: operationId('fresh') })).toMatchObject({
      failure: { kind: 'archived' },
    })
    expect(
      succeeded(await work.listTodos({ ...h.access(), after: null, limit: 100 }), 'archived list')
        .items,
    ).toHaveLength(1)
  })
})
