import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Context, Fiber } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { LOGINS_SERVICE } from '@omne-harness-lite/account-identity/cordis'
import type { LoginsService } from '@omne-harness-lite/account-identity'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import { seedHoldingTenant } from '@omne-harness-lite/session-tenancy-table/seed'
import { createAcceptanceApplication, type ToolSessionBinding } from '../src/bootstrap.ts'
import { sessionIdentitySource } from '../src/session-context-source.ts'
import type { AcceptanceConfig, AcceptanceHooks } from '../src/types.ts'
import { actor, deployment, latch } from './support.ts'

async function configuration(label: string): Promise<AcceptanceConfig> {
  const config = await deployment(label)
  const dir = join(dirname(config.databaseFile), 'logs')
  await mkdir(dir, { mode: 0o700 })
  return {
    ...config,
    sessionLog: {
      dir,
      policy: { appendQueueLimit: 8, residentLogsLimit: 16 },
      processOwnership: { current: label, observeExit: async () => 'unknown' },
    },
  }
}
function open(config: AcceptanceConfig) {
  let ctx: Context | undefined, source: Fiber | undefined, storage: AtomicStorage | undefined
  const hooks: AcceptanceHooks = {
    storageOpened(value) {
      storage = value
    },
    async fiberCreated(name, fiber) {
      if (name === 'runtimeContext') {
        await fiber
        ctx = fiber.ctx
      }
      if (name === 'sessionContextSource') source = fiber
    },
  }
  const app = createAcceptanceApplication(config, {
    stage: 'sessionLog',
    diagnostics: { record() {} },
    hooks,
  })
  return {
    app,
    get ctx() {
      if (!ctx) throw new Error('context absent')
      return ctx
    },
    get source() {
      if (!source) throw new Error('source absent')
      return source
    },
    get storage() {
      if (!storage) throw new Error('storage absent')
      return storage
    },
  }
}
function bound(value: ToolSessionBinding) {
  if (value.kind !== 'bound') throw new Error(`binding failed: ${value.reason}`)
  return value
}
async function read(ctx: Context, binding: ReturnType<typeof bound>) {
  const reader = await ctx.runtimeContext.bind(binding.tool, binding.scope, 'tool')
  if (reader.kind !== 'bound') throw new Error('reader binding failed')
  return reader.reader.read(['session'])
}

it('creates fixed session context once, rejects copied/cross-tenant access and restores the same value after close', async () => {
  const config = await configuration('context-assembly-reopen')
  const first = open(config)
  await first.app.ready
  const user = await actor(first.app),
    other = await actor(first.app, 'bob')
  const bindings = await Promise.all([
    first.app.createToolSession(user, 'context-session'),
    first.app.createToolSession(user, 'context-session'),
  ])
  const binding = bound(bindings[0]!)
  bound(bindings[1]!)
  const original = await read(first.ctx, binding)
  expect(original).toMatchObject({
    kind: 'values',
    values: [
      {
        key: 'session',
        value: { tenant: user.tenant, session: 'context-session' },
      },
    ],
  })
  expect(
    await first.ctx.runtimeContext.bind({ ...binding.tool }, binding.scope, 'tool'),
  ).toMatchObject({ reason: 'notAuthorized' })
  expect(await first.app.bindToolSession(other, 'context-session')).toMatchObject({
    reason: 'notAuthorized',
  })
  expect(await first.ctx.runtimeContext.bind(binding.tool, binding.scope, 'model')).toMatchObject({
    reason: 'notAuthorized',
  })
  const log = await first.app.readSessionLog(user, 'context-session')
  if (!('entries' in log)) throw new Error('prefix absent')
  expect(log.entries).toHaveLength(1)
  expect((await first.app.close()).complete).toBe(true)

  const second = open(config)
  try {
    await second.app.ready
    const restored = bound(await second.app.createToolSession(user, 'context-session'))
    expect(await read(second.ctx, restored)).toEqual(original)
    expect(await second.app.readSessionLog(user, 'context-session')).toEqual(log)
  } finally {
    expect((await second.app.close()).complete).toBe(true)
  }
})

it('keeps persistent required declarations when the source withdraws, and reads after a new contribution', async () => {
  const h = open(await configuration('context-source-withdrawal'))
  try {
    await h.app.ready
    const user = await actor(h.app)
    const binding = bound(await h.app.createToolSession(user, 'source-session'))
    const original = await read(h.ctx, binding)
    await h.source.dispose()
    expect(await read(h.ctx, binding)).toEqual({ kind: 'rejected', reason: 'sourceUnavailable' })
    const registrations = await h.ctx.runtimeContext.registrations(binding.control, binding.scope)
    expect(registrations).toMatchObject({
      kind: 'registrations',
      entries: [{ key: 'session', required: true }],
    })
    const replacement = h.ctx.plugin(sessionIdentitySource, {})
    await replacement
    expect(await read(h.ctx, binding)).toEqual(original)
    await replacement.dispose()
    expect(await read(h.ctx, binding)).toEqual({ kind: 'rejected', reason: 'sourceUnavailable' })
  } finally {
    expect((await h.app.close()).complete).toBe(true)
  }
})

