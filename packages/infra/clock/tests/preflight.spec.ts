// clock.preflight-readonly：迁移前的只读回拨核对。三支都在真实的只读事务里跑，并断言没有任何写。
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PreflightResult, StorageInstance } from '@omne-harness-lite/storage'
import {
  StorageStartupFailure,
  createUpgradeGuard,
  openStorage,
} from '@omne-harness-lite/storage-sql'
import {
  CLOCK_LEASE_TABLE,
  ClockRollbackDetected,
  LEASE_WIDTH_MS,
  LeaseClock,
  clockPreflight,
} from '../src/index.ts'
import { fakeSources, migrations, openTempStorage, readLease, tempFile } from './support.ts'

async function runCheck(storage: StorageInstance, wall: number): Promise<PreflightResult> {
  const check = clockPreflight(fakeSources(wall).sources)
  return storage.read(async tx => {
    const { rows } = await sql<{
      name: string
    }>`SELECT name FROM sqlite_master WHERE type = 'table'`.execute(tx.db)
    return check({ tx, tables: new Set(rows.map(r => r.name)), appliedMigrations: [] })
  })
}

async function tableExists(storage: StorageInstance): Promise<boolean> {
  return storage.read(
    async tx =>
      (
        await sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ${CLOCK_LEASE_TABLE}`.execute(
          tx.db,
        )
      ).rows.length > 0,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('clock.preflight-readonly', () => {
  it('tables 不含 clock_lease ⇒ 通过（无历史），且不建表', async () => {
    const storage = await openStorage({ dialect: 'sqlite', file: tempFile('pf-none') })
    expect(await runCheck(storage, 1_000)).toEqual({ ok: true })
    expect(await tableExists(storage)).toBe(false)
    await storage.close()
  })

  it('有表无行 ⇒ 通过，且不建行', async () => {
    const { storage } = await openTempStorage('pf-empty')
    expect(await runCheck(storage, 1_000)).toEqual({ ok: true })
    expect(await readLease(storage)).toBeUndefined()
    await storage.close()
  })

  it('written_at 在墙钟之后 ⇒ ok: false、check 为回拨、detail 含两个时刻；行不变', async () => {
    const { storage } = await openTempStorage('pf-rolled')
    const clock = new LeaseClock({ storage, sources: fakeSources(2_000_000).sources })
    await clock.start()
    await clock.close() // 行 = (2_000_000, 2_000_000)
    const row = await readLease(storage)
    const result = await runCheck(storage, 1_995_000)
    expect(result).toMatchObject({ ok: false, check: 'clock-rolled-back' })
    expect(result.ok === false && result.detail).toContain('1995000')
    expect(result.ok === false && result.detail).toContain('2000000')
    expect(await readLease(storage)).toEqual(row)
    await storage.close()
  })

  it('与 start() 判定一致：同一组输入下 start() 抛出 ⇔ 核对不过（旧租约窗口里两边都放行）', async () => {
    const { storage, file } = await openTempStorage('pf-consistent')
    const crashed = new LeaseClock({ storage, sources: fakeSources(3_000_000).sources })
    await crashed.start() // 行 = (3_000_000 + L, 3_000_000)，丢弃不撤除
    vi.clearAllTimers()
    const walls = [2_999_999, 3_000_000, 3_000_000 + LEASE_WIDTH_MS - 1, 3_000_000 + LEASE_WIDTH_MS]
    for (const wall of walls) {
      const row = await readLease(storage)
      const refused = (await runCheck(storage, wall)).ok === false
      const { storage: other } = await openTempStorage('pf-consistent', file)
      const probe = new LeaseClock({ storage: other, sources: fakeSources(wall).sources })
      const threw = await probe.start().then(
        () => false,
        (error: unknown) => error instanceof ClockRollbackDetected,
      )
      await probe.close()
      await other.close()
      expect(threw).toBe(refused)
      expect(refused).toBe(wall < row!.written_at)
    }
    await storage.close()
  })

  it('放进 storage-sql 的 upgrade.checks：回拨 ⇒「核对」阶段启动失败，detail 原样', async () => {
    const file = tempFile('pf-owner')
    const guard = createUpgradeGuard()
    const first = await openStorage({
      dialect: 'sqlite',
      file,
      migrations,
      upgrade: { checks: [clockPreflight(fakeSources(4_000_000).sources)], guard },
    })
    const clock = new LeaseClock({ storage: first, sources: fakeSources(4_000_000).sources })
    await clock.start()
    await clock.close()
    await guard.confirm()
    await first.close()

    const error = await openStorage({
      dialect: 'sqlite',
      file,
      migrations,
      upgrade: {
        checks: [clockPreflight(fakeSources(3_990_000).sources)],
        guard: createUpgradeGuard(),
      },
    }).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(StorageStartupFailure)
    expect((error as StorageStartupFailure).stage).toBe('preflight')
    expect((error as StorageStartupFailure).message).toContain('clock-rolled-back')
  })
})
