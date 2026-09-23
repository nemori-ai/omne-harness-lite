// clock 的实现：每次 now() 现读墙钟、比对本实例用过的最晚时刻 hw；存储里写在前的租约给跨重启的「不后退」。
// 设计：.meta_harness/design/realization/packages/infra/clock/design.md「运行中回拨」「状态、并发与失败映射」「成对的装载与撤除」。
import type { Kysely } from 'kysely'
import type { Clock, Instant } from '@omne-harness-lite/offer-expiry'
import { StorageDefect, UniqueViolation, type Storage } from '@omne-harness-lite/storage'
import {
  CLOCK_LEASE_TABLE,
  LEASE_WIDTH_MS,
  RENEW_PERIOD_MS,
  type ClockLeaseTable,
} from './lease.ts'

/** 启动时检出确定回拨：环境错误，让装配启动失败而不是半开。 */
export class ClockRollbackDetected extends Error {
  override readonly name = 'ClockRollbackDetected'
  constructor(
    readonly wall: number,
    readonly writtenAt: number,
  ) {
    super(`wall clock ${wall} is behind the last persisted clock write ${writtenAt}`)
  }
}

/**
 * 确定回拨的判据（启动判定与迁移前只读核对共用这一个纯函数）：此刻墙钟早于上一次写下时的 now。
 * 落在 `[written_at, lease_until)` 里的是崩溃后快速重启，不算回拨——那一段由 hw 等到追上。
 */
export function isRolledBack(wall: number, row: { readonly written_at: number }): boolean {
  return wall < row.written_at
}

export interface TimeSources {
  /** 墙钟；本包是仓库里唯一允许调 Date.now() 的地方（每次 now()、启动判定、续约、迁移前核对都现读它）。 */
  readonly wall: () => number
  /**
   * 单调钟（纳秒）。now() 改为现读墙钟之后不再参与推算；字段保留，注入面只增不改（阶段 2 计划 I-9）。
   */
  readonly monotonic: () => bigint
}

export const systemTimeSources: TimeSources = {
  wall: () => Date.now(),
  monotonic: () => process.hrtime.bigint(),
}

/** 与 Cordis `ctx.logger` 同形的最小日志面（printf 风格）。 */
export interface ClockLogger {
  info(format: string, ...args: unknown[]): void
  warn(format: string, ...args: unknown[]): void
  error(format: string, ...args: unknown[]): void
}

export interface LeaseClockOptions {
  readonly storage: Storage
  readonly sources?: TimeSources
  /** 每一次续约或撤除写失败都回调一次（两型都回调）；日志级别的区分由 `logger` 承担。 */
  readonly onRenewFailure?: (error: unknown) => void
  /** 结构化记录：墙钟落后于 hw 的一段（进入 warn、离开 info）、续约失败（不可用 warn、缺陷 error）。 */
  readonly logger?: ClockLogger
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * `now()` 的判定次序（同步、不抛异常）：① 闩住 ⇒ 'unavailable'；② 现读墙钟 w；③ w < hw ⇒ 'unavailable'
 * （启动时的旧租约窗口，或运行中回拨）；④ w > leaseUntil ⇒ 'unavailable'（租约没续上）；⑤ hw = w，返回 w。
 * 不变量：任何返回值 ≥ 此前任何返回值（③⑤）；任何返回值 ≤ 当时已持久化的 lease_until（④）。
 */
export class LeaseClock implements Clock {
  readonly #storage: Storage
  readonly #sources: TimeSources
  readonly #onRenewFailure: (error: unknown) => void
  readonly #logger: ClockLogger | undefined
  /** 本实例用过的最晚时刻。 */
  #hw = 0
  /** 本实例确知已持久化的界。 */
  #leaseUntil = 0
  /** 本实例自己最后一次写成功的 lease_until；接手既有行时为 0（撤除只收回它）。 */
  #lastWritten = 0
  #latched = true
  /** 当前一段「墙钟落后于 hw」开始时的 hw 与墙钟；只用于成对记日志。 */
  #behind: { readonly hw: number; readonly since: number } | undefined
  #timer: NodeJS.Timeout | undefined
  #inflight: Promise<void> = Promise.resolve()
  #renewing = false

  constructor(options: LeaseClockOptions) {
    this.#storage = options.storage
    this.#sources = options.sources ?? systemTimeSources
    this.#onRenewFailure = options.onRenewFailure ?? (() => undefined)
    this.#logger = options.logger
  }

  now(): Instant | 'unavailable' {
    if (this.#latched) return 'unavailable'
    const w = this.#sources.wall()
    if (w < this.#hw) {
      if (this.#behind === undefined) {
        this.#behind = { hw: this.#hw, since: w }
        this.#logger?.warn(
          'clock: wall clock %d is behind the latest time used %d; answering unavailable until it catches up',
          w,
          this.#hw,
        )
      }
      return 'unavailable'
    }
    if (this.#behind !== undefined) {
      this.#logger?.info(
        'clock: wall clock caught up with %d after %d ms behind',
        this.#behind.hw,
        w - this.#behind.since,
      )
      this.#behind = undefined
    }
    if (w > this.#leaseUntil) return 'unavailable'
    this.#hw = w
    return w as Instant
  }

