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
import { LEASE_WIDTH_MS } from '../src/index.ts'
import { clockPlugin } from '../src/cordis.ts'
import { migrations, tempFile } from './support.ts'

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
      { plugin: clockPlugin, config: { file: tempFile('clock-resource'), initialize: true } },
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
    const t = await clock.now()
    expect(t).not.toBe('unavailable')
    expect(Math.abs((t as number) - Date.now())).toBeLessThan(5_000)
    await assembly.dispose()
    expect(assembly.ctx.get(CLOCK_SERVICE)).toBeUndefined()
    expect(await clock.now()).toBe('unavailable')
  })

  it('lifecycle.storage-failure-fails-load（缺陷支）：装配没把 clock_lease 迁移合进去 ⇒ 启动失败（StorageDefect），不 provide', async () => {
    await expect(
      bootAssembly({
        plugins: [
          {
            plugin: storageSqlPlugin,
            config: { dialect: 'sqlite', file: tempFile('no-migration') },
          },
          { plugin: clockPlugin, config: { file: tempFile('clock-resource'), initialize: true } },
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
        plugins: [
          { plugin: clockPlugin, config: { file: tempFile('clock-resource'), initialize: true } },
        ],
      }),
    ).rejects.toBeInstanceOf(StorageUnavailable)
  })
})

describe('clock.no-self-dispose：运行期的不可用只是返回值，fiber 仍 ACTIVE、服务仍解析得到', () => {
  const T = 1_900_000_000_000

  async function assertStillServing(assembly: Awaited<ReturnType<typeof bootClock>>, clock: Clock) {
    expect(assembly.fibers[2]?.state as number).toBe(FIBER_STATE.ACTIVE)
    const registered = assembly.ctx.reflect._getImpl(CLOCK_SERVICE)
    expect(registered?.value).toBe(assembly.clockRegistration.value)
    expect(registered?.fiber).toBe(assembly.clockRegistration.fiber)
    expect(await assembly.ctx.get(CLOCK_SERVICE)?.now()).toBe(await clock.now())
  }

  it('运行中回拨', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(T)
    const assembly = await bootClock('no-self-dispose-rollback')
    const clock = assembly.ctx.get(CLOCK_SERVICE) as Clock
    expect(await clock.now()).toBe(T)
    now.mockReturnValue(T - 5_000)
    expect(await clock.now()).toBe('unavailable')
    await assertStillServing(assembly, clock)
    now.mockReturnValue(T)
    expect(await clock.now()).toBe(T)
    await assembly.dispose()
  })

  it('业务存储关闭不阻塞独立Clock按需申请', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(T)
    const assembly = await bootClock('no-self-dispose-unavailable')
    const clock = assembly.ctx.get(CLOCK_SERVICE) as Clock
    const storage = assembly.ctx.get(STORAGE_SERVICE) as StorageService & StorageInstance
    await storage.close()
    now.mockReturnValue(T + LEASE_WIDTH_MS + 1)
    expect(await clock.now()).toBe(T + LEASE_WIDTH_MS + 1)
    await assertStillServing(assembly, clock)
    await assembly.dispose()
  })

  it('旧业务时钟表损坏不改变独立Clock资源', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(T)
    const assembly = await bootClock('no-self-dispose-defect')
    const clock = assembly.ctx.get(CLOCK_SERVICE) as Clock
    const storage = assembly.ctx.get(STORAGE_SERVICE) as StorageService & StorageInstance
    await storage.write(async tx => {
      await sql`DROP TABLE clock_lease`.execute(tx.db)
    })
    now.mockReturnValue(T + LEASE_WIDTH_MS + 1)
    expect(await clock.now()).toBe(T + LEASE_WIDTH_MS + 1)
    await assertStillServing(assembly, clock)
    await assembly.dispose()
  })
})
