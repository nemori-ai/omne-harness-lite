import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { instantFromEpochMs, instantFromRfc3339, type Clock } from '@omne-harness-lite/offer-expiry'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { composeMigrations } from '@omne-harness-lite/storage'
import {
  createRuntimeContext,
  runtimeContextMigrations,
} from '@omne-harness-lite/runtime-context-local'
import type { SessionLog } from '@omne-harness-lite/session-log'
import type { HoldingTenantResult, SessionScope } from '@omne-harness-lite/session-tenancy'
import { createSessionLogBacking } from '../src/log-backing.ts'
import { createSessionContextCreator } from '../src/session-context-creation.ts'
import { latch } from './support.ts'

const scope: SessionScope = {
  tenant: unwrap(parseTenantId({ organization: 'context-org', account: 'context-user' })),
  session: unwrap(parseOpaqueIdentifier('context-session', 'SessionRef')),
}
const at = unwrap(instantFromRfc3339('2026-10-04T00:00:00Z'))

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'omne-context-creator-'))
  const log = await openJsonlSessionLog({
    dir,
    processOwnership: { current: 'context-creator', observeExit: async () => 'unknown' },
  })
  const append = vi.fn<SessionLog['append']>(log.append)
  const observed = { ...log, append }
  const backing = createSessionLogBacking(observed)
  const borrow = backing.operations.borrow()
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(dir, 'context.sqlite'),
    migrations: composeMigrations(runtimeContextMigrations),
    upgrade: false,
  })
  const context = createRuntimeContext({
    log: borrow.log,
    storage,
    access: { authorize: async () => ({ kind: 'rejected', reason: 'notAuthorized' }) },
    now: () => '2026-10-04T00:00:00Z',
  })
  const now = vi.fn<Clock['now']>(() => at)
  let held: HoldingTenantResult = { failure: 'sessionNotFound' }
  const createRow = vi.fn(async () => {
    if ('tenant' in held) return 'alreadyPresent' as const
    held = { tenant: scope.tenant }
    return 'created' as const
  })
  const owner = createSessionContextCreator({
    clock: { now },
    initializer: context.initializer,
    tenancy: { holdingTenant: async () => held },
    createRow,
  })
  return {
    owner,
    context,
    borrow,
    log,
    append,
    backing,
    now,
    createRow,
    existing() {
      held = { tenant: scope.tenant }
    },
    async cleanup() {
      // Each failure test checks retained ownership before this isolated fixture is destroyed.
      context.closeAdmission()
      await context.drain()
      await borrow.release()
      await storage.close()
      await log.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

it('coalesces first creation and preserves the initial value on repeated preparation', async () => {
  const f = await fixture()
  try {
    expect(await Promise.all([f.owner.prepare(scope), f.owner.prepare(scope)])).toEqual([
      { kind: 'prepared' },
      { kind: 'prepared' },
    ])
    f.now.mockReturnValue(unwrap(instantFromEpochMs(at + 1000)))
    expect(await f.owner.prepare(scope)).toEqual({ kind: 'prepared' })
    expect(f.createRow).toHaveBeenCalledTimes(1)
    expect(f.append).toHaveBeenCalledTimes(1)
    const read = await f.log.readSince(scope.session, 0)
    if ('failure' in read) throw new Error('prefix missing')
    expect(read.entries).toHaveLength(1)
    expect(read.entries[0]?.payload).toMatchObject({
      kind: 'session_initialized',
      seed: {
        fixed: [{ key: 'session', value: scope }],
        initial: [{ observedAt: '2026-10-04T00:00:00.000Z' }],
      },
    })
    await f.owner.drain()
  } finally {
    await f.cleanup()
  }
})

it('does not initialize an existing row or a row won by another creator after notFound', async () => {
  const f = await fixture()
  try {
    f.createRow.mockImplementation(async () => {
      f.existing()
      return 'alreadyPresent'
    })
    expect(await f.owner.prepare(scope)).toEqual({ kind: 'prepared' })
    expect(await f.owner.prepare(scope)).toEqual({ kind: 'prepared' })
    expect(f.createRow).toHaveBeenCalledTimes(1)
    expect(f.append).not.toHaveBeenCalled()
    await f.owner.drain()
  } finally {
    await f.cleanup()
  }
})

it('retains an unconfirmed SQL creation without taking initialization authority on retry', async () => {
  const f = await fixture()
  try {
    f.createRow.mockImplementation(async () => {
      f.existing()
      throw new Error('SQL receipt unknown')
    })
    expect(await f.owner.prepare(scope)).toMatchObject({ reason: 'unavailable' })
    expect(await f.owner.prepare(scope)).toMatchObject({ reason: 'unavailable' })
    expect(f.createRow).toHaveBeenCalledTimes(1)
    expect(f.now).toHaveBeenCalledTimes(1)
    expect(f.append).not.toHaveBeenCalled()
    await expect(f.owner.drain()).rejects.toThrow('not confirmed')
  } finally {
    await f.cleanup()
  }
})

it('does no creation or append when the explicit clock is unavailable', async () => {
  const f = await fixture()
  try {
    f.now.mockReturnValue('unavailable')
    expect(await f.owner.prepare(scope)).toMatchObject({ reason: 'unavailable' })
    expect(f.createRow).not.toHaveBeenCalled()
    expect(f.append).not.toHaveBeenCalled()
    await f.owner.drain()
  } finally {
    await f.cleanup()
  }
})

it('recognizes the original initialization after a committed write loses its receipt', async () => {
  const f = await fixture()
  try {
    f.append.mockImplementationOnce(async (...args) => {
      await f.log.append(...args)
      return { failure: 'unavailable' }
    })
    expect(await f.owner.prepare(scope)).toMatchObject({ reason: 'unavailable' })
    f.now.mockReturnValue(unwrap(instantFromEpochMs(at + 10_000)))
    expect(await f.owner.prepare(scope)).toEqual({ kind: 'prepared' })
    expect(f.now).toHaveBeenCalledTimes(1)
    expect(f.append).toHaveBeenCalledTimes(1)
    await f.owner.drain()
  } finally {
    await f.cleanup()
  }
})

it('retains an absent unknown append and releases only after the same batch appears', async () => {
  const f = await fixture()
  let original: Parameters<SessionLog['append']> | undefined
  try {
    f.append.mockImplementationOnce(async (...args) => {
      original = args
      return { failure: 'unavailable' }
    })
    expect(await f.owner.prepare(scope)).toMatchObject({ reason: 'unavailable' })
    expect(await f.owner.prepare(scope)).toMatchObject({ reason: 'unavailable' })
    expect(f.append).toHaveBeenCalledTimes(1)
    await f.owner.drain()
    f.context.closeAdmission()
    await expect(f.context.drain()).rejects.toThrow('unresolved writes')
    expect(await f.owner.prepare(scope)).toMatchObject({ reason: 'ownerStopped' })
    if (!original) throw new Error('original request missing')
    expect(await f.log.append(...original)).not.toHaveProperty('failure')
    await expect(f.context.drain()).resolves.toBeUndefined()
    await f.borrow.release()
    await f.backing.drain()
  } finally {
    await f.cleanup()
  }
})

it('waits for an admitted creation before release and rejects creation after close', async () => {
  const f = await fixture(),
    entered = latch(),
    gate = latch()
  try {
    f.append.mockImplementationOnce(async (...args) => {
      entered.resolve()
      await gate.promise
      return f.log.append(...args)
    })
    const creating = f.owner.prepare(scope)
    await entered.promise
    f.owner.closeAdmission()
    expect(await f.owner.prepare(scope)).toMatchObject({ reason: 'ownerStopped' })
    let drained = false
    const draining = f.owner.drain().then(() => {
      drained = true
    })
    await new Promise(resolve => setImmediate(resolve))
    expect(drained).toBe(false)
    gate.resolve()
    expect(await creating).toEqual({ kind: 'prepared' })
    await draining
    expect(drained).toBe(true)
    await f.borrow.release()
    await f.backing.drain()
  } finally {
    gate.resolve()
    await f.cleanup()
  }
})