it('does not initialize a legacy session, including a cold reopen after SQL creation alone', async () => {
  const config = await configuration('context-no-default')
  const first = open(config)
  await first.app.ready
  const user = await actor(first.app)
  await first.app.prepareSession(user, 'legacy')
  expect(await first.app.bindToolSession(user, 'legacy')).toMatchObject({ reason: 'unavailable' })
  expect(await first.app.createToolSession(user, 'legacy')).toMatchObject({ reason: 'unavailable' })
  const initial = await first.app.readSessionLog(user, 'legacy')
  expect(initial).toMatchObject({ entries: [] })
  expect((await first.app.close()).complete).toBe(true)
  const second = open(config)
  try {
    await second.app.ready
    expect(await second.app.createToolSession(user, 'legacy')).toMatchObject({
      reason: 'unavailable',
    })
    expect(await second.app.readSessionLog(user, 'legacy')).toEqual(initial)
  } finally {
    expect((await second.app.close()).complete).toBe(true)
  }
})

it('reports creation from the actual SQL transaction; an existing same-tenant row is not newly created', async () => {
  const h = open(await configuration('context-sql-created'))
  try {
    await h.app.ready
    const user = await actor(h.app)
    expect(
      await h.storage.atomic(unit =>
        unit.mutate(tx => seedHoldingTenant(tx, 'sql-only', user.tenant)),
      ),
    ).toBe('created')
    expect(
      await h.storage.atomic(unit =>
        unit.mutate(tx => seedHoldingTenant(tx, 'sql-only', user.tenant)),
      ),
    ).toBe('alreadyPresent')
    expect(await h.app.createToolSession(user, 'sql-only')).toMatchObject({ reason: 'unavailable' })
    expect(await h.app.readSessionLog(user, 'sql-only')).toMatchObject({ entries: [] })
  } finally {
    expect((await h.app.close()).complete).toBe(true)
  }
})

it('does not turn an unsupported context version or a failed read into default initialization', async () => {
  const h = open(await configuration('context-unknown-version'))
  try {
    await h.app.ready
    const user = await actor(h.app)
    const session = await h.app.prepareSession(user, 'unknown-version')
    if (!('session' in session)) throw new Error('session absent')
    await h.ctx.sessionLog.append(
      session.session,
      [
        {
          tenant: user.tenant,
          readKeys: [],
          payload: { codec: 'runtime-context/999' },
        },
      ],
      { kind: 'unfenced' },
      { kind: 'tailEquals', tail: 0 },
    )
    const prior = await h.app.readSessionLog(user, session.session)
    expect(await h.app.createToolSession(user, session.session)).toMatchObject({
      reason: 'unavailable',
    })
    expect(await h.app.bindToolSession(user, session.session)).toMatchObject({
      reason: 'unavailable',
    })
    expect(await h.app.readSessionLog(user, session.session)).toEqual(prior)

    const binding = bound(await h.app.createToolSession(user, 'read-failure'))
    const original = await h.app.readSessionLog(user, 'read-failure')
    const readFailure = vi
      .spyOn(h.ctx.sessionLog, 'readSince')
      .mockResolvedValue({ failure: 'unavailable' })
    try {
      expect(await h.app.createToolSession(user, 'read-failure')).toMatchObject({
        reason: 'unavailable',
      })
      expect(await read(h.ctx, binding)).toMatchObject({ reason: 'unavailable' })
    } finally {
      readFailure.mockRestore()
    }
    expect(await h.app.readSessionLog(user, 'read-failure')).toEqual(original)
  } finally {
    expect((await h.app.close()).complete).toBe(true)
  }
})

it('does not start initialization when application close overtakes an admitted authority check', async () => {
  const config = await configuration('context-close-authority')
  const h = open(config)
  await h.app.ready
  const user = await actor(h.app)
  const logins = h.ctx.get(LOGINS_SERVICE) as LoginsService
  const originalVerify = logins.verify.bind(logins),
    entered = latch(),
    gate = latch()
  const verify = vi.spyOn(logins, 'verify').mockImplementation(async (...args) => {
    entered.resolve()
    await gate.promise
    return originalVerify(...args)
  })
  try {
    const creating = h.app.createToolSession(user, 'during-close')
    await entered.promise
    let closed = false
    const closing = h.app.close().then(result => {
      closed = true
      return result
    })
    await new Promise(resolve => setImmediate(resolve))
    expect(closed).toBe(false)
    gate.resolve()
    expect(await creating).toMatchObject({ reason: 'ownerStopped' })
    expect((await closing).complete).toBe(true)
  } finally {
    gate.resolve()
    verify.mockRestore()
    expect((await h.app.close()).complete).toBe(true)
  }
  const reopened = open(config)
  try {
    await reopened.app.ready
    expect(await reopened.app.bindToolSession(user, 'during-close')).toMatchObject({
      reason: 'notAuthorized',
    })
  } finally {
    expect((await reopened.app.close()).complete).toBe(true)
  }
})
