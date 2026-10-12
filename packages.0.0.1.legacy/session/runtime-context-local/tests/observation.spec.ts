import { expect, test, vi } from 'vitest'
import type { ContextCursor } from '@omne-harness-lite/runtime-context'
import { host, init, reader, scope, source, at, identityRegistration } from './fixture.ts'

async function publish(
  h: Awaited<ReturnType<typeof host>>,
  key: string,
  value: string,
  previous = 'absent',
) {
  const result = await h.owner.operations.update(h.publisher, scope, { key, value }, previous)
  if (result.kind !== 'applied') throw new Error(`publish failed: ${result.reason}`)
  return result.revision
}
async function add(h: Awaited<ReturnType<typeof host>>, key: string, previous: string) {
  const result = await h.owner.operations.register(
    h.access,
    scope,
    {
      ...identityRegistration,
      key,
      required: false,
      config: { credential: 'configuration-secret' },
    },
    previous,
  )
  if (result.kind !== 'applied') throw new Error(`register failed: ${result.reason}`)
  return result.revision
}

test('complete observation exposes only readable projections, independent of hidden config and management CAS', async () => {
  const h = await host()
  try {
    const initial = await init(h),
      registered = await add(h, 'public', initial)
    await publish(h, 'public', 'visible')
    const secret = await h.owner.operations.register(
      h.access,
      scope,
      {
        ...identityRegistration,
        key: 'secret',
        required: false,
        consumers: ['extension'],
        config: { secret: 'private-management' },
      },
      registered,
    )
    if (secret.kind !== 'applied') throw new Error('secret registration failed')
    const secretRevision = await publish(h, 'secret', 'private-payload')
    const r = await reader(h),
      snapshot = await r.snapshot()
    if (snapshot.kind !== 'snapshot') throw new Error('snapshot missing')
    expect(snapshot.snapshot.registrations).toEqual([
      { key: 'identity', required: true, recovery: 'persisted' },
      { key: 'public', required: false, recovery: 'persisted' },
    ])
    expect(snapshot.snapshot.values.map(value => value.key)).toEqual(['identity', 'public'])
    const serialized = JSON.stringify(snapshot.snapshot)
    for (const secret of [
      'configuration-secret',
      'private-management',
      'private-payload',
      'config',
      'consumers',
    ])
      expect(serialized).not.toContain(secret)
    expect(snapshot.snapshot.viewRevision).not.toBe(secret.revision)
    expect(Object.isFrozen(snapshot.snapshot.registrations[0])).toBe(true)
    await publish(h, 'secret', 'another-hidden-payload', secretRevision)
    expect(await r.changes(snapshot.snapshot.cursor)).toMatchObject({
      kind: 'changes',
      viewRevision: snapshot.snapshot.viewRevision,
      added: [],
      updated: [],
      removed: [],
    })
  } finally {
    await h.close()
  }
})

test('changes report registration/value additions, updates and removals; absent content is a failure', async () => {
  const h = await host()
  try {
    const initial = await init(h),
      r = await reader(h),
      first = await r.snapshot()
    if (first.kind !== 'snapshot') throw new Error('first snapshot missing')
    const registered = await add(h, 'public', initial)
    expect(await r.changes(first.snapshot.cursor)).toEqual({
      kind: 'rejected',
      reason: 'sourceUnavailable',
    })
    const revision = await publish(h, 'public', 'first')
    const added = await r.changes(first.snapshot.cursor)
    if (added.kind !== 'changes') throw new Error('delta missing')
    expect(added.added).toMatchObject([
      { registration: { key: 'public' }, value: { value: 'first' } },
    ])
    expect(added.updated).toEqual([])
    await publish(h, 'public', 'second', revision)
    const updated = await r.changes(added.cursor)
    if (updated.kind !== 'changes') throw new Error('updated delta missing')
    expect(updated.updated).toMatchObject([
      { registration: { key: 'public' }, value: { value: 'second' } },
    ])
    expect(updated.added).toEqual([])
    expect(await h.owner.operations.remove(h.access, scope, 'public', registered)).toHaveProperty(
      'kind',
      'applied',
    )
    const removed = await r.changes(updated.cursor)
    expect(removed).toMatchObject({ kind: 'changes', added: [], updated: [], removed: ['public'] })
    expect(await (await reader(h)).changes(first.snapshot.cursor)).toEqual({
      kind: 'resetRequired',
    })
    expect(await r.changes({} as ContextCursor)).toEqual({ kind: 'resetRequired' })
    h.auth.revoke(h.tool)
    expect(await r.changes(first.snapshot.cursor)).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
  } finally {
    await h.close()
  }
})

test('source withdrawal drains original reads, rejects late values, and resets old cursors after replacement', async () => {
  const h = await host(),
    entered = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>()
  try {
    const initial = await init(h)
    const old = h.owner.sources.registerSource({
      ...source('live', 'reread_source'),
      read: async () => {
        entered.resolve()
        await finish.promise
        return {
          kind: 'values',
          values: [{ key: 'public', revision: 'old', observedAt: at, value: 'old' }],
        }
      },
    })
    expect(
      await h.owner.operations.register(
        h.access,
        scope,
        {
          ...identityRegistration,
          key: 'public',
          source: 'live',
          required: false,
          recovery: 'reread_source',
        },
        initial,
      ),
    ).toHaveProperty('kind', 'applied')
    const r = await reader(h),
      pending = r.snapshot()
    await entered.promise
    let drained = false
    const disposal = old.dispose().then(() => {
      drained = true
    })
    await Promise.resolve()
    expect(drained).toBe(false)
    expect(await r.snapshot()).toMatchObject({ reason: 'sourceUnavailable' })
    const fresh = h.owner.sources.registerSource({
      ...source('live', 'reread_source'),
      read: async () => ({
        kind: 'values',
        values: [{ key: 'public', revision: 'fresh', observedAt: at, value: 'fresh' }],
      }),
    })
    expect(fresh.generation).not.toBe(old.generation)
    expect(await old.invalidate(scope, ['public'])).toMatchObject({ reason: 'sourceUnavailable' })
    finish.resolve()
    expect(await pending).toMatchObject({ reason: 'sourceUnavailable' })
    await disposal
    await old.dispose()
    const view = await r.snapshot()
    if (view.kind !== 'snapshot') throw new Error('replacement missing')
    expect(view.snapshot.values.find(value => value.key === 'public')?.value).toBe('fresh')
    await fresh.dispose()
    h.owner.sources.registerSource({
      ...source('live', 'reread_source'),
      read: async () => ({
        kind: 'values',
        values: [{ key: 'public', revision: 'fresh', observedAt: at, value: 'fresh' }],
      }),
    })
    expect(await r.changes(view.snapshot.cursor)).toEqual({ kind: 'resetRequired' })
  } finally {
    finish.resolve()
    await h.close()
  }
})

