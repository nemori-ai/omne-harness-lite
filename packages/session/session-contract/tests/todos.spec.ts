import { describe, expect, it } from 'vitest'
import {
  decide,
  deriveSessionOperation,
  openWork,
  reduce,
  type HistoryEntry,
  type SessionRevision,
} from '@omne-harness/session-contract'
import { evidence, operationId, succeeded } from '@omne-harness/session-contract/testing'
import { encodeEntry, type SessionEntry } from '../src/entries.ts'
import { scene } from './scene.ts'

describe('Session Todo facts', () => {
  it('keeps a completed receipt after removal and refuses a new completion of its tombstone', async () => {
    const s = scene()
    await s.create()
    const added = succeeded(
      await s.commit({
        kind: 'addTodo',
        input: { ...s.base, operation: operationId('add'), text: '  原文\n' },
      }),
      'add',
    )
    expect(added.item).toMatchObject({ text: '  原文\n', status: 'pending' })
    const command = {
      kind: 'markTodoComplete',
      input: { ...s.base, operation: operationId('complete'), item: added.item.id },
    } as const
    const completed = succeeded(await s.commit(command), 'complete')
    succeeded(
      await s.commit({
        kind: 'removeTodo',
        input: { ...s.base, operation: operationId('remove'), item: added.item.id },
      }),
      'remove',
    )
    const recalled = succeeded(await s.commit(command), 'recall')
    expect(recalled).toEqual({ ...completed, receipt: { ...completed.receipt, recovered: true } })
    expect((await s.read()).todos).toEqual([{ ...added.item, status: 'removed', changedAt: '4' }])
    expect(
      await s.commit({
        ...command,
        input: { ...command.input, operation: operationId('new-complete') },
      }),
    ).toEqual({ failure: { kind: 'todo-not-found', item: added.item.id } })
  })

  it('binds one original call to one intent regardless of text or command', async () => {
    const s = scene()
    await s.create()
    const operation = deriveSessionOperation({
      kind: 'todo-tool-call',
      tenant: 'tenant',
      session: s.base.session,
      call: 'call',
    })
    const added = succeeded(
      await s.commit({ kind: 'addTodo', input: { ...s.base, operation, text: 'one' } }),
      'add',
    )
    expect(
      await s.commit({ kind: 'addTodo', input: { ...s.base, operation, text: 'two' } }),
    ).toEqual({ failure: { kind: 'conflict', operation } })
    expect(
      await s.commit({ kind: 'removeTodo', input: { ...s.base, operation, item: added.item.id } }),
    ).toEqual({ failure: { kind: 'conflict', operation } })
    expect((await s.read()).revision).toBe(added.receipt.revision)
  })

  it('derives one original call identity even when an untyped caller carries command or text fields', async () => {
    const s = scene()
    await s.create()
    const stable = {
      kind: 'todo-tool-call',
      tenant: 'tenant',
      session: s.base.session,
      call: 'same-call',
    } as const
    const first = { ...stable, command: 'addTodo', text: 'one' }
    const retry = { ...stable, command: 'removeTodo', text: 'two' }
    const operation = deriveSessionOperation(first)
    succeeded(
      await s.commit({ kind: 'addTodo', input: { ...s.base, operation, text: 'one' } }),
      'add',
    )
    expect(deriveSessionOperation(retry)).toBe(operation)
    expect(
      await s.commit({
        kind: 'addTodo',
        input: { ...s.base, operation: deriveSessionOperation(retry), text: 'two' },
      }),
    ).toEqual({ failure: { kind: 'conflict', operation } })
  })

  it('preserves original results after archive, refuses fresh writes and never creates open work', async () => {
    const s = scene()
    await s.create()
    const command = {
      kind: 'addTodo',
      input: { ...s.base, operation: operationId('same-text'), text: 'same' },
    } as const
    const added = succeeded(await s.commit(command), 'add')
    const other = succeeded(
      await s.commit({
        ...command,
        input: { ...command.input, operation: operationId('another-call') },
      }),
      'another',
    )
    expect(other.item.id).not.toBe(added.item.id)
    const before = await s.read()
    expect(openWork(before)).toEqual(openWork({ ...before, todos: [] }))
    expect(before.run.kind).toBe('none')
    await s.control('archive')
    expect(succeeded(await s.commit(command), 'recovered').receipt.recovered).toBe(true)
    expect(
      await s.commit({ ...command, input: { ...command.input, operation: operationId('fresh') } }),
    ).toEqual({ failure: { kind: 'archived' } })
  })

  it('enforces byte and blank bounds without changing the original text', async () => {
    const s = scene()
    await s.create()
    for (const text of ['', ' \n\t', '界'.repeat(1366), 'x'.repeat(4097)]) {
      expect(
        await s.commit({
          kind: 'addTodo',
          input: { ...s.base, operation: operationId(`invalid-${text.length}`), text },
        }),
      ).toMatchObject({ failure: { kind: 'invalid', field: 'text' } })
    }
    const edge = '界'.repeat(1365) + ' '
    const added = succeeded(
      await s.commit({
        kind: 'addTodo',
        input: { ...s.base, operation: operationId('edge'), text: edge },
      }),
      'edge',
    )
    expect(added.item.text).toBe(edge)
    const before = await s.read()
    const command = {
      kind: 'addTodo',
      input: { ...s.base, operation: operationId('write'), text: 'new' },
    } as const
    expect(
      decide({ ...before, lifecycle: 'initializing' }, command, [], null, { compaction: null }),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'not-ready' } })
    succeeded(
      await s.commit({
        kind: 'freeze',
        input: {
          ...s.base,
          operation: operationId('freeze'),
          verdict: { cause: 'tool-shape-lost', evidence: evidence('frozen') },
        },
      }),
      'freeze',
    )
    expect(await s.commit(command)).toMatchObject({ failure: { kind: 'frozen' } })
  })

  it('quarantines duplicate ids, bad text, missing targets and resurrection in replay', async () => {
    const s = scene()
    await s.create()
    const added = succeeded(
      await s.commit({
        kind: 'addTodo',
        input: { ...s.base, operation: operationId('add'), text: 'one' },
      }),
      'add',
    )
    const before = await s.read()
    const replay = (entry: SessionEntry, snapshot = before) => {
      const revision = String(BigInt(snapshot.revision) + 1n) as SessionRevision
      const row: HistoryEntry = {
        ...encodeEntry(entry, { owner: 'session', via: 'direct', source: evidence('replay') }),
        id: '999' as HistoryEntry['id'],
        revision,
      }
      return reduce(snapshot, { revision, entries: [row] })
    }
    expect(replay({ kind: 'session.todo-added', item: added.item.id, text: 'again' }).kind).toBe(
      'quarantined',
    )
    const missing = `todo_${'f'.repeat(64)}` as typeof added.item.id
    expect(replay({ kind: 'session.todo-completed', item: missing }).kind).toBe('quarantined')
    expect(replay({ kind: 'session.todo-removed', item: missing }).kind).toBe('quarantined')
    expect(replay({ kind: 'session.todo-added', item: missing, text: ' ' }).kind).toBe(
      'quarantined',
    )
    succeeded(
      await s.commit({
        kind: 'markTodoComplete',
        input: { ...s.base, operation: operationId('complete'), item: added.item.id },
      }),
      'complete',
    )
    succeeded(
      await s.commit({
        kind: 'markTodoComplete',
        input: { ...s.base, operation: operationId('complete-again'), item: added.item.id },
      }),
      'repeat complete',
    )
    succeeded(
      await s.commit({
        kind: 'removeTodo',
        input: { ...s.base, operation: operationId('remove'), item: added.item.id },
      }),
      'remove',
    )
    const removed = await s.read()
    expect(replay({ kind: 'session.todo-completed', item: added.item.id }, removed).kind).toBe(
      'quarantined',
    )
    expect(
      replay({ kind: 'session.todo-added', item: added.item.id, text: 'resurrect' }, removed).kind,
    ).toBe('quarantined')
  })
})
