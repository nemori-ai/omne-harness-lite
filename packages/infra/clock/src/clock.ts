import type { Kysely } from 'kysely'
import type { Clock, Instant } from '@omne-harness-lite/offer-expiry'
import { StorageDefect, UniqueViolation, type Storage } from '@omne-harness-lite/storage'
import {
  CLOCK_LEASE_TABLE,
  LEASE_WIDTH_MS,
  RENEW_PERIOD_MS,
  type ClockLeaseTable,
} from './lease.ts'

/** 启动时检出墙钟回拨：环境错误，让装配启动失败而不是半开。 */
export class ClockRollbackDetected extends Error {
  override readonly name = 'ClockRollbackDetected'
  constructor(
    readonly wall: number,
    readonly writtenAt: number,
  ) {
    super(`wall clock ${wall} is behind the last persisted clock write ${writtenAt}`)
  }
}

export interface TimeSources {
  /** 墙钟；本包是仓库里唯一允许调 Date.now() 的地方（取锚与回拨判定）。 */
  readonly wall: () => number
  /** 单调钟（纳秒）。 */
  readonly monotonic: () => bigint
}

export const systemTimeSources: TimeSources = {
  wall: () => Date.now(),
  monotonic: () => process.hrtime.bigint(),
}

export interface LeaseClockOptions {
  readonly storage: Storage
  readonly sources?: TimeSources
  readonly onRenewFailure?: (error: unknown) => void
}

/**
 * 单调钟锚定的墙钟 + 存储里写在前的租约。
 * - `now()` 同步：闩住 ⇒ 'unavailable'；推算值 > 已持久化 lease_until（续约没跟上）⇒ 'unavailable'；启动时落在旧租约窗口内 ⇒ 追上前 'unavailable'。
 * - 回拨（启动时 wall < written_at）⇒ 本实例永久 'unavailable'。
 */
export class LeaseClock implements Clock {
  readonly #storage: Storage
  readonly #sources: TimeSources
  readonly #onRenewFailure: (error: unknown) => void
  #anchorWall = 0
  #anchorMono = 0n
  #latched = true
  #floor = 0
  #leaseUntil = 0
  #lastWritten = 0
  #timer: NodeJS.Timeout | undefined
  #inflight: Promise<void> = Promise.resolve()
  #renewing = false

  constructor(options: LeaseClockOptions) {
    this.#storage = options.storage
    this.#sources = options.sources ?? systemTimeSources
    this.#onRenewFailure = options.onRenewFailure ?? (() => undefined)
  }

  #estimate(): number {
    return this.#anchorWall + Number((this.#sources.monotonic() - this.#anchorMono) / 1_000_000n)
  }

  now(): Instant | 'unavailable' {
    if (this.#latched) return 'unavailable'
    const t = this.#estimate()
    if (t < this.#floor || t > this.#leaseUntil) return 'unavailable'
    return t as Instant
  }

  /** 启动判定 + 首次租约写；写失败即抛出（启动失败）。 */
  async start(): Promise<void> {
    this.#anchorWall = this.#sources.wall()
    this.#anchorMono = this.#sources.monotonic()
    const wall = this.#anchorWall
    const { row, fresh } = await this.#storage.write(async tx => {
      const db = tx.db as Kysely<ClockLeaseTable>
      await tx.lockRow(CLOCK_LEASE_TABLE, { id: 1 })
      const existing = await db
        .selectFrom(CLOCK_LEASE_TABLE)
        .selectAll()
        .where('id', '=', 1)
        .executeTakeFirst()
      if (existing !== undefined) return { row: existing, fresh: false }
      try {
        await db
          .insertInto(CLOCK_LEASE_TABLE)
          .values({ id: 1, lease_until: wall + LEASE_WIDTH_MS, written_at: wall })
          .execute()
        return { row: { id: 1, lease_until: wall + LEASE_WIDTH_MS, written_at: wall }, fresh: true }
      } catch (error) {
        if (!(error instanceof UniqueViolation)) throw error
        const raced = await db
          .selectFrom(CLOCK_LEASE_TABLE)
          .selectAll()
          .where('id', '=', 1)
          .executeTakeFirstOrThrow()
        return { row: raced, fresh: false }
      }
    })
    if (wall < row.written_at) {
      // 确定回拨：上一次续约写下时的 now 比现在的墙钟还大——这是环境错误，启动失败，不半开
      this.#latched = true
      throw new ClockRollbackDetected(wall, row.written_at)
    }
    // 旧租约窗口内不服务：前一个实例可能已返回到它的 lease_until；首次建行没有前一个实例
    this.#floor = fresh ? wall : row.lease_until
    this.#leaseUntil = row.lease_until
    // 只记本实例自己写成功的值：首次建行是自己写的；接手既有行则从未写过，撤除时不收回别人的
    this.#lastWritten = fresh ? row.lease_until : 0
    this.#latched = false
    await this.renew()
    this.#timer = setInterval(() => {
      if (this.#renewing) return // 在途续约未回来：跳过本轮，不排队（续约周期 L/3 + 锁等待上限 5 s < L）
      this.#renewing = true
      this.#inflight = this.renew()
        .finally(() => {
          this.#renewing = false
        })
        .catch((error: unknown) => {
          if (error instanceof StorageDefect) this.#latched = true
          this.#onRenewFailure(error)
        })
    }, RENEW_PERIOD_MS)
    this.#timer.unref()
  }

  /** 续约：把 lease_until 推到 now + L（只增不减）；失败抛出，由调用方决定记日志。 */
  async renew(): Promise<void> {
    if (this.#latched) return
    const now = this.#estimate()
    const target = now + LEASE_WIDTH_MS
    const pushed = await this.#storage.write(async tx => {
      const db = tx.db as Kysely<ClockLeaseTable>
      await tx.lockRow(CLOCK_LEASE_TABLE, { id: 1 })
      const result = await db
        .updateTable(CLOCK_LEASE_TABLE)
        .set({ lease_until: target, written_at: now })
        .where('id', '=', 1)
        .where('lease_until', '<', target)
        .executeTakeFirst()
      return (result.numUpdatedRows ?? 0n) > 0n
    })
    if (pushed) {
      this.#leaseUntil = target
      this.#lastWritten = target
    } else if (target > this.#leaseUntil) {
      // 另一个实例已推得更远：本实例只能返回 ≤ 自己确知已持久化的界，不冒领对方的租约
      this.#leaseUntil = target
    }
  }

  /** 撤除：清定时器 → 等在途续约 → 比较并收回自己推出去的租约 → 闩住。收回写失败只报告不上抛。 */
  async close(): Promise<void> {
    if (this.#timer !== undefined) clearInterval(this.#timer)
    this.#timer = undefined
    await this.#inflight.catch(() => undefined)
    if (this.#latched) return
    this.#latched = true
    const now = this.#estimate()
    const mine = this.#lastWritten
    if (mine === 0) return // 本实例没推过租约，无可收回，不动别人的
    try {
      await this.#storage.write(async tx => {
        const db = tx.db as Kysely<ClockLeaseTable>
        await tx.lockRow(CLOCK_LEASE_TABLE, { id: 1 })
        await db
          .updateTable(CLOCK_LEASE_TABLE)
          .set({ lease_until: now, written_at: now })
          .where('id', '=', 1)
          .where('lease_until', '=', mine)
          .execute()
      })
    } catch (error) {
      this.#onRenewFailure(error)
    }
  }
}
