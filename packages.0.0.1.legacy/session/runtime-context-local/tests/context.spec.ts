import { factLogPayload } from '@omne-harness-lite/session-log'
import { expect, test, vi } from 'vitest'
import {
  parseTenantId,
  parseOpaqueIdentifier,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import type { SessionLog } from '@omne-harness-lite/session-log'
import type {
  AccessIdentity,
  SessionAccess,
  SessionAccessOperations,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'
import type {
  ContextConsumer,
  ContextRegistration,
  ContextSource,
  ContextSessionSeed,
} from '@omne-harness-lite/runtime-context'
import { createRuntimeContext } from '../src/index.ts'
import { scope, at, identityRegistration, seed, source, host, init, reader } from './fixture.ts'

test('independent registration/content revisions, immutable data, required identities and persistent removal', async () => {
  const h = await host()
  try {
    const initial = await init(h),
      api = h.owner.operations,
      read = await reader(h)
    const added = await api.register(
      h.access,
      scope,
      { ...identityRegistration, key: 'public', required: false },
      initial,
    )
    expect(added.kind).toBe('applied')
    if (added.kind !== 'applied') throw new Error('registration failed')
    const value = { text: 'first' }
    const updated = await api.update(h.publisher, scope, { key: 'public', value }, 'absent')
    expect(updated.kind).toBe('applied')
    value.text = 'caller changed'
    expect(await api.registrations(h.access, scope)).toHaveProperty('revision', added.revision)
    const result = await read.read(['public'])
    expect(result).toMatchObject({ kind: 'values', values: [{ value: { text: 'first' } }] })
    if (result.kind === 'values') expect(Object.isFrozen(result.values[0]?.value)).toBe(true)
    expect(
      await api.update(h.tool, scope, { key: 'public', value: 'bad producer' }, 'absent'),
    ).toMatchObject({ reason: 'notAuthorized' })
    expect(
      await api.update(
        h.publisher,
        scope,
        { key: 'identity', value: { tenant: 'forged' } },
        'initial',
      ),
    ).toMatchObject({ reason: 'invalidInput' })
    await h.disposeSource.dispose()
    expect(await api.remove(h.access, scope, 'identity', added.revision)).toMatchObject({
      reason: 'requiredRegistration',
    })
    expect(await read.read(['identity'])).toMatchObject({ reason: 'sourceUnavailable' })
    const removed = await api.remove(h.access, scope, 'public', added.revision)
    expect(removed.kind).toBe('applied')
    const restored = createRuntimeContext({
      storage: h.storage,
      log: h.log,
      access: h.auth.operations,
      now: async () => at,
    })
    restored.sources.registerSource(source())
    const entries = await restored.operations.registrations(h.access, scope)
    expect(entries).toMatchObject({ entries: [{ key: 'identity' }] })
    expect(await h.initializer.initializeContextSession(scope, seed)).toEqual({
      kind: 'applied',
      revision: initial,
    })
    restored.closeAdmission()
    await restored.drain()
  } finally {
    await h.close()
  }
})

test('authorization precedes existence and is repeated through a retained reader', async () => {
  const h = await host()
  try {
    const initial = await init(h),
      read = await reader(h)
    expect(await h.owner.operations.bind(h.tool, scope, 'extension')).toMatchObject({
      reason: 'notAuthorized',
    })
    const logRead = h.observedLog.readSince
    logRead.mockClear()
    h.auth.revoke(h.tool)
    expect(await read.read(['identity'])).toMatchObject({ reason: 'notAuthorized' })
    expect(await read.read(['does-not-exist'])).toMatchObject({ reason: 'notAuthorized' })
    expect(logRead).not.toHaveBeenCalled()
    const added = await h.owner.operations.register(
      h.access,
      scope,
      { ...identityRegistration, key: 'secret', required: false, consumers: ['extension'] },
      initial,
    )
    expect(added.kind).toBe('applied')
    const model = await reader(h, h.auth.bind('model', ['identity', 'secret']), 'model')
    expect(await model.read(['identity', 'secret'])).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
  } finally {
    await h.close()
  }
})

for (const recovery of ['reread_source', 'recompute'] as const)
  test(`${recovery} reads the current source and never reuses stale values`, async () => {
    const h = await host()
    try {
      const initial = await init(h)
      let revision = 0
      const readSource = vi.fn<ContextSource['read']>(async () => ({
        kind: 'values',
        values: [{ key: 'public', revision: String(++revision), observedAt: at, value: revision }],
      }))
      const dispose = h.owner.sources.registerSource({
        ...source('live', recovery),
        read: readSource,
      })
      expect(
        await h.owner.operations.register(
          h.access,
          scope,
          { ...identityRegistration, key: 'public', source: 'live', required: false, recovery },
          initial,
        ),
      ).toHaveProperty('kind', 'applied')
      const read = await reader(h)
      expect(await read.read(['public'])).toMatchObject({ values: [{ value: 1 }] })
      expect(await read.read(['public'])).toMatchObject({ values: [{ value: 2 }] })
      readSource.mockResolvedValue({ kind: 'values', values: [] })
      expect(await read.read(['public'])).toMatchObject({ reason: 'sourceUnavailable' })
      await dispose.dispose()
      expect(await read.read(['public'])).toMatchObject({ reason: 'sourceUnavailable' })
      h.owner.sources.registerSource({
        ...source('live', recovery),
        requiredKeys: ['public'],
        read: readSource,
      })
      await dispose.dispose() // stale disposer cannot remove a replacement generation
      expect(await read.read(['public'])).toMatchObject({ reason: 'sourceUnavailable' })
      expect(await h.owner.operations.registrations(h.access, scope)).toMatchObject({
        entries: [{ key: 'identity' }, { key: 'public', required: false }],
      })
    } finally {
      await h.close()
    }
  })

test('concurrent incompatible initialization writes only one policy; unknown versions are not absent', async () => {
  const h = await host()
  try {
    const alternative: ContextSessionSeed = { required: [], initial: [], fixed: [] }
    const other = h.initializer
    const values = await Promise.all([
      h.initializer.initializeContextSession(scope, seed),
      other.initializeContextSession(scope, alternative),
    ])
    expect(values.filter(value => value.kind === 'applied')).toHaveLength(1)
    const winner = values[0]?.kind === 'applied' ? seed : alternative
    expect(
      await h.initializer.initializeContextSession(scope, winner === seed ? alternative : seed),
    ).toMatchObject({ reason: 'revisionConflict' })
    await h.log.append(
      scope.session,
      [
        {
          tenant: scope.tenant,
          readKeys: [],
          payload: factLogPayload('runtime-context', '2', { codec: 'runtime-context/2' }),
        },
      ],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    expect(await h.owner.operations.registrations(h.access, scope)).toMatchObject({
      reason: 'unavailable',
    })
    expect(await h.initializer.initializeContextSession(scope, seed)).toMatchObject({
      reason: 'unavailable',
    })
    await other.drain()
  } finally {
    await h.close()
  }
})

test('unknown receipt retains the original initialization and blocks a second decision until it is found', async () => {
  const h = await host(),
    gate = Promise.withResolvers<void>()
  let physical: Promise<unknown> | undefined
  const append = vi.fn<SessionLog['append']>(async (...args) => {
    physical = gate.promise.then(() => h.log.append(...args))
    return { failure: 'unavailable' }
  })
  const testOwner = createRuntimeContext({
    log: { ...h.log, append },
    storage: h.storage,
    access: h.auth.operations,
    now: async () => at,
  })
  const initializer = { ...testOwner.initializer, drain: testOwner.drain }
  try {
    expect(await initializer.initializeContextSession(scope, seed)).toMatchObject({
      reason: 'unavailable',
    })
    expect(
      await initializer.initializeContextSession(scope, { required: [], initial: [], fixed: [] }),
    ).toMatchObject({ reason: 'unavailable' })
    expect(append).toHaveBeenCalledOnce()
    await expect(initializer.drain()).rejects.toThrow('unresolved writes')
    gate.resolve()
    await physical
    expect(await initializer.initializeContextSession(scope, seed)).toHaveProperty(
      'kind',
      'applied',
    )
    expect(append).toHaveBeenCalledOnce()
    await initializer.drain()
  } finally {
    gate.resolve()
    await physical
    await h.close()
  }
})

test.each(['unavailable', 'throws', 'malformed'] as const)(
  'clock %s does not persist a fabricated observation time',
  async failure => {
    const h = await host(async () => {
      if (failure === 'throws') throw new Error('clock unavailable')
      return failure === 'malformed' ? '2026-02-30T00:00:00Z' : { unavailable: true }
    })
    try {
      const initial = await init(h)
      expect(
        await h.owner.operations.register(
          h.access,
          scope,
          { ...identityRegistration, key: 'public', required: false },
          initial,
        ),
      ).toHaveProperty('kind', 'applied')
      const before = await h.log.readSince(scope.session, 0)
      expect(
        await h.owner.operations.update(
          h.publisher,
          scope,
          { key: 'public', value: 'value' },
          'absent',
        ),
      ).toEqual({ kind: 'rejected', reason: 'unavailable' })
      expect(await h.log.readSince(scope.session, 0)).toEqual(before)
    } finally {
      await h.close()
    }
  },
)

test.each(['ownerStopped', 'sourceUnavailable'] as const)(
  'publication refuses %s after waiting for its observation time',
  async reason => {
    const entered = Promise.withResolvers<void>()
    const clock = Promise.withResolvers<string>()
    let waiting = false
    const h = await host(async () => {
      if (!waiting) return at
      entered.resolve()
      return clock.promise
    })
    try {
      const initial = await init(h)
      expect(
        await h.owner.operations.register(
          h.access,
          scope,
          { ...identityRegistration, key: 'public', required: false },
          initial,
        ),
      ).toHaveProperty('kind', 'applied')
      const before = await h.log.readSince(scope.session, 0)
      waiting = true
      const updating = h.owner.operations.update(
        h.publisher,
        scope,
        { key: 'public', value: 'stale publication' },
        'absent',
      )
      await entered.promise
      if (reason === 'ownerStopped') h.owner.closeAdmission()
      else {
        await h.disposeSource.dispose()
        h.owner.sources.registerSource(source())
      }
      clock.resolve(at)
      expect(await updating).toEqual({ kind: 'rejected', reason })
      expect(await h.log.readSince(scope.session, 0)).toEqual(before)
    } finally {
      clock.resolve(at)
      await h.close()
    }
  },
)

test('removing one session registration leaves the shared source and the other session intact', async () => {
  const h = await host()
  const otherScope = {
    ...scope,
    session: parseOpaqueIdentifier('other-session', 'SessionRef'),
  }
  if (!('ok' in otherScope.session)) throw new Error('other session invalid')
  const secondScope = { ...scope, session: otherScope.session.ok }
  const secondSeed: ContextSessionSeed = {
    ...seed,
    initial: [
      {
        key: 'identity',
        revision: 'initial',
        observedAt: at,
        value: { tenant: { ...secondScope.tenant }, session: secondScope.session },
      },
    ],
    fixed: [
      {
        key: 'identity',
        value: { tenant: { ...secondScope.tenant }, session: secondScope.session },
      },
    ],
  }
  try {
    const firstInitial = await init(h)
    const secondInitial = await h.initializer.initializeContextSession(secondScope, secondSeed)
    if (secondInitial.kind !== 'applied') throw new Error('second initialization failed')
    const secondControl = h.auth.bind('coordinator', ['identity', 'public'], secondScope)
    const secondPublisher = h.auth.bind('source', ['public'], secondScope)
    const secondTool = h.auth.bind('tool', ['public'], secondScope)
    const sharedRead = vi.fn<ContextSource['read']>(async () => ({ kind: 'values', values: [] }))
    const dispose = h.owner.sources.registerSource({ ...source('shared'), read: sharedRead })
    const registration = {
      ...identityRegistration,
      key: 'public',
      source: 'shared',
      required: false,
    }
    const firstRegistered = await h.owner.operations.register(
      h.access,
      scope,
      registration,
      firstInitial,
    )
    const secondRegistered = await h.owner.operations.register(
      secondControl,
      secondScope,
      registration,
      secondInitial.revision,
    )
    if (firstRegistered.kind !== 'applied' || secondRegistered.kind !== 'applied')
      throw new Error('shared registration failed')
    expect(
      await h.owner.operations.update(
        h.publisher,
        scope,
        { key: 'public', value: 'first' },
        'absent',
      ),
    ).toHaveProperty('kind', 'applied')
    expect(
      await h.owner.operations.update(
        secondPublisher,
        secondScope,
        { key: 'public', value: 'second' },
        'absent',
      ),
    ).toHaveProperty('kind', 'applied')
    const secondBinding = await h.owner.operations.bind(secondTool, secondScope, 'tool')
    if (secondBinding.kind !== 'bound') throw new Error('second binding failed')
    expect(
      await h.owner.operations.remove(h.access, scope, 'public', firstRegistered.revision),
    ).toHaveProperty('kind', 'applied')
    expect(await (await reader(h)).read(['public'])).toMatchObject({
      reason: 'missingRegistration',
    })
    expect(await secondBinding.reader.read(['public'])).toMatchObject({
      values: [{ value: 'second' }],
    })
    expect(await h.owner.operations.bind(h.tool, secondScope, 'tool')).toMatchObject({
      reason: 'notAuthorized',
    })
    await dispose.dispose()
    expect(await secondBinding.reader.read(['public'])).toMatchObject({
      reason: 'sourceUnavailable',
    })
    expect(await h.owner.operations.registrations(secondControl, secondScope)).toMatchObject({
      revision: secondRegistered.revision,
      entries: [{ key: 'identity' }, { key: 'public' }],
    })
    h.owner.sources.registerSource(source('shared'))
    expect(await secondBinding.reader.read(['public'])).toMatchObject({
      values: [{ value: 'second' }],
    })
    expect(sharedRead).not.toHaveBeenCalled()
  } finally {
    await h.close()
  }
})

test('model, tool and extension reads intersect binding, registration and source declarations', async () => {
  const h = await host()
  try {
    const initial = await init(h)
    h.owner.sources.registerSource({ ...source('limited'), consumers: ['tool', 'extension'] })
    expect(
      await h.owner.operations.register(
        h.access,
        scope,
        {
          ...identityRegistration,
          key: 'secret',
          source: 'limited',
          required: false,
          consumers: ['model'],
        },
        initial,
      ),
    ).toMatchObject({ reason: 'sourceUnavailable' })
    expect(
      await h.owner.operations.register(
        h.access,
        scope,
        {
          ...identityRegistration,
          key: 'secret',
          source: 'limited',
          required: false,
          consumers: ['tool', 'extension'],
        },
        initial,
      ),
    ).toHaveProperty('kind', 'applied')
    expect(
      await h.owner.operations.update(
        h.publisher,
        scope,
        { key: 'secret', value: 'tool and extension' },
        'absent',
      ),
    ).toHaveProperty('kind', 'applied')
    for (const consumer of ['tool', 'extension'] as const) {
      const read = await reader(h, h.auth.bind(consumer, ['identity', 'secret']), consumer)
      expect(await read.read(['secret'])).toMatchObject({
        values: [{ value: 'tool and extension' }],
      })
    }
    const model = await reader(h, h.auth.bind('model', ['identity', 'secret']), 'model')
    expect(await model.read(['identity', 'secret'])).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(await model.read(['identity'])).toMatchObject({ values: [{ key: 'identity' }] })
    const narrow = await reader(h, h.auth.bind('tool', ['identity']))
    expect(await narrow.read(['secret'])).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
  } finally {
    await h.close()
  }
})

test('a required downgrade and a live function value cannot change the durable registration or content', async () => {
  const h = await host()
  try {
    const revision = await init(h)
    const before = await h.log.readSince(scope.session, 0)
    expect(
      await h.owner.operations.register(
        h.access,
        scope,
        { ...identityRegistration, required: false },
        revision,
      ),
    ).toMatchObject({ reason: 'revisionConflict' })
    expect(await h.owner.operations.remove(h.access, scope, 'identity', revision)).toMatchObject({
      reason: 'requiredRegistration',
    })
    expect(
      await h.owner.operations.update(
        h.publisher,
        scope,
        // @ts-expect-error Negative runtime input: a live function is not a JSON context value.
        { key: 'identity', value: () => 'live' },
        'initial',
      ),
    ).toMatchObject({ reason: 'invalidInput' })
    expect(await h.log.readSince(scope.session, 0)).toEqual(before)
    expect(await h.owner.operations.registrations(h.access, scope)).toMatchObject({
      entries: [{ key: 'identity', required: true }],
    })
  } finally {
    await h.close()
  }
})

for (const recovery of ['persisted', 'reread_source', 'recompute'] as const)
  test(`${recovery} uses its declared recovery rule after physical log close and reopen`, async () => {
    const h = await host()
    let recoveredLog: Awaited<ReturnType<typeof openSqlLogFixture>> | undefined
    let recoveredOwner: ReturnType<typeof createRuntimeContext> | undefined
    try {
      const initial = await init(h)
      const firstSourceRead = vi.fn<ContextSource['read']>(async () => ({
        kind: 'values',
        values: [{ key: 'public', revision: 'old', value: 11, observedAt: at }],
      }))
      h.owner.sources.registerSource({ ...source('recover', recovery), read: firstSourceRead })
      expect(
        await h.owner.operations.register(
          h.access,
          scope,
          {
            ...identityRegistration,
            key: 'public',
            source: 'recover',
            required: false,
            recovery,
          },
          initial,
        ),
      ).toHaveProperty('kind', 'applied')
      if (recovery === 'persisted')
        expect(
          await h.owner.operations.update(
            h.publisher,
            scope,
            { key: 'public', value: 11 },
            'absent',
          ),
        ).toHaveProperty('kind', 'applied')
      expect(await (await reader(h)).read(['public'])).toMatchObject({ values: [{ value: 11 }] })
      h.owner.closeAdmission()
      await h.owner.drain()
      await h.initializer.drain()
      await h.log.close()
      recoveredLog = await openSqlLogFixture({ dir: h.dir })
      recoveredOwner = createRuntimeContext({
        log: recoveredLog,
        storage: h.storage,
        access: h.auth.operations,
        now: async () => at,
      })
      recoveredOwner.sources.registerSource(source())
      const binding = await recoveredOwner.operations.bind(h.tool, scope, 'tool')
      if (binding.kind !== 'bound') throw new Error('recovered reader failed')
      expect(await binding.reader.read(['public'])).toMatchObject({ reason: 'sourceUnavailable' })
      const freshSourceRead = vi.fn<ContextSource['read']>(async () => ({
        kind: 'values',
        values: [{ key: 'public', revision: 'fresh', value: 77, observedAt: at }],
      }))
      recoveredOwner.sources.registerSource({
        ...source('recover', recovery),
        read: freshSourceRead,
      })
      expect(await binding.reader.read(['public'])).toMatchObject({
        values: [{ value: recovery === 'persisted' ? 11 : 77 }],
      })
      if (recovery === 'persisted') {
        expect(firstSourceRead).not.toHaveBeenCalled()
        expect(freshSourceRead).not.toHaveBeenCalled()
      } else {
        expect(firstSourceRead).toHaveBeenCalledOnce()
        expect(freshSourceRead).toHaveBeenCalledOnce()
      }
    } finally {
      recoveredOwner?.closeAdmission()
      await recoveredOwner?.drain()
      await recoveredLog?.close()
      await h.close()
    }
  })
