// 租约/时间策略；持久操作通过私有端口执行，算法依据见 SPEC.md。
import type { Clock, ClockCheckpoint, Instant } from '@omne-harness-lite/offer-expiry'
import { StorageDefect } from '@omne-harness-lite/storage'
import type { LeasePersistence } from './lease-persistence.ts'

export const LEASE_WIDTH_MS = 10_000

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

interface LeaseClockPolicyOptions {
  readonly persistence: LeasePersistence
  readonly sources: TimeSources | undefined
  readonly onRenewFailure: ((error: unknown) => void) | undefined
  readonly logger: ClockLogger | undefined
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** A returned wall time is covered by a confirmed durable reservation. */
export class LeaseClockPolicy implements Clock {
  readonly #persistence: LeasePersistence
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
  #stopping = false
  /** 当前一段「墙钟落后于 hw」开始时的 hw 与墙钟；只用于成对记日志。 */
  #behind: { readonly hw: number; readonly since: number } | undefined
  #inflight: Promise<void> | undefined
  #closing: Promise<void> | undefined
  #starting: Promise<void> | undefined

  constructor(options: LeaseClockPolicyOptions) {
    this.#persistence = options.persistence
    this.#sources = options.sources ?? systemTimeSources
    this.#onRenewFailure = options.onRenewFailure ?? (() => undefined)
    this.#logger = options.logger
  }

  async now(): Promise<Instant | 'unavailable'> {
    // A slow reservation can expire before its receipt arrives. Bound retries and resample.
    for (let attempt = 0; attempt <= 2; attempt += 1) {
      if (this.#latched || this.#stopping) return 'unavailable'
      const wall = this.#sources.wall()
      if (!this.#wallAvailable(wall)) return 'unavailable'
      if (wall <= this.#leaseUntil) {
        this.#hw = wall
        return wall as Instant
      }
      if (attempt === 2) return 'unavailable'
      try {
        await this.renew()
      } catch {
        return 'unavailable' // renew records the actual failure, and latches defects.
      }
    }
    return 'unavailable'
  }

  #wallAvailable(wall: number): boolean {
    if (!Number.isSafeInteger(wall) || wall < 0) return false
    if (wall < this.#hw) {
      if (this.#behind === undefined) {
        this.#behind = { hw: this.#hw, since: wall }
        this.#logger?.warn(
          'clock: wall clock %d is behind the latest time used %d; answering unavailable until it catches up',
          wall,
          this.#hw,
        )
      }
      return false
    }
    if (this.#behind !== undefined) {
      this.#logger?.info(
        'clock: wall clock caught up with %d after %d ms behind',
        this.#behind.hw,
        wall - this.#behind.since,
      )
      this.#behind = undefined
    }
    return true
  }

  /** 启动判定 + 首次续约；写失败或确定回拨即抛出（启动失败）。 */
  start(): Promise<void> {
    if (this.#stopping) return Promise.reject(new Error('clock is stopping'))
    return (this.#starting ??= this.#start())
  }

  async #start(): Promise<void> {
    const w = this.#sources.wall()
    const { row, fresh } = await this.#persistence.initialize(w, w + LEASE_WIDTH_MS)
    const current = this.#sources.wall()
    if (isRolledBack(current, row)) {
      this.#latched = true
      throw new ClockRollbackDetected(current, row.written_at)
    }
    // 接手既有行 ⇒ hw 起始为旧 lease_until：前一个实例可能已返回到那里（崩溃后快速重启时等至多 L）
    this.#hw = fresh ? w : row.lease_until
    this.#leaseUntil = row.lease_until
    this.#lastWritten = fresh ? row.lease_until : 0
    if (this.#stopping) return
    this.#latched = false
    try {
      await this.renew()
    } catch (error) {
      this.#latched = true // 启动失败的实例不再答任何时刻
      throw error
    }
  }

  async checkpoint(): Promise<ClockCheckpoint | 'unavailable'> {
    if ((await this.now()) === 'unavailable') return 'unavailable'
    await this.#inflight?.catch(() => undefined)
    if (this.#latched || this.#stopping) return 'unavailable'
    return { writtenAt: this.#hw as Instant, upperBound: this.#leaseUntil as Instant }
  }

  /** Coalesce concurrent reservation requests. Only confirmed writes extend the local bound. */
  renew(): Promise<void> {
    if (this.#latched || this.#stopping) return Promise.resolve()
    if (this.#inflight !== undefined) return this.#inflight
    const pending = this.#reserve()
      .catch((error: unknown) => {
        if (error instanceof StorageDefect) {
          this.#latched = true
          this.#logger?.error(
            'clock: lease renewal hit a storage defect; the clock is latched unavailable: %s',
            describe(error),
          )
        } else {
          this.#logger?.warn('clock: lease renewal failed: %s', describe(error))
        }
        this.#onRenewFailure(error)
        throw error
      })
      .finally(() => {
        this.#inflight = undefined
      })
    this.#inflight = pending
    return pending
  }

  async #reserve(): Promise<void> {
    const wall = this.#sources.wall()
    if (wall < this.#hw) return
    const target = wall + LEASE_WIDTH_MS
    if (!Number.isSafeInteger(target)) throw new StorageDefect('clock reservation overflow')
    if (target <= this.#leaseUntil) return
    const pushed = await this.#persistence.advance(wall, target)
    this.#leaseUntil = target
    if (pushed) this.#lastWritten = target
  }

  /**
   * 撤除：停止准入，等待所有申请终结，再回收本实例的租约。收回失败保留旧上界并报告。
   * 取 max(hw, w)：撤除时墙钟若正落后于 hw，写 w 会把「用过的最晚时刻」往回改，下一次启动就查不出这次回拨。
   */
  close(): Promise<void> {
    this.#stopping = true
    return (this.#closing ??= this.#close())
  }

  async #close(): Promise<void> {
    await this.#starting?.catch(() => undefined)
    await this.#inflight?.catch(() => undefined)
    if (this.#latched) return
    this.#latched = true
    const mine = this.#lastWritten
    if (mine === 0) return // 本实例没推过租约，无可收回，不动别人的
    const x = Math.max(this.#hw, this.#sources.wall())
    try {
      await this.#persistence.retract(mine, x)
    } catch (error) {
      this.#logger?.warn('clock: reclaiming the lease on dispose failed: %s', describe(error))
      this.#onRenewFailure(error)
    }
  }
}
