// 启动失败的具名阶段（design「状态、并发与失败映射」「启动失败」一段）：告诉运维者差的是哪一样（PF-017 §6.6）。
// 说明里只写变量名、插件名、迁移名与快照位置，不写任何 config 值或 PEM 文本（入口契约 S-29）。

/**
 * - `config`：环境变量或文件的来源缺失、二义、读不到、权限过宽、文本解析不了（准备阶段，尚未创建运行资源）；
 * - `key-pairing`：部署密钥形状不对或两对不配对（准备阶段，尚未创建运行资源）；
 * - `occupied`／`restore`／`preflight`／`snapshot`／`migration`：storage-sql 属主路径的具名阶段（R-U8）；
 * - `storage-open`：存储插件以别的异常失败（库或锁文件打不开等环境错误，裁决账本 §十三之二 W1-A Q1）；
 * - `manifest`：树、公共插件、依赖顺序、角色政策或装载资格不符合采用协议；
 * - `plugin`：某行的 Config 校验或插件体失败（`item` 为合法行 id）；
 * - `clock-unreadable`：入口层在插件体里等钟超界；
 * - `upgrade-confirm`：`guard.confirm()` 抛出（含守卫没挂上）或 `snapshotTaken ⇒ snapshotRemoved` 不成立；
 * - `serving-timeout`：确认并兑现 EntryOpening 之后有界地等不到 `serving`（缺口 U-4，快照已确认、不恢复）；
 * - `upgrade-unconfirmed`：逆序撤完之后 `guard.pending()` 仍报告快照或标记待确认；可能恢复失败、尚未尝试恢复或磁盘观察失败（R-U8）。
 */
export type HostStartupStage =
  | 'config'
  | 'key-pairing'
  | 'occupied'
  | 'restore'
  | 'preflight'
  | 'snapshot'
  | 'migration'
  | 'storage-open'
  | 'manifest'
  | 'plugin'
  | 'clock-unreadable'
  | 'upgrade-confirm'
  | 'serving-timeout'
  | 'upgrade-unconfirmed'

export interface HostStartupFailureOptions {
  /** 点名的那一项：环境变量名、合法行 id、已知角色或密钥对名。 */
  readonly item?: string
  /** 未确认的升级快照或标记位置；不据此判定是否仍存在或是否尝试过恢复。 */
  readonly snapshot?: string
  readonly cause?: unknown
}

/** `boot()` 的唯一拒绝形状：阶段 + 点名的项 + 不含值的说明。 */
export class HostStartupFailure extends Error {
  override readonly name = 'HostStartupFailure'
  readonly item: string | undefined
  readonly snapshot: string | undefined

  constructor(
    readonly stage: HostStartupStage,
    message: string,
    options: HostStartupFailureOptions = {},
  ) {
    super(`tenancy-host startup failed at ${stage}: ${message}`, { cause: options.cause })
    this.item = options.item
    this.snapshot = options.snapshot
  }
}

/** 取一个抛出值的类型名与消息，用在说明里；不展开 cause 链（那里可能有路径或值）。 */
export function describeThrown(error: unknown): {
  readonly type: string
  readonly message: string
} {
  if (error instanceof Error) return { type: error.name, message: error.message }
  return { type: typeof error, message: 'non-error value thrown' }
}
