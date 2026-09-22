import { describe, expect, it } from 'vitest'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { storageSqlPlugin } from '@omne-harness-lite/storage-sql'
import { CLOCK_SERVICE, clockPlugin } from '../src/index.ts'
import { migrations, tempFile } from './support.ts'

describe('clock 插件', () => {
  it('storage 就位且迁移合入 ⇒ provide clock；撤除后服务消失', async () => {
    const assembly = await bootAssembly({
      plugins: [
        {
          plugin: storageSqlPlugin,
          config: { dialect: 'sqlite', file: tempFile('plugin'), migrations },
        },
        { plugin: clockPlugin, config: {} },
      ],
    })
    const clock = assembly.ctx.get(CLOCK_SERVICE) as Clock
    const t = clock.now()
    expect(t).not.toBe('unavailable')
    expect(Math.abs((t as number) - Date.now())).toBeLessThan(5_000)
    await assembly.dispose()
    expect(assembly.ctx.get(CLOCK_SERVICE)).toBeUndefined()
    expect(clock.now()).toBe('unavailable')
  })

  it('装配没把 clock_lease 迁移合进去 ⇒ 启动失败（StorageDefect），不 provide', async () => {
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
})
