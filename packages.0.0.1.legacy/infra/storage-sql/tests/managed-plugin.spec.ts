import { existsSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import {
  createAssemblyLifetime,
  type AssemblyLifetimePort,
  type OwnedWork,
  type RetainedCloseControl,
} from '@omne-harness-lite/assembly-lifecycle'
import { AssemblyLifetimeService } from '@omne-harness-lite/assembly-lifecycle/cordis'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import { STORAGE_SERVICE, STORAGE_STARTUP_SERVICE } from '@omne-harness-lite/storage/cordis'
import { describe, expect, it } from 'vitest'
import { managedStorageSqlPlugin } from '../src/cordis.ts'
import { createUpgradeGuard, UpgradeGuardNotAttached } from '../src/index.ts'
import { startupPlugin } from './fixtures/plugin-resources.ts'
import { tempSqliteFile } from './support.ts'

class TestLifetime extends AssemblyLifetimeService {
  constructor(
    ctx: Context,
    private readonly port: AssemblyLifetimePort,
    private readonly capture: (work: OwnedWork) => void,
  ) {
    super(ctx)
  }
  isCurrent = (): boolean => {
    return this.port.isCurrent()
  }
  register = (work: OwnedWork) => {
    this.capture(work)
    return this.port.register(work)
  }
  retainClose = (control: RetainedCloseControl) => this.port.retainClose(control)
}

describe('managed SQL startup ownership', () => {
  it('withdrawal before conditional apply fails readiness without opening the database', async () => {
    const ctx = new Context(),
      lifetime = createAssemblyLifetime(['sql'], () => {})
    lifetime.tryClaim()
    let work: OwnedWork | undefined
    await ctx.plugin(inner => {
      new TestLifetime(inner, lifetime.port('sql'), owned => {
        work = owned
        void owned.ready.catch(() => {})
      })
    })
    let calls = 0
    const startup = ctx.plugin(
      startupPlugin({
        migrations: {
          async getMigrations() {
            calls += 1
            return {}
          },
        },
        upgrade: false,
      }),
      {},
    )
    await startup
    const file = tempSqliteFile('managed-before-child')
    let withdrawn: Promise<void> | undefined
    const observer = ctx.on('internal/status', fiber => {
      if (
        !(STORAGE_STARTUP_SERVICE in fiber.inject) ||
        (fiber.state as number) !== FIBER_STATE.LOADING
      )
        return
      observer()
      withdrawn = Promise.resolve(fiber.dispose())
    })
    const fiber = ctx.plugin(managedStorageSqlPlugin, {
      dialect: 'sqlite',
      file,
      startup: 'migrate',
    })
    try {
      await fiber
      expect(work).toBeDefined()
      await expect(work?.ready).rejects.toThrow()
      const result = await lifetime.closed
      await withdrawn
      expect(result.complete).toBe(false)
      expect(result.rows[0]?.result).toEqual({ kind: 'failed', codes: ['setup'] })
      expect(calls).toBe(0)
      expect(existsSync(file)).toBe(false)
      expect(ctx.get(STORAGE_SERVICE)).toBeUndefined()
    } finally {
      observer()
      await lifetime.close()
      await ctx.fiber.dispose()
    }
  })

  it('withdrawal during migration waits for setup and restores the unconfirmed database', async () => {
    const ctx = new Context(),
      lifetime = createAssemblyLifetime(['sql'], () => {})
    lifetime.tryClaim()
    let work: OwnedWork | undefined
    await ctx.plugin(inner => {
      new TestLifetime(inner, lifetime.port('sql'), owned => {
        work = owned
        void owned.ready.catch(() => {})
      })
    })
    const entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>(),
      guard = createUpgradeGuard()
    await ctx.plugin(
      startupPlugin({
        migrations: {
          async getMigrations() {
            entered.resolve()
            await release.promise
            return {}
          },
        },
        upgrade: { checks: [], guard },
      }),
      {},
    )
    const file = tempSqliteFile('managed-held-startup')
    const fiber = ctx.plugin(managedStorageSqlPlugin, {
      dialect: 'sqlite',
      file,
      startup: 'migrate',
    })
    try {
      await fiber
      await entered.promise
      let closed = false
      const closing = Promise.resolve(fiber.dispose()).then(() => {
        closed = true
      })
      await new Promise(setImmediate)
      expect(lifetime.isCurrent()).toBe(false)
      expect(closed).toBe(false)
      expect(ctx.get(STORAGE_SERVICE)).toBeUndefined()
      release.resolve()
      await expect(work?.ready).rejects.toThrow()
      await closing
      expect((await lifetime.closed).complete).toBe(false)
      expect(await guard.pending()).toBe('clear')
      await expect(guard.confirm()).rejects.toBeInstanceOf(UpgradeGuardNotAttached)
      expect(existsSync(file)).toBe(false)
    } finally {
      release.resolve()
      await lifetime.close()
      await ctx.fiber.dispose()
    }
  })
})
