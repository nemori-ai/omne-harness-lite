import { describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import { ClockRollbackDetected, LEASE_WIDTH_MS, LeaseClock } from '../src/index.ts'
import { fakeSources, openTempStorage } from './support.ts'

describe('LeaseClock', () => {
  it('进程内单调：推算值随单调钟前进，与墙钟无关', async () => {
    const { storage } = await openTempStorage('mono')
    const { sources, state } = fakeSources(1_000_000)
    const clock = new LeaseClock({ storage, sources })
    await clock.start()
    expect(clock.now()).toBe(1_000_000)
    state.mono = 500
    state.wall = 0 // 锚定后墙钟被调回，不影响本实例
    expect(clock.now()).toBe(1_000_500)
    await clock.close()
    await storage.close()
  })

  it('回拨 ⇒ start() 抛出（启动失败）且实例闩住：重启时墙钟小于上次写下的 written_at', async () => {
    const { storage, file } = await openTempStorage('rollback')
    const first = new LeaseClock({ storage, sources: fakeSources(2_000_000).sources })
    await first.start()
    await first.close()
    const { storage: storage2 } = await openTempStorage('rollback', file)
    const second = new LeaseClock({
      storage: storage2,
      sources: fakeSources(2_000_000 - 5_000).sources,
    })
    await expect(second.start()).rejects.toBeInstanceOf(ClockRollbackDetected)
    expect(second.now()).toBe('unavailable')
    await second.close()
    await storage.close()
    await storage2.close()
  })

  it('崩溃后快速重启落在旧租约窗口内 ⇒ 追上前 unavailable，追上后服务且不小于旧 lease_until', async () => {
    const { storage, file } = await openTempStorage('crash')
    const crashed = new LeaseClock({ storage, sources: fakeSources(3_000_000).sources })
    await crashed.start() // lease_until = 3_010_000；不 close，模拟崩溃
    const { storage: storage2 } = await openTempStorage('crash', file)
    const { sources, state } = fakeSources(3_000_100)
    const restarted = new LeaseClock({ storage: storage2, sources })
    await restarted.start()
    expect(restarted.now()).toBe('unavailable')
    state.mono = LEASE_WIDTH_MS // 单调推算追上旧租约
    const served = restarted.now()
    expect(served).not.toBe('unavailable')
    expect(served as number).toBeGreaterThanOrEqual(3_010_000)
    await restarted.close()
    await storage.close()
    await storage2.close()
  })

  it('干净撤除收回租约 ⇒ 重启不用等', async () => {
    const { storage, file } = await openTempStorage('clean')
    const first = new LeaseClock({ storage, sources: fakeSources(4_000_000).sources })
    await first.start()
    await first.close()
    const { storage: storage2 } = await openTempStorage('clean', file)
    const second = new LeaseClock({ storage: storage2, sources: fakeSources(4_000_050).sources })
    await second.start()
    expect(second.now()).toBe(4_000_050)
    await second.close()
    await storage.close()
    await storage2.close()
  })

  it('续约写失败 ⇒ 越过租约即 unavailable；恢复后自愈', async () => {
    const { storage } = await openTempStorage('renew-fail')
    const { sources, state } = fakeSources(5_000_000)
    const failures: unknown[] = []
    const clock = new LeaseClock({ storage, sources, onRenewFailure: e => failures.push(e) })
    await clock.start()
    await storage.close() // 存储不可用
    state.mono = LEASE_WIDTH_MS - 1
    expect(clock.now()).toBe(5_000_000 + LEASE_WIDTH_MS - 1)
    await expect(clock.renew()).rejects.toBeInstanceOf(StorageUnavailable)
    state.mono = LEASE_WIDTH_MS + 1
    expect(clock.now()).toBe('unavailable')
    await clock.close()
    expect(failures.length).toBeGreaterThanOrEqual(1) // 收回写失败只报告
  })

  it('撤除后 unavailable', async () => {
    const { storage } = await openTempStorage('closed')
    const clock = new LeaseClock({ storage, sources: fakeSources(6_000_000).sources })
    await clock.start()
    await clock.close()
    expect(clock.now()).toBe('unavailable')
    await storage.close()
  })
})

describe('LeaseClock · 两实例', () => {
  it('从未推过租约的实例撤除时不收回别人的租约', async () => {
    const { storage, file } = await openTempStorage('two-instances')
    const a = new LeaseClock({ storage, sources: fakeSources(7_000_000).sources })
    await a.start() // lease_until = 7_010_000
    const { storage: storage2 } = await openTempStorage('two-instances', file)
    const b = new LeaseClock({ storage: storage2, sources: fakeSources(7_000_000).sources }) // 墙钟等于 A 的 written_at（不算回拨），推算目标 ≤ A 的租约，续约守卫不写
    await b.start()
    await b.close()
    const row = await storage.read(
      async tx =>
        (await sql`SELECT lease_until FROM clock_lease WHERE id = 1`.execute(tx.db)).rows[0] as {
          lease_until: number
        },
    )
    expect(row.lease_until).toBe(7_010_000) // A 的租约没被 B 缩回
    await a.close()
    await storage.close()
    await storage2.close()
  })
})
