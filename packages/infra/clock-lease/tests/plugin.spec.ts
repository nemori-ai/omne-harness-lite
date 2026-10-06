import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { StorageUnavailable, type Storage, type StorageInstance } from '@omne-harness-lite/storage'
import {
  STORAGE_SERVICE,
  StorageStartup,
  type StorageService,
} from '@omne-harness-lite/storage/cordis'
import { storageSqlPlugin } from '@omne-harness-lite/storage-sql/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import { LEASE_WIDTH_MS, RENEW_PERIOD_MS } from '../src/index.ts'
import { clockPlugin } from '../src/cordis.ts'
import { drain, migrations, settle, tempFile } from './support.ts'

class ClockStartup extends StorageStartup {
  readonly migrations = migrations
  readonly upgrade = false as const
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function bootClock(label: string) {
  const assembly = await bootAssembly({
    plugins: [
      {
        plugin(ctx) {
          new ClockStartup(ctx)
        },
      },
      {
        plugin: storageSqlPlugin,
        config: { dialect: 'sqlite', file: tempFile(label), startup: 'migrate' },
      },
      { plugin: clockPlugin, config: {} },
    ],
  })
  const registered = assembly.ctx.reflect._getImpl(CLOCK_SERVICE)
  if (registered === undefined) throw new Error('clock registration absent')
  return {
    ...assembly,
    clockRegistration: { value: registered.value as unknown, fiber: registered.fiber },
  }
}

describe('clock 插件', () => {
  it('storage 就位且迁移合入 ⇒ provide clock；撤除后服务消失', async () => {
    const assembly = await bootClock('plugin')
    const clock = assembly.ctx.get(CLOCK_SERVICE) as Clock
    const t = clock.now()
    expect(t).not.toBe('unavailable')
    expect(Math.abs((t as number) - Date.now())).toBeLessThan(5_000)
    await assembly.dispose()
    expect(assembly.ctx.get(CLOCK_SERVICE)).toBeUndefined()
    expect(clock.now()).toBe('unavailable')
  })

  it('lifecycle.storage-failure-fails-load（缺陷支）：装配没把 clock_lease 迁移合进去 ⇒ 启动失败（StorageDefect），不 provide', async () => {
    await expect(
      bootAssembly({
        plugins: [
          {
            plugin: storageSqlPlugin,
            config: { dialect: 'sqlite', file: tempFile('no-migration') },
          },
          { plugin: clockPlugin, config: {} },
        ],
      }),
    ).rejects.toMatchObject({ name: 'StorageDefect' })
  })

  it('lifecycle.storage-failure-fails-load（不可用支）：启动判定那次写 StorageUnavailable ⇒ 启动失败，不 provide', async () => {
    const unavailable: Storage = {
      read: () => Promise.reject(new StorageUnavailable('injected')),
      write: () => Promise.reject(new StorageUnavailable('injected')),
    }
    await expect(
      bootAssembly({
        services: [{ name: STORAGE_SERVICE, value: unavailable }],
        plugins: [{ plugin: clockPlugin, config: {} }],
      }),
    ).rejects.toBeInstanceOf(StorageUnavailable)
  })
})

describe('clock.no-self-dispose：运行期的不可用只是返回值，fiber 仍 ACTIVE、服务仍解析得到', () => {
  const T = 1_900_000_000_000

  function assertStillServing(assembly: Awaited<ReturnType<typeof bootClock>>, clock: Clock) {
    expect(assembly.fibers[2]?.state as number).toBe(FIBER_STATE.ACTIVE)
    const registered = assembly.ctx.reflect._getImpl(CLOCK_SERVICE)
    expect(registered?.value).toBe(assembly.clockRegistration.value)
    expect(registered?.fiber).toBe(assembly.clockRegistration.fiber)
    expect(assembly.ctx.get(CLOCK_SERVICE)?.now()).toBe(clock.now())
  }

  it('运行中回拨', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(T)
    const assembly = await bootClock('no-self-dispose-rollback')
    const clock = assembly.ctx.get(CLOCK_SERVICE) as Clock
    expect(clock.now()).toBe(T)
    now.mockReturnValue(T - 5_000)
    expect(clock.now()).toBe('unavailable')
    assertStillServing(assembly, clock)
    now.mockReturnValue(T)
    expect(clock.now()).toBe(T)
    await assembly.dispose()
  })

  it('续约写失败', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(T)
    const assembly = await bootClock('no-self-dispose-unavailable')
    const clock = assembly.ctx.get(CLOCK_SERVICE) as Clock
    const storage = assembly.ctx.get(STORAGE_SERVICE) as StorageService & StorageInstance
    // Cordis 4.0.4 的日志等级 ERROR 0 < INFO 1 < WARN 2 < DEBUG 3，默认只导出到 INFO：warn 要显式放开才看得见
    const warnings: string[] = []
    assembly.ctx.logger.exporter({
      levels: { default: 3 },
      export: message => {
        if (message.type === 'warn') warnings.push(message.args.map(String).join(' '))
      },
    })
    await storage.close() // 此后一切写 ⇒ StorageUnavailable
    now.mockReturnValue(T + RENEW_PERIOD_MS)
    vi.advanceTimersByTime(RENEW_PERIOD_MS)
    await settle(() => warnings.some(text => text.includes('renewal failed')))
    expect(clock.now()).toBe(T + RENEW_PERIOD_MS)
    now.mockReturnValue(T + LEASE_WIDTH_MS + 1)
    expect(clock.now()).toBe('unavailable')
    assertStillServing(assembly, clock)
    await assembly.dispose()
  })

  it('续约写缺陷（闩住）', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(T)
    const assembly = await bootClock('no-self-dispose-defect')
    const clock = assembly.ctx.get(CLOCK_SERVICE) as Clock
    const storage = assembly.ctx.get(STORAGE_SERVICE) as StorageService & StorageInstance
    await storage.write(async tx => {
      await sql`DROP TABLE clock_lease`.execute(tx.db)
    })
    now.mockReturnValue(T + RENEW_PERIOD_MS)
    vi.advanceTimersByTime(RENEW_PERIOD_MS)
    await settle(() => assembly.ctx.logger.buffer.some(m => m.type === 'error'))
    await drain()
    expect(clock.now()).toBe('unavailable')
    assertStillServing(assembly, clock)
    await assembly.dispose()
  })
})