test.each(['invalidate', 'remove', 'revoke'] as const)(
  'a %s during source read cannot yield a mixed complete snapshot',
  async change => {
    const h = await host(),
      entered = Promise.withResolvers<void>(),
      finish = Promise.withResolvers<void>()
    try {
      const initial = await init(h)
      const handle = h.owner.sources.registerSource({
        ...source('live', 'recompute'),
        read: async () => {
          entered.resolve()
          await finish.promise
          return {
            kind: 'values',
            values: [{ key: 'public', revision: 'old', observedAt: at, value: 'old' }],
          }
        },
      })
      const registered = await h.owner.operations.register(
        h.access,
        scope,
        {
          ...identityRegistration,
          key: 'public',
          source: 'live',
          required: false,
          recovery: 'recompute',
        },
        initial,
      )
      if (registered.kind !== 'applied') throw new Error('registration missing')
      const pending = (await reader(h)).snapshot()
      await entered.promise
      if (change === 'invalidate') {
        expect(await handle.invalidate(scope, ['identity'])).toMatchObject({
          reason: 'invalidInput',
        })
        expect(await handle.invalidate(scope, ['public'])).toEqual({ kind: 'invalidated' })
      } else if (change === 'remove')
        expect(
          await h.owner.operations.remove(h.access, scope, 'public', registered.revision),
        ).toHaveProperty('kind', 'applied')
      else h.auth.revoke(h.tool)
      finish.resolve()
      expect(await pending).toEqual({
        kind: 'rejected',
        reason: change === 'revoke' ? 'notAuthorized' : 'viewChanged',
      })
    } finally {
      finish.resolve()
      await h.close()
    }
  },
)

test('changing the authorized key range resets the original cursor without exposing other reader data', async () => {
  const h = await host()
  try {
    await init(h)
    const r = await reader(h),
      first = await r.snapshot()
    if (first.kind !== 'snapshot') throw new Error('snapshot missing')
    h.auth.setKeys(h.tool, ['identity'])
    expect(await r.changes(first.snapshot.cursor)).toEqual({ kind: 'resetRequired' })
    expect(await r.snapshot()).toMatchObject({
      kind: 'snapshot',
      snapshot: { registrations: [{ key: 'identity' }] },
    })
  } finally {
    await h.close()
  }
})

test('registration admitted during the final authority wait invalidates the complete view, even before content publication', async () => {
  const h = await host(),
    entered = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>()
  try {
    const initial = await init(h),
      r = await reader(h)
    const authorize = vi.mocked(h.auth.operations.authorize),
      original = authorize.getMockImplementation()
    if (!original) throw new Error('authority fixture missing')
    let reads = 0
    authorize.mockImplementation(async (...args) => {
      if (args[0] === h.tool && args[2] === 'context.read' && ++reads === 2) {
        entered.resolve()
        await finish.promise
      }
      return original(...args)
    })
    const pending = r.snapshot()
    await entered.promise
    await add(h, 'public', initial)
    finish.resolve()
    expect(await pending).toEqual({ kind: 'rejected', reason: 'viewChanged' })
  } finally {
    finish.resolve()
    await h.close()
  }
})

test('two keys sharing a source cannot adopt different generations into one successful view', async () => {
  const h = await host(),
    entered = Promise.withResolvers<void>(),
    resume = Promise.withResolvers<void>()
  const metadata = source('shared', 'reread_source')
  const old = h.owner.sources.registerSource({
    ...metadata,
    async read() {
      entered.resolve()
      await resume.promise
      return {
        kind: 'values',
        values: [{ key: 'public', revision: 'old', observedAt: at, value: 'old-generation' }],
      }
    },
  })
  try {
    let revision = await init(h)
    for (const key of ['public', 'secret']) {
      const result = await h.owner.operations.register(
        h.access,
        scope,
        {
          key,
          source: 'shared',
          config: null,
          consumers: ['tool'],
          required: false,
          recovery: 'reread_source',
        },
        revision,
      )
      if (result.kind !== 'applied') throw new Error('registration fixture failed')
      revision = result.revision
    }
    h.auth.setKeys(h.tool, ['public', 'secret'])
    const r = await reader(h),
      observing = r.snapshot()
    await entered.promise
    const draining = old.dispose()
    h.owner.sources.registerSource({
      ...metadata,
      async read() {
        return {
          kind: 'values',
          values: [{ key: 'secret', revision: 'new', observedAt: at, value: 'new-generation' }],
        }
      },
    })
    resume.resolve()
    expect(await observing).toEqual({ kind: 'rejected', reason: 'sourceUnavailable' })
    await draining
  } finally {
    resume.resolve()
    await h.close()
  }
})
