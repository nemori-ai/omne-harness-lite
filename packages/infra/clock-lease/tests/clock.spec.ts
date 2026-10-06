// LeaseClock：现读墙钟 + 用过的最晚时刻 hw + 存储里写在前的租约。义务名对应 clock verification.md。
// 续约定时器用伪造的 setInterval 驱动（vi.advanceTimersByTime），存储是 sqlite 临时文件库；墙钟由测试注入。
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import {
  ClockRollbackDetected,
  LEASE_WIDTH_MS,
  LeaseClock,
  RENEW_PERIOD_MS,
  clockLeaseMigration,
} from '../src/index.ts'
import {
  controllableStorage,
  drain,
  fakeSources,
  openTempStorage,
  readLease,
  recordingLogger,
  settle,
} from './support.ts'

const L = LEASE_WIDTH_MS

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('LeaseClock', () => {
  it('clock.monotonic-in-process：墙钟前进、原地、后退各一段——返回值非递减，且每个都等于当时的墙钟读数', async () => {
    const { storage } = await openTempStorage('mono')
    const { sources, state } = fakeSources(1_000_000)
    const clock = new LeaseClock({ storage, sources })
    await clock.start()
    const returned: number[] = []
    const walls = [
      ...Array.from({ length: 50 }, (_, i) => 1_000_000 + i * 10), // 前进
      ...Array.from({ length: 20 }, () => 1_000_490), // 原地
      ...Array.from({ length: 30 }, (_, i) => 1_000_490 - (i + 1) * 7), // 后退
    ]
    for (const wall of walls) {
      state.wall = wall
      state.mono += 1_000 // 单调钟怎么走都不参与
      const t = clock.now()
      if (t === 'unavailable') continue
      expect(t).toBe(wall)
      returned.push(t)
    }
    expect(returned.length).toBe(70)
    for (let i = 1; i < returned.length; i += 1)
      expect(returned[i]).toBeGreaterThanOrEqual(returned[i - 1]!)
    await clock.close()
    await storage.close()
  })

  it('clock.step-back-fails-boot：回拨 ⇒ start() 抛出（启动失败）且实例闩住：重启时墙钟小于上次写下的 written_at', async () => {
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

  it('clock.restart-respects-lease：崩溃（不走撤除）之后新实例的第一个返回值 ≥ 旧实例最后返回值；走过撤除则立即可服务', async () => {
    const { storage, file } = await openTempStorage('restart')
    const a = fakeSources(3_000_000)
    const crashed = new LeaseClock({ storage, sources: a.sources })
    await crashed.start()
    let last = 0
    for (let wall = 3_000_000; wall <= 3_000_500; wall += 100) {
      a.state.wall = wall
      last = clock_value(crashed.now())
    }
    // 崩溃：丢弃实例，不撤除
    const { storage: storage2 } = await openTempStorage('restart', file)
    const b = fakeSources(3_000_600)
    const restarted = new LeaseClock({ storage: storage2, sources: b.sources })
    await restarted.start()
    let first: number | undefined
    for (let wall = 3_000_600; first === undefined; wall += 250) {
      b.state.wall = wall
      const t = restarted.now()
      if (t !== 'unavailable') first = t
    }
    expect(first).toBeGreaterThanOrEqual(last)
    expect(first).toBeGreaterThanOrEqual(3_000_000 + L)
    await restarted.close()

    // 另一支：旧实例走撤除（收回租约）⇒ 新实例立即可服务
    const { storage: s3, file: f3 } = await openTempStorage('restart-clean')
    const c = fakeSources(4_000_000)
    const clean = new LeaseClock({ storage: s3, sources: c.sources })
    await clean.start()
    c.state.wall = 4_000_500
    expect(clean.now()).toBe(4_000_500)
    await clean.close()
    const { storage: s4 } = await openTempStorage('restart-clean', f3)
    const next = new LeaseClock({ storage: s4, sources: fakeSources(4_000_550).sources })
    await next.start()
    expect(next.now()).toBe(4_000_550)
    await next.close()
    for (const s of [storage, storage2, s3, s4]) await s.close()
  })

  it('clock.write-failure-goes-unavailable：续约写失败 ⇒ 界内照常、越界 unavailable；存储恢复后一次续约周期内恢复', async () => {
    const { storage: inner } = await openTempStorage('renew-fail')
    const { storage, state: control } = controllableStorage(inner)
    const { sources, state } = fakeSources(5_000_000)
    const { logger, records } = recordingLogger()
    const failures: unknown[] = []
    const clock = new LeaseClock({
      storage,
      sources,
      logger,
      onRenewFailure: e => failures.push(e),
    })
    await clock.start() // leaseUntil = 5_000_000 + L
    control.failing = true
    state.wall = 5_000_000 + RENEW_PERIOD_MS
    vi.advanceTimersByTime(RENEW_PERIOD_MS)
    await settle(() => failures.length === 1)
    expect(failures[0]).toBeInstanceOf(StorageUnavailable)
    expect(records.some(r => r.level === 'warn' && r.text.includes('renewal failed'))).toBe(true)
    state.wall = 5_000_000 + L - 1
    expect(clock.now()).toBe(5_000_000 + L - 1)
    state.wall = 5_000_000 + L + 1
    expect(clock.now()).toBe('unavailable')
    // 存储恢复：下一轮续约把界推到 w + L，恢复服务
    control.failing = false
    const writesBefore = control.writes
    vi.advanceTimersByTime(RENEW_PERIOD_MS)
    await settle(() => clock.now() !== 'unavailable')
    expect(control.writes).toBe(writesBefore + 1)
    expect(clock.now()).toBe(5_000_000 + L + 1)
    await clock.close()
    await inner.close()
  })

  it('clock.write-defect-latches：续约写抛 StorageDefect ⇒ 立即且永久 unavailable、定时器不再发写、有一条 error 记录', async () => {
    const { storage: inner } = await openTempStorage('renew-defect')
    const { storage, state: control } = controllableStorage(inner)
    const { sources, state } = fakeSources(6_000_000)
    const { logger, records } = recordingLogger()
    const clock = new LeaseClock({ storage, sources, logger })
    await clock.start()
    expect(clock.now()).toBe(6_000_000)
    await inner.write(async tx => {
      await sql`DROP TABLE clock_lease`.execute(tx.db)
    })
    state.wall = 6_000_100
    vi.advanceTimersByTime(RENEW_PERIOD_MS)
    await settle(() => records.some(r => r.level === 'error'))
    expect(clock.now()).toBe('unavailable')
    expect(vi.getTimerCount()).toBe(0)
    const writes = control.writes
    vi.advanceTimersByTime(RENEW_PERIOD_MS * 5)
    await drain()
    expect(control.writes).toBe(writes)
    state.wall = 6_000_200 // 仍在原租约内也不再答
    expect(clock.now()).toBe('unavailable')
    await clock.close()
    await inner.close()
  })

  it('clock.running-rollback-unavailable-until-caught-up：运行中回拨 ⇒ 下一次 now() 即 unavailable，追上最后返回值才恢复；成对的 warn/info；续约不改小 written_at', async () => {
    const { storage } = await openTempStorage('running-rollback')
    const { storage: counted, state: recordingWrites } = controllableStorage(storage)
    const { sources, state } = fakeSources(7_000_000)
    const { logger, records } = recordingLogger()
    const clock = new LeaseClock({ storage: counted, sources, logger })
    await clock.start()
    state.wall = 7_000_300
    expect(clock.now()).toBe(7_000_300)
    const rowBefore = await readLease(storage)

    state.wall = 7_000_300 - 5_000
    expect(clock.now()).toBe('unavailable') // 零延迟，不等续约周期
    expect(clock.now()).toBe('unavailable')
    const renewals = recordingWrites.writes
    vi.advanceTimersByTime(RENEW_PERIOD_MS) // 回拨期间的续约：发了写，但没把 written_at 改小
    await settle(() => recordingWrites.writes === renewals + 1)
    await drain()
    expect(await readLease(storage)).toEqual(rowBefore)
    state.wall = 7_000_299
    expect(clock.now()).toBe('unavailable')
    state.wall = 7_000_300
    expect(clock.now()).toBe(7_000_300)

    const entering = records.filter(r => r.level === 'warn' && r.text.includes('behind'))
    const leaving = records.filter(r => r.level === 'info' && r.text.includes('caught up'))
    expect(entering).toHaveLength(1)
    expect(entering[0]?.text).toContain('7000300')
    expect(leaving).toHaveLength(1)
    await clock.close()
    await storage.close()
  })

  it('clock.rollback-then-restart：运行中回拨后丢弃实例 ⇒ 新实例确定回拨；走撤除 ⇒ 撤除写的是 max(hw, w)，新实例同样确定回拨', async () => {
    // 不走撤除
    const { storage, file } = await openTempStorage('rb-restart-crash')
    const a = fakeSources(8_000_000)
    const crashed = new LeaseClock({ storage, sources: a.sources })
    await crashed.start()
    a.state.wall = 8_000_300
    expect(crashed.now()).toBe(8_000_300)
    a.state.wall = 8_000_300 - 5_000
    expect(crashed.now()).toBe('unavailable')
    const { storage: storage2 } = await openTempStorage('rb-restart-crash', file)
    const fresh = new LeaseClock({
      storage: storage2,
      sources: fakeSources(8_000_300 - 5_000).sources,
    })
    await expect(fresh.start()).rejects.toBeInstanceOf(ClockRollbackDetected)

    // 走撤除：墙钟正落后于 hw 时收回到 hw
    const { storage: s3, file: f3 } = await openTempStorage('rb-restart-clean')
    const c = fakeSources(9_000_000)
    const clean = new LeaseClock({ storage: s3, sources: c.sources })
    await clean.start()
    c.state.wall = 9_000_300
    expect(clean.now()).toBe(9_000_300)
    c.state.wall = 9_000_300 - 5_000
    await clean.close()
    expect(await readLease(s3)).toEqual({ lease_until: 9_000_300, written_at: 9_000_300 })
    const { storage: s4 } = await openTempStorage('rb-restart-clean', f3)
    const again = new LeaseClock({ storage: s4, sources: fakeSources(9_000_300 - 5_000).sources })
    await expect(again.start()).rejects.toBeInstanceOf(ClockRollbackDetected)
    for (const s of [storage, storage2, s3, s4]) await s.close()
  })

  it('clock.forward-jump-bounded：前跳 ⇒ 至多一个续约周期不可用、续约后返回新的墙钟读数；前跳后被校正回来 ⇒ 停摆到追上，其间重启判确定回拨', async () => {
    const { storage, file } = await openTempStorage('forward-jump')
    const { sources, state } = fakeSources(10_000_000)
    const clock = new LeaseClock({ storage, sources })
    await clock.start()
    expect(clock.now()).toBe(10_000_000)
    const jumped = 10_000_000 + 60_000
    state.wall = jumped
    expect(clock.now()).toBe('unavailable') // 越过了租约界
    vi.advanceTimersByTime(RENEW_PERIOD_MS)
    await settle(() => clock.now() !== 'unavailable')
    expect(clock.now()).toBe(jumped)

    // 校正回来：停摆到墙钟追上前跳期间最后的返回值
    state.wall = 10_000_100
    expect(clock.now()).toBe('unavailable')
    state.wall = jumped - 1
    expect(clock.now()).toBe('unavailable')
    // 其间丢弃实例、重启：落盘的 written_at 在墙钟前面 ⇒ 确定回拨，拒起
    const { storage: storage2 } = await openTempStorage('forward-jump', file)
    const restarted = new LeaseClock({
      storage: storage2,
      sources: fakeSources(10_000_100).sources,
    })
    await expect(restarted.start()).rejects.toBeInstanceOf(ClockRollbackDetected)
    state.wall = jumped
    expect(clock.now()).toBe(jumped)
    await clock.close()
    await storage.close()
    await storage2.close()
  })

  it('clock.startup-window-bounded：上一实例续约后崩溃；新实例以墙钟 = written_at 启动 ⇒ 恰好 L 不可用；以 written_at + 3 s 启动 ⇒ L − 3 s', async () => {
    for (const offset of [0, 3_000]) {
      const { storage, file } = await openTempStorage(`window-${offset}`)
      const a = fakeSources(11_000_000)
      const crashed = new LeaseClock({ storage, sources: a.sources })
      await crashed.start()
      a.state.wall = 11_001_000
      vi.advanceTimersByTime(RENEW_PERIOD_MS) // 一次续约：行 = (11_001_000 + L, 11_001_000)
      await settle(async () => (await readLease(storage))?.written_at === 11_001_000)
      const row = await readLease(storage)
      expect(row).toEqual({ lease_until: 11_001_000 + L, written_at: 11_001_000 })
      // 崩溃：丢弃实例，不撤除；它的续约定时器随之作废
      vi.clearAllTimers()
      const { storage: storage2 } = await openTempStorage(`window-${offset}`, file)
      const b = fakeSources(row!.written_at + offset)
      const restarted = new LeaseClock({ storage: storage2, sources: b.sources })
      await restarted.start()
      expect(restarted.now()).toBe('unavailable')
      b.state.wall = row!.lease_until - 1
      expect(restarted.now()).toBe('unavailable')
      b.state.wall = row!.lease_until
      expect(restarted.now()).toBe(row!.lease_until) // 等待恰为 L − offset
      await restarted.close()
      await storage.close()
      await storage2.close()
    }
  })

  it('撤除后 unavailable', async () => {
    const { storage } = await openTempStorage('closed')
    const clock = new LeaseClock({ storage, sources: fakeSources(12_000_000).sources })
    await clock.start()
    await clock.close()
    expect(clock.now()).toBe('unavailable')
    await storage.close()
  })
})

describe('LeaseClock · 装卸', () => {
  it('lifecycle.dispose-reclaims-lease：撤除后 lease_until 与 written_at 都等于 max(hw, 撤除时墙钟)，不是 +L', async () => {
    const { storage } = await openTempStorage('reclaim')
    const { sources, state } = fakeSources(13_000_000)
    const clock = new LeaseClock({ storage, sources })
    await clock.start()
    state.wall = 13_000_400
    clock.now()
    state.wall = 13_000_900 // 撤除时墙钟在 hw 之后
    await clock.close()
    expect(await readLease(storage)).toEqual({ lease_until: 13_000_900, written_at: 13_000_900 })
    await storage.close()
  })

  it('lifecycle.dispose-with-inflight-renewal：续约写在途时撤除 ⇒ 定时器已清、写按自己那次提交收场、旧 impl.now() 为 unavailable', async () => {
    const { storage: inner } = await openTempStorage('inflight')
    const { storage, state: control, hold } = controllableStorage(inner)
    const { sources, state } = fakeSources(14_000_000)
    const clock = new LeaseClock({ storage, sources })
    await clock.start()
    const release = hold()
    state.wall = 14_000_500
    vi.advanceTimersByTime(RENEW_PERIOD_MS) // 续约写被挡在存储门口
    const writes = control.writes
    let closed = false
    const closing = clock.close().then(() => {
      closed = true
    })
    expect(vi.getTimerCount()).toBe(0)
    expect(clock.now()).toBe('unavailable') // 停止准入先于实际定时续约排空
    await drain()
    expect(closed).toBe(false) // 撤除在等在途续约
    expect(control.writes).toBe(writes)
    release()
    await closing
    // 在途续约推到 14_000_500 + L 并提交；随后撤除按比较收回到 max(hw, w)
    expect(await readLease(inner)).toEqual({ lease_until: 14_000_500, written_at: 14_000_500 })
    expect(clock.now()).toBe('unavailable')
    await inner.close()
  })
})

describe('LeaseClock · 两实例', () => {
  it('从未推过租约的实例撤除时不收回别人的租约', async () => {
    const { storage, file } = await openTempStorage('two-instances')
    const a = new LeaseClock({ storage, sources: fakeSources(15_000_000).sources })
    await a.start() // lease_until = 15_000_000 + L
    const { storage: storage2 } = await openTempStorage('two-instances', file)
    // 墙钟等于 A 的 written_at（不算回拨），续约目标 ≤ A 的租约，守卫不写
    const b = new LeaseClock({ storage: storage2, sources: fakeSources(15_000_000).sources })
    await b.start()
    await b.close()
    expect((await readLease(storage))?.lease_until).toBe(15_000_000 + L) // A 的租约没被 B 缩回
    await a.close()
    await storage.close()
    await storage2.close()
  })
})

describe('migration.clock-lease-idempotent', () => {
  it('同一迁移跑两次不报错（sqlite 非事务 DDL 的幂等要求）', async () => {
    const { storage } = await openTempStorage('idempotent') // 已经跑过一次
    await storage.write(async tx => {
      await clockLeaseMigration.up(tx.db)
    })
    const tables = await storage.read(
      async tx =>
        (
          await sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'clock_lease'`.execute(
            tx.db,
          )
        ).rows,
    )
    expect(tables).toHaveLength(1)
    await storage.close()
  })
})

function clock_value(t: number | 'unavailable'): number {
  if (t === 'unavailable') throw new Error('expected a time')
  return t
}
