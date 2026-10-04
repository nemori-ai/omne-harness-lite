import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, test, vi } from 'vitest'
import {
  parseTenantId,
  parseOpaqueIdentifier,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
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
} from '@omne-harness-lite/runtime-context'
import {
  createRuntimeContext,
  createContextSessionInitializer,
  type ContextSessionSeed,
} from '../src/index.ts'
const tenant = parseTenantId({ organization: 'org', account: 'alice' }),
  session = parseOpaqueIdentifier('session', 'SessionRef')
if (!('ok' in tenant) || !('ok' in session)) throw new Error('fixture invalid')
const scope: SessionScope = { tenant: tenant.ok, session: session.ok }
const at = '2026-10-04T00:00:00Z'
const identityRegistration: ContextRegistration = {
  key: 'identity',
  source: 'session',
  config: null,
  consumers: ['model', 'tool', 'extension'],
  required: true,
  recovery: 'persisted',
}
const seed: ContextSessionSeed = {
  required: [identityRegistration],
  initial: [
    {
      key: 'identity',
      revision: 'initial',
      observedAt: at,
      value: { tenant: { ...scope.tenant }, session: scope.session },
    },
  ],
  fixed: [{ key: 'identity', value: { tenant: { ...scope.tenant }, session: scope.session } }],
}
function authority() {
  const bindings = new Map<SessionAccess, AccessIdentity>()
  const operations: SessionAccessOperations = {
    authorize: vi.fn<SessionAccessOperations['authorize']>(async (access, requested) => {
      const identity = bindings.get(access)
      return identity &&
        tenantIdEquals(requested.tenant, identity.scope.tenant) &&
        requested.session === identity.scope.session
        ? { kind: 'authorized', identity }
        : { kind: 'rejected', reason: 'notAuthorized' }
    }),
  }
  return {
    operations,
    bind(consumer: AccessIdentity['consumer'], keys: readonly string[]) {
      // Test authority oracle; product issuance is covered separately with real Cordis generations.
      const token = Object.freeze({}) as SessionAccess
      bindings.set(token, {
        binding: 'fixture',
        principal: 'fixture',
        principalKind: 'system',
        scope,
        consumer,
        contextKeys: keys,
      })
      return token
    },
    revoke(token: SessionAccess) {
      bindings.delete(token)
    },
  }
}
function source(
  name = 'session',
  recovery: ContextSource['recovery'] = 'persisted',
): ContextSource {
  return {
    name,
    recovery,
    consumers: ['model', 'tool', 'extension'],
    requiredKeys: name === 'session' ? ['identity'] : [],
    read: async () => ({ kind: 'values', values: [] }),
  }
}
async function host(now: Parameters<typeof createRuntimeContext>[0]['now'] = () => at) {
  const dir = await mkdtemp(join(tmpdir(), 'omne-context-')),
    log = await openJsonlSessionLog({
      dir,
      processOwnership: { current: 'context-tests', observeExit: async () => 'exited' },
    })
  const auth = authority(),
    initializer = createContextSessionInitializer(log)
  const observedLog = { ...log, readSince: vi.fn(log.readSince) }
  const owner = createRuntimeContext({ log: observedLog, access: auth.operations, now })
  const access = auth.bind('coordinator', ['identity', 'public', 'secret'])
  const publisher = auth.bind('source', ['identity', 'public', 'secret'])
  const tool = auth.bind('tool', ['identity', 'public', 'secret'])
  const disposeSource = owner.sources.registerSource(source())
  return {
    dir,
    log,
    observedLog,
    auth,
    initializer,
    owner,
    access,
    publisher,
    tool,
    disposeSource,
    async close() {
      owner.closeAdmission()
      await owner.drain()
      await initializer.drain()
      await log.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
async function init(h: Awaited<ReturnType<typeof host>>) {
  const result = await h.initializer.initializeContextSession(scope, seed)
  if (result.kind !== 'applied') throw new Error('init failed')
  return result.revision
}
async function reader(
  h: Awaited<ReturnType<typeof host>>,
  token = h.tool,
  consumer: ContextConsumer = 'tool',
) {
  const bound = await h.owner.operations.bind(token, scope, consumer)
  if (bound.kind !== 'bound') throw new Error('binding failed')
  return bound.reader
}

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
    h.disposeSource()
    expect(await api.remove(h.access, scope, 'identity', added.revision)).toMatchObject({
      reason: 'requiredRegistration',
    })
    expect(await read.read(['identity'])).toMatchObject({ reason: 'sourceUnavailable' })
    const removed = await api.remove(h.access, scope, 'public', added.revision)
    expect(removed.kind).toBe('applied')
    const restored = createRuntimeContext({ log: h.log, access: h.auth.operations, now: () => at })
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
      dispose()
      expect(await read.read(['public'])).toMatchObject({ reason: 'sourceUnavailable' })
      h.owner.sources.registerSource({
        ...source('live', recovery),
        requiredKeys: ['public'],
        read: readSource,
      })
      dispose() // stale disposer cannot remove a replacement generation
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
    const other = createContextSessionInitializer(h.log)
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
      [{ tenant: scope.tenant, readKeys: [], payload: { codec: 'runtime-context/2' } }],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    expect(await h.owner.operations.registrations(h.access, scope)).toMatchObject({
      reason: 'unavailable',
    })
    expect(
      await createContextSessionInitializer(h.log).initializeContextSession(scope, seed),
    ).toMatchObject({ reason: 'unavailable' })
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
  const initializer = createContextSessionInitializer({ ...h.log, append })
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
    const h = await host(() => {
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