  /** 启动判定 + 首次续约；写失败或确定回拨即抛出（启动失败）。 */
  async start(): Promise<void> {
    const w = this.#sources.wall()
    const { row, fresh } = await this.#storage.write(async tx => {
      const db = tx.db as Kysely<ClockLeaseTable>
      await tx.lockRow(CLOCK_LEASE_TABLE, { id: 1 })
      const existing = await db
        .selectFrom(CLOCK_LEASE_TABLE)
        .selectAll()
        .where('id', '=', 1)
        .executeTakeFirst()
      if (existing !== undefined) return { row: existing, fresh: false }
      const inserted = { id: 1, lease_until: w + LEASE_WIDTH_MS, written_at: w }
      try {
        await db.insertInto(CLOCK_LEASE_TABLE).values(inserted).execute()
        return { row: inserted, fresh: true }
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
    if (isRolledBack(w, row)) {
      this.#latched = true
      throw new ClockRollbackDetected(w, row.written_at)
    }
    // 接手既有行 ⇒ hw 起始为旧 lease_until：前一个实例可能已返回到那里（崩溃后快速重启时等至多 L）
    this.#hw = fresh ? w : row.lease_until
    this.#leaseUntil = row.lease_until
    this.#lastWritten = fresh ? row.lease_until : 0
    this.#latched = false
    try {
      await this.renew()
    } catch (error) {
      this.#latched = true // 启动失败的实例不再答任何时刻
      throw error
    }
    this.#timer = setInterval(() => this.#tick(), RENEW_PERIOD_MS)
    this.#timer.unref()
  }

  /** 定时续约一轮：在途续约未回来则跳过本轮，不排队（续约周期 L/3 + 锁等待上限 5 s < L）。 */
  #tick(): void {
    if (this.#renewing) return
    this.#renewing = true
    this.#inflight = this.renew()
      .catch((error: unknown) => {
        if (error instanceof StorageDefect) {
          // 表不在、列不对：重试也不会变；定时器没有调用方可上抛，闩住是唯一不吞错的做法
          this.#latch()
          this.#logger?.error(
            'clock: lease renewal hit a storage defect; the clock is latched unavailable: %s',
            describe(error),
          )
        } else {
          this.#logger?.warn('clock: lease renewal failed: %s', describe(error))
        }
        this.#onRenewFailure(error)
      })
      .finally(() => {
        this.#renewing = false
      })
  }

  #latch(): void {
    this.#latched = true
    if (this.#timer !== undefined) clearInterval(this.#timer)
    this.#timer = undefined
  }

  /** 续约：现读墙钟 w，把 lease_until 推到 w + L（只增不减）；失败抛出，由调用方决定收场。 */
  async renew(): Promise<void> {
    if (this.#latched) return
    const w = this.#sources.wall()
    const target = w + LEASE_WIDTH_MS
    const pushed = await this.#storage.write(async tx => {
      const db = tx.db as Kysely<ClockLeaseTable>
      await tx.lockRow(CLOCK_LEASE_TABLE, { id: 1 })
      const result = await db
        .updateTable(CLOCK_LEASE_TABLE)
        .set({ lease_until: target, written_at: w })
        .where('id', '=', 1)
        .where('lease_until', '<', target)
        .executeTakeFirst()
      return (result.numUpdatedRows ?? 0n) > 0n
    })
    if (pushed) {
      this.#leaseUntil = target
      this.#lastWritten = target
    } else if (target > this.#leaseUntil) {
      // 行上的界已 ≥ target（另一个写者推得更远）：本实例只认到 target 为止，不冒领对方的租约
      this.#leaseUntil = target
    }
  }

  /**
   * 撤除：清定时器 → 等在途续约 → 比较并收回自己推出去的租约到 max(hw, w) → 闩住。收回写失败只报告不上抛。
   * 取 max(hw, w)：撤除时墙钟若正落后于 hw，写 w 会把「用过的最晚时刻」往回改，下一次启动就查不出这次回拨。
   */
  async close(): Promise<void> {
    if (this.#timer !== undefined) clearInterval(this.#timer)
    this.#timer = undefined
    await this.#inflight
    if (this.#latched) return
    this.#latched = true
    const mine = this.#lastWritten
    if (mine === 0) return // 本实例没推过租约，无可收回，不动别人的
    const x = Math.max(this.#hw, this.#sources.wall())
    try {
      await this.#storage.write(async tx => {
        const db = tx.db as Kysely<ClockLeaseTable>
        await tx.lockRow(CLOCK_LEASE_TABLE, { id: 1 })
        await db
          .updateTable(CLOCK_LEASE_TABLE)
          .set({ lease_until: x, written_at: x })
          .where('id', '=', 1)
          .where('lease_until', '=', mine)
          .execute()
      })
    } catch (error) {
      this.#logger?.warn('clock: reclaiming the lease on dispose failed: %s', describe(error))
      this.#onRenewFailure(error)
    }
  }
}
