import type {
  UpgradeConfirmation,
  UpgradePending,
  UpgradeGuardHandle,
} from '@omne-harness-lite/storage'
// 升级守卫：装配造、经 config `upgrade.guard` 交给插件体、插件体取得排他之后附着；装配此后只对它调 confirm()／pending()。
// 守卫身份、确认与 pending 行为归包旁 SPEC.md。
// 守卫只排本实例与装配之间的先后，不承担跨实例的排他（那归属主锁）。

/** 启动失败的阶段：被占／恢复／核对／快照／迁移（R-U8；裁决账本 §十一）。 */
export type StorageStartupStage = 'occupied' | 'restore' | 'preflight' | 'snapshot' | 'migration'

/**
 * 属主实例的具名启动失败，不折成 `StorageUnavailable`（R-U8）。
 * `cause`：底层异常；核对不过时是那条核对返回的 `{ ok: false, check, detail }` 原样。
 * `snapshot`：恢复失败时快照（或临时名半成品）的位置——它没被删，下一次启动再试。
 */
export class StorageStartupFailure extends Error {
  override readonly name = 'StorageStartupFailure'
  readonly snapshot: string | undefined
  constructor(
    readonly stage: StorageStartupStage,
    message: string,
    options: { readonly cause?: unknown; readonly snapshot?: string } = {},
  ) {
    super(`storage startup failed at ${stage}: ${message}`, { cause: options.cause })
    this.snapshot = options.snapshot
  }
}

/** 守卫未附着任何在役实例：装配交错了对象、插件体没走到守卫、实例尚在启动，或已开始撤除。 */
export class UpgradeGuardNotAttached extends Error {
  override readonly name = 'UpgradeGuardNotAttached'
}

/** 附着记录背后的磁盘操作，由方言的属主站点提供。 */
export interface AttachmentSite {
  /** 快照位置；pg 没有快照，为 undefined。 */
  readonly location: string | undefined
  /** 磁盘上是否仍有快照或标记；判断不了（非「不存在」的 I/O 错误）时抛出。 */
  snapshotOnDisk(): Promise<boolean>
  /** 删快照或标记并让目录落盘；本来就不在 ⇒ false；删不掉 ⇒ 抛出，快照仍在。 */
  removeSnapshot(): Promise<boolean>
}

type Phase = 'starting' | 'serving' | 'disposing' | 'ended'

/** 一次附着：由插件体写，装配经守卫读。字段只在本包内改。 */
export class GuardAttachment {
  snapshotTaken = false
  migrated = false
  phase: Phase = 'starting'
  confirming: Promise<UpgradeConfirmation> | undefined
  confirmed: UpgradeConfirmation | undefined

  constructor(readonly site: AttachmentSite) {}

  get live(): boolean {
    return this.phase === 'starting' || this.phase === 'serving'
  }
}

let setAttachment: (guard: UpgradeGuard, attachment: GuardAttachment) => void
let getAttachment: (guard: UpgradeGuard) => GuardAttachment | undefined

export class UpgradeGuard implements UpgradeGuardHandle {
  #attachment: GuardAttachment | undefined

  static {
    setAttachment = (guard, attachment) => {
      guard.#attachment = attachment
    }
    getAttachment = guard => guard.#attachment
  }

  /**
   * 确认升级（R-U6）：删本实例拿的快照或标记、目录落盘之后才返回。
   * 未附着在役实例 ⇒ `UpgradeGuardNotAttached`；删除失败 ⇒ 抛出、快照仍在；同一附着上再调返回第一次的结果。
   */
  confirm(): Promise<UpgradeConfirmation> {
    const attachment = this.#attachment
    if (attachment === undefined)
      return Promise.reject(new UpgradeGuardNotAttached('upgrade guard was never attached'))
    if (attachment.phase !== 'serving')
      return Promise.reject(
        new UpgradeGuardNotAttached(
          attachment.phase === 'starting'
            ? 'the attached storage instance has not finished starting'
            : 'the attached storage instance is being disposed or has ended',
        ),
      )
    if (attachment.confirmed !== undefined) return Promise.resolve(attachment.confirmed)
    if (attachment.confirming !== undefined) return attachment.confirming
    const confirming = (async (): Promise<UpgradeConfirmation> => {
      const snapshotRemoved = attachment.snapshotTaken
        ? await attachment.site.removeSnapshot()
        : false
      const result: UpgradeConfirmation = Object.freeze({
        migrated: attachment.migrated,
        snapshotTaken: attachment.snapshotTaken,
        snapshotRemoved,
      })
      attachment.confirmed = result
      return result
    })()
    attachment.confirming = confirming
    // 撤除在开始时捕获在途确认并等它；这里只清引用，失败留给调用方
    confirming.then(
      () => (attachment.confirming = undefined),
      () => (attachment.confirming = undefined),
    )
    return confirming
  }

  /** 撤后核查（R-U8）：看磁盘，不看内存标志；不抛异常。临时名上的半成品不算快照。 */
  async pending(): Promise<UpgradePending> {
    const attachment = this.#attachment
    if (attachment === undefined) return 'never-attached'
    const location = attachment.site.location
    if (location === undefined) return 'clear'
    try {
      return (await attachment.site.snapshotOnDisk()) ? { pending: { location } } : 'clear'
    } catch {
      // 看不清磁盘就不说「clear」：说不出「已恢复」时按仍有待确认的升级报
      return { pending: { location } }
    }
  }
}

export function createUpgradeGuard(): UpgradeGuard {
  return new UpgradeGuard()
}

/** 只给本包插件体用（不经公开入口导出）：一个守卫同一时刻只配一个在役属主。 */
export function attachGuard(guard: UpgradeGuard, site: AttachmentSite): GuardAttachment {
  const current = attachmentOf(guard)
  if (current?.live === true)
    throw new Error(
      'invalid storage-sql config: upgrade.guard is already attached to another live storage instance',
    )
  const attachment = new GuardAttachment(site)
  setAttachment(guard, attachment)
  return attachment
}

/** 读附着记录同样只在本包内（插件体与包内测试），不进公开入口。 */
export function attachmentOf(guard: UpgradeGuard): GuardAttachment | undefined {
  return getAttachment(guard)
}
