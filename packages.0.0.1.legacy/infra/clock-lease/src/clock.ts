// 独立构造门：公开面保持，连接同实例租约策略与借用的 SQL 后端。
import type { Storage } from '@omne-harness-lite/storage'
import { LeaseClockPolicy, type ClockLogger, type TimeSources } from './lease-policy.ts'
import { createLeasePersistence } from './lease-sql.ts'

export interface LeaseClockOptions {
  readonly storage: Storage
  readonly sources?: TimeSources
  /** 每一次续约或撤除写失败都回调一次（两型都回调）；日志级别的区分由 `logger` 承担。 */
  readonly onRenewFailure?: (error: unknown) => void
  /** 结构化记录：墙钟落后于 hw 的一段（进入 warn、离开 info）、续约失败（不可用 warn、缺陷 error）。 */
  readonly logger?: ClockLogger
}

export class LeaseClock extends LeaseClockPolicy {
  constructor(options: LeaseClockOptions) {
    super({
      persistence: createLeasePersistence(options.storage),
      sources: options.sources,
      onRenewFailure: options.onRenewFailure,
      logger: options.logger,
    })
  }
}
