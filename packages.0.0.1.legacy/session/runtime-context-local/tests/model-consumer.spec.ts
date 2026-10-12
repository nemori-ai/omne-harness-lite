import { expect, test } from 'vitest'
import type { ContextCursor, ContextSnapshotReader } from '@omne-harness-lite/runtime-context'
import { host, init, reader, scope, seed } from './fixture.ts'

/** Controlled upper policy for the public seam. This is not an Agent Runtime implementation. */
function modelConsumer(context: ContextSnapshotReader) {
  let running = false,
    cursor: ContextCursor | undefined
  async function full() {
    const result = await context.snapshot()
    if (result.kind !== 'snapshot') return result
    cursor = result.snapshot.cursor
    return { kind: 'reminder', form: 'full', values: result.snapshot.values } as const
  }
  return {
    async attempt() {
      running = true
      return full()
    },
    endRun() {
      running = false
    },
    compressed() {
      cursor = undefined
    },
    async poll() {
      if (!running) return null
      if (!cursor) return full()
      const result = await context.changes(cursor)
      if (result.kind === 'resetRequired') return full()
      if (result.kind !== 'changes') return result
      cursor = result.cursor
      if (!result.added.length && !result.updated.length && !result.removed.length) return null
      return {
        kind: 'reminder',
        form: 'delta',
        added: result.added,
        updated: result.updated,
        removed: result.removed,
      } as const
    },
  }
}

test('real persisted context supports full attempt input, visible deltas, compression reset and updates while Run is closed', async () => {
  const h = await host()
  try {
    const initial = await init(h)
    const publicRegistration = await h.owner.operations.register(
      h.access,
      scope,
      { ...seed.required[0]!, key: 'public', required: false },
      initial,
    )
    expect(publicRegistration.kind).toBe('applied')
    const first = await h.owner.operations.update(
      h.publisher,
      scope,
      { key: 'public', value: 'one' },
      'absent',
    )
    if (first.kind !== 'applied') throw new Error('fixture publish failed')
    const consumer = modelConsumer(
      await reader(h, h.auth.bind('model', ['identity', 'public']), 'model'),
    )
    const full = await consumer.attempt()
    expect(full).toMatchObject({
      kind: 'reminder',
      form: 'full',
      values: [{ key: 'identity' }, { key: 'public', value: 'one' }],
    })
    expect(await consumer.poll()).toBeNull()
    expect(
      await h.log.append(
        scope.session,
        [{ tenant: scope.tenant, readKeys: [], payload: { kind: 'attempt_bookkeeping' } }],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      ),
    ).not.toHaveProperty('failure')
    expect(await consumer.poll()).toBeNull()
    consumer.compressed()
    expect(await consumer.poll()).toEqual(full)
    consumer.endRun()
    const second = await h.owner.operations.update(
      h.publisher,
      scope,
      { key: 'public', value: 'two' },
      first.revision,
    )
    if (second.kind !== 'applied') throw new Error('fixture second publish failed')
    expect(await consumer.poll()).toBeNull()
    expect(await consumer.attempt()).toMatchObject({
      form: 'full',
      values: [{ key: 'identity' }, { key: 'public', value: 'two' }],
    })
    expect(
      await h.owner.operations.update(
        h.publisher,
        scope,
        { key: 'public', value: 'three' },
        second.revision,
      ),
    ).toHaveProperty('kind', 'applied')
    expect(await consumer.poll()).toMatchObject({
      form: 'delta',
      added: [],
      removed: [],
      updated: [{ value: { key: 'public', value: 'three' } }],
    })
    expect(await consumer.poll()).toBeNull()
    expect(await consumer.attempt()).toMatchObject({
      form: 'full',
      values: [{ key: 'identity' }, { key: 'public', value: 'three' }],
    })
  } finally {
    await h.close()
  }
})
