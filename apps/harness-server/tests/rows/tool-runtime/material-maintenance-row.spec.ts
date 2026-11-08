import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import type { TenantDomains } from '@omne-harness/sql-contract'
import type { LifecycleHandle } from '../../../src/types.ts'
import { monotonicClock } from '../../../src/shutdown.ts'
import { toolMaterialMaintenanceRow } from '../../../src/rows/tool-material-maintenance/index.ts'

const config = {
  combinationVersion: 'session-composite/6',
  maxCommandBytes: 1_048_576,
  maxChunkBytes: 16_384,
  ledgerCommitAttempts: 4,
  intervalMs: 10,
  pageSize: 2,
}
type Enumeration = Awaited<ReturnType<TenantDomains<unknown>['enumerate']>>
const empty: Enumeration = { kind: 'ready', revision: '1', entries: [] }

async function assembly(
  enumerate: TenantDomains<unknown>['enumerate'],
  rejectRegistration = false,
) {
  const root = new Context()
  const logs: string[] = []
  root.logger.exporter({
    levels: { default: 3 },
    export: message => logs.push(JSON.stringify(message)),
  })
  let handle: LifecycleHandle | undefined
  const lookup = vi.fn(async () => {
    throw new Error('no SQL expected in lifecycle fixture')
  })
  await root.plugin({
    apply(ctx: Context) {
      ctx.provide('storage', {})
      ctx.provide('tenantDomainLookup', { lookup })
      ctx.provide('tenantDomains', { enumerate })
      ctx.provide('s0.assemblyLifecycle', {
        register(value: LifecycleHandle) {
          if (rejectRegistration) throw new Error('registration refused')
          handle = value
        },
      })
    },
  })
  const authorization = await root.plugin({
    apply(ctx: Context) {
      ctx.provide('systemActionAuthorization', {})
    },
  })
  const principals = await root.plugin({
    apply(ctx: Context) {
      ctx.provide('tenantDomainScannerPrincipal', { kind: 'scanner-fixture' })
      ctx.provide('toolMaterialMaintainerPrincipal', { kind: 'maintainer-fixture' })
    },
  })
  const pending = root.plugin(toolMaterialMaintenanceRow, config)
  return {
    root,
    principals,
    authorization,
    logs,
    pending,
    lookup,
    handle: () => {
      if (handle === undefined) throw new Error('row did not register')
      return handle
    },
  }
}

it('waits for its declared dependencies without starting maintenance', async () => {
  const root = new Context()
  const row = root.plugin(toolMaterialMaintenanceRow, config)
  expect(row.state).toBe(0)
  await row.dispose()
  await root.fiber.dispose()
})

it('reports deadline while an accepted directory read drains, then stops without another read', async () => {
  const entered = Promise.withResolvers<void>()
  const held = Promise.withResolvers<Enumeration>()
  const enumerate = vi.fn(async () => {
    entered.resolve()
    return held.promise
  })
  const app = await assembly(enumerate)
  try {
    await app.pending
    await entered.promise
    expect(await app.handle().stop(monotonicClock.now())).toMatchObject({ kind: 'incomplete' })
    held.resolve(empty)
    expect(await app.handle().stop(monotonicClock.now() + 1000)).toEqual({ kind: 'settled' })
    expect(enumerate).toHaveBeenCalledTimes(1)
    expect(app.lookup).not.toHaveBeenCalled()
  } finally {
    held.resolve(empty)
    await app.root.fiber.dispose()
  }
})

it.each(['principals', 'authorization'] as const)(
  'closes on %s withdrawal and drains the already accepted enumeration',
  async dependency => {
    const entered = Promise.withResolvers<void>()
    const held = Promise.withResolvers<Enumeration>()
    const enumerate = vi.fn(async () => {
      entered.resolve()
      return held.promise
    })
    const app = await assembly(enumerate)
    try {
      await app.pending
      await entered.promise
      const retiring = app[dependency].dispose()
      held.resolve(empty)
      await retiring
      await new Promise(resolve => setTimeout(resolve, 30))
      expect(enumerate).toHaveBeenCalledTimes(1)
      expect(await app.handle().stop(monotonicClock.now() + 1000)).toEqual({ kind: 'settled' })
      expect(enumerate).toHaveBeenCalledTimes(1)
      expect(app.lookup).not.toHaveBeenCalled()
    } finally {
      held.resolve(empty)
      await app.root.fiber.dispose()
    }
  },
)

it('observes runner failure without exposing the exception and reports failed close', async () => {
  const entered = Promise.withResolvers<void>()
  const held = Promise.withResolvers<Enumeration>()
  const app = await assembly(async () => {
    entered.resolve()
    return held.promise
  })
  let timer: ReturnType<typeof vi.spyOn> | undefined
  try {
    await app.pending
    await entered.promise
    timer = vi.spyOn(monotonicClock, 'after').mockImplementationOnce(() => {
      throw new Error('PRIVATE scheduler failure')
    })
    held.resolve(empty)
    await expect
      .poll(() => app.logs.some(line => line.includes('material maintenance runner failed')))
      .toBe(true)
    timer.mockRestore()
    expect(await app.handle().stop(monotonicClock.now() + 1000)).toMatchObject({ kind: 'failed' })
    expect(app.logs.join('\n')).not.toContain('PRIVATE')
  } finally {
    timer?.mockRestore()
    held.resolve(empty)
    await app.root.fiber.dispose()
  }
})

it('closes its runner if lifecycle registration fails after the body starts', async () => {
  const enumerate = vi.fn(async () => empty)
  const app = await assembly(enumerate, true)
  try {
    await expect(app.pending).rejects.toThrow('registration refused')
    await app.pending.dispose()
    const count = enumerate.mock.calls.length
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(enumerate).toHaveBeenCalledTimes(count)
    expect(app.lookup).not.toHaveBeenCalled()
  } finally {
    await app.root.fiber.dispose()
  }
})
