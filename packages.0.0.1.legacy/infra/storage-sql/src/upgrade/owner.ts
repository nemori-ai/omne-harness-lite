// 属主实例（开了升级守卫的实例）的插件体路径与撤除收尾；方言差异在 OwnerSite 里。
// 属主排他、迁移前核对与升级快照责任归包旁 SPEC.md。
//   ① 取排他，附着守卫   ② 清半成品、恢复遗留快照   ③ 库不存在 ⇒ 落「库不存在」标记   ④ 打开句柄、ping
//   ⑤ 一次只读事务：读表清单与迁移登记，跑 checks   ⑥ 有待跑迁移且还没有快照 ⇒ 建一致快照   ⑦ 迁移   ⑧ 交出实例
//   撤除：守卫置为已撤、关准入 → 等在途事务与在途确认 → 关句柄 → 磁盘上仍有快照 ⇒ 恢复 → 放排他
import { Migrator, type MigrationProvider } from 'kysely/migration'
import {
  StorageDefect,
  type PreflightCheck,
  type PreflightResult,
} from '@omne-harness-lite/storage'
import {
  ping,
  retainStorageHandles,
  SqlStorage,
  type DialectHandles,
  type StorageTeardown,
} from '../provider.ts'
import { readMigrationRegistry, MIGRATION_REGISTRY_TABLE } from './registry.ts'
import { SnapshotEngine } from '../maintenance/engine.ts'
import { WorkspaceAcquisitionIncomplete } from '../maintenance/workspace.ts'
import { sqliteSnapshotProducer } from '../maintenance/source.ts'
import {
  attachGuard,
  StorageStartupFailure,
  type AttachmentSite,
  type GuardAttachment,
  type UpgradeGuard,
} from './guard.ts'

/** 与 Cordis `ctx.logger` 同形的最小日志面（printf 风格）。 */
export interface StorageSqlLogger {
  info(format: string, ...args: unknown[]): void
  warn(format: string, ...args: unknown[]): void
  error(format: string, ...args: unknown[]): void
}

export interface OwnerLock {
  release(): Promise<void>
}

/** 一种方言上的属主机制：排他、遗留处理、快照与恢复。pg 没有快照，相应各步是空操作。 */
export interface OwnerSite extends AttachmentSite {
  /** Additional native resources used by the site, including upgrade backups. */
  readonly resourcesClosed?: () => boolean
  /** ①：拿不到 ⇒ `StorageStartupFailure('occupied')`；锁本身打不开 ⇒ 原样抛出。 */
  acquire(): Promise<OwnerLock>
  /** ②：删临时名上的半成品；磁盘上有快照 ⇒ 恢复。失败 ⇒ `StorageStartupFailure('restore')`，带位置。 */
  recoverLeftovers(): Promise<void>
  /** ③：库不存在 ⇒ 落「库不存在」标记并落盘，返回 true。失败 ⇒ `StorageStartupFailure('snapshot')`。 */
  markIfAbsent(): Promise<boolean>
  /** ⑥：建一致快照；方言没有快照时缺席。失败 ⇒ 删半成品、`StorageStartupFailure('snapshot')`。 */
  readonly takeSnapshot?: () => Promise<void>
  /** R-U4：按快照或标记恢复；失败原样抛出（调用方决定阶段与收场）。 */
  restore(): Promise<void>
}

/** 只给包内测试截住启动的各个时点；产品路径不传。 */
export interface UpgradeHooks {
  afterAttach?(): void | Promise<void>
  /** ③之后、④打开句柄之前。 */
  beforeOpen?(): void | Promise<void>
  /** ④：换掉刚构造、尚未使用的句柄（注入读失败用）。 */
  interceptHandles?(handles: DialectHandles): DialectHandles
  beforePreflight?(handles: DialectHandles): void | Promise<void>
  beforeMigrate?(): void | Promise<void>
  /** sqlite：临时名已写好、落盘，改名成快照之前。 */
  beforeSnapshotRename?(): void | Promise<void>
  /** sqlite：恢复时附属文件已删并落盘，替换（或删标记）之前。 */
  afterSidecarsRemoved?(): void | Promise<void>
}

export interface OwnedStorageInput {
  readonly logger?: StorageSqlLogger
  readonly site: OwnerSite
  readonly guard: UpgradeGuard
  readonly checks: readonly PreflightCheck[]
  readonly migrations: MigrationProvider
  readonly openHandles: () => DialectHandles
  readonly hooks: UpgradeHooks
  readonly maintenance?: {
    readonly sourceFile: string
    readonly workDirectory: string
    readonly onClosed: (status: 'clean' | 'error') => void
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function destroyHandles(handles: DialectHandles): Promise<void> {
  try {
    await handles.writeDb.destroy()
  } finally {
    await handles.readDb.destroy()
  }
  if (handles.resourcesClosed?.() === false)
    throw new StorageDefect('native storage handles remain open')
}

/** ⑤：一次只读事务里先读表清单与迁移登记，再逐条跑核对；读失败与核对不过都是「核对」阶段。 */
async function preflight(
  storage: SqlStorage,
  handles: DialectHandles,
  checks: readonly PreflightCheck[],
): Promise<readonly string[]> {
  let outcome: {
    readonly applied: readonly string[]
    readonly rejected: PreflightResult | undefined
  }
  try {
    outcome = await storage.read(async tx => {
      const tables: ReadonlySet<string> = new Set(await handles.listTables(tx.db))
      const applied = tables.has(MIGRATION_REGISTRY_TABLE)
        ? Object.freeze(await readMigrationRegistry(tx.db))
        : Object.freeze([] as string[])
      for (const check of checks) {
        const result = await check({ tx, tables, appliedMigrations: applied })
        if (!result.ok) return { applied, rejected: result }
      }
      return { applied, rejected: undefined }
    })
  } catch (error) {
    throw new StorageStartupFailure('preflight', `preflight read failed: ${describe(error)}`, {
      cause: error,
    })
  }
  const rejected = outcome.rejected
  if (rejected !== undefined && !rejected.ok) {
    throw new StorageStartupFailure(
      'preflight',
      `check "${rejected.check}" refused: ${rejected.detail}`,
      { cause: rejected },
    )
  }
  return outcome.applied
}

/**
 * 属主实例的启动：①～⑧。返回的实例 `close()` 即撤除收尾；任一步失败 ⇒ 关句柄 ⇒ 磁盘上有快照或标记即恢复 ⇒ 放排他 ⇒ 抛出。
 * 恢复本身失败时抛 `StorageStartupFailure('restore')`，快照不删，带位置。
 */
export async function openOwnedStorage(input: OwnedStorageInput): Promise<SqlStorage> {
  const { site, hooks } = input
  const lock = await site.acquire()
  let attachment: GuardAttachment
  try {
    attachment = attachGuard(input.guard, site)
  } catch (error) {
    await lock.release()
    throw error
  }

  let handles: DialectHandles | undefined
  let snapshots: SnapshotEngine | undefined
  try {
    await hooks.afterAttach?.()
    await site.recoverLeftovers()
    if (await site.markIfAbsent()) attachment.snapshotTaken = true

    await hooks.beforeOpen?.()
    const opened = input.openHandles()
    handles = hooks.interceptHandles?.(opened) ?? opened
    await ping(handles.writeDb)
    await ping(handles.readDb)

    if (input.maintenance !== undefined)
      snapshots = await SnapshotEngine.open(
        input.maintenance.workDirectory,
        sqliteSnapshotProducer(input.maintenance.sourceFile),
      )
    const storage = new SqlStorage(
      handles,
      ownerTeardown(site, attachment, lock),
      input.logger,
      snapshots === undefined || input.maintenance === undefined
        ? undefined
        : {
            engine: snapshots,
            confirmed: () => attachment.phase === 'serving' && attachment.confirmed !== undefined,
            onClosed: input.maintenance.onClosed,
          },
    )
    await hooks.beforePreflight?.(handles)
    const applied = await preflight(storage, handles, input.checks)

    await migrateOwnedStorage(input, handles, attachment, applied)

    attachment.phase = 'serving'
    return storage
  } catch (error) {
    attachment.phase = 'ended'
    return cleanupFailedOpen(error, input, handles, lock, snapshots)
  }
}

async function migrateOwnedStorage(
  input: OwnedStorageInput,
  handles: DialectHandles,
  attachment: GuardAttachment,
  applied: readonly string[],
): Promise<void> {
  const { site, hooks } = input
  let known: string[]
  try {
    known = Object.keys(await input.migrations.getMigrations())
  } catch (error) {
    throw new StorageStartupFailure(
      'migration',
      `migrations could not be listed: ${describe(error)}`,
      { cause: error },
    )
  }
  // 最低防线（架构评审 N-1）：登记里有本次 migrations 不认识的名字 ⇒ 这份数据来自更新的或别的版本，
  // 在核对阶段具名失败，不拍快照、不跑迁移。次序是否为前缀由装配的数据格式核对判。
  const beyond = applied.filter(name => !known.includes(name))
  if (beyond.length > 0) {
    throw new StorageStartupFailure(
      'preflight',
      `check "migration-registry-beyond-known": ${beyond.length} applied migration(s) unknown to this version, first "${beyond[0]}"`,
      {
        cause: { ok: false, check: 'migration-registry-beyond-known', detail: beyond.join(', ') },
      },
    )
  }
  const pending = known.filter(name => !applied.includes(name))
  if (pending.length > 0 && !attachment.snapshotTaken && site.takeSnapshot !== undefined) {
    await site.takeSnapshot()
    attachment.snapshotTaken = true
  }

  await hooks.beforeMigrate?.()
  const migrator = new Migrator({ db: handles.writeDb, provider: input.migrations })
  const { error, results } = await migrator.migrateToLatest()
  if (results?.some(result => result.status === 'Success') === true) attachment.migrated = true
  if (error !== undefined) {
    const failed = results?.find(result => result.status === 'Error')?.migrationName
    throw new StorageStartupFailure(
      'migration',
      failed === undefined
        ? `migrations could not run: ${describe(error)}`
        : `migration "${failed}" failed: ${describe(error)}`,
      { cause: error },
    )
  }
}

/** Close the failed startup prefix without releasing ownership of surviving resources. */
async function cleanupFailedOpen(
  error: unknown,
  input: OwnedStorageInput,
  handles: DialectHandles | undefined,
  lock: OwnerLock,
  snapshots: SnapshotEngine | undefined,
): Promise<never> {
  if (error instanceof WorkspaceAcquisitionIncomplete) {
    if (handles !== undefined) retainStorageHandles(handles)
    input.maintenance?.onClosed('error')
    throw new StorageStartupFailure(
      'preflight',
      'maintenance initialization cleanup incomplete; source ownership is retained',
      { cause: error },
    )
  }
  if (snapshots !== undefined) {
    try {
      await snapshots.close()
    } catch (closeError) {
      input.maintenance?.onClosed('error')
      if (!snapshots.ownershipReleased) {
        if (handles !== undefined) retainStorageHandles(handles)
        throw new StorageStartupFailure(
          'preflight',
          'maintenance startup cleanup failed; ownership is retained',
          { cause: new AggregateError([error, closeError]) },
        )
      }
    }
  }
  throw await abortStartup(error, input.site, handles, lock)
}

/** 启动失败的收尾：关句柄 → 有快照或标记即恢复 → 放排他；返回要抛出的失败。 */
async function abortStartup(
  failure: unknown,
  site: OwnerSite,
  handles: DialectHandles | undefined,
  lock: OwnerLock,
): Promise<unknown> {
  let result = failure
  // Do not restore data or release source ownership while a native handle survives.
  if (handles !== undefined) {
    try {
      await destroyHandles(handles)
    } catch (closeError) {
      retainStorageHandles(handles)
      return new StorageStartupFailure(
        'preflight',
        'startup handles did not close; ownership is retained',
        { cause: new AggregateError([failure, closeError]) },
      )
    }
  }
  if (site.resourcesClosed?.() === false)
    return new StorageStartupFailure(
      'snapshot',
      'upgrade snapshot handles remain open; ownership is retained',
      { cause: failure },
    )
  try {
    // ②自己的恢复已经失败过：不在同一次启动里再动那份快照
    const restoreAlreadyFailed =
      failure instanceof StorageStartupFailure && failure.stage === 'restore'
    if (!restoreAlreadyFailed && (await site.snapshotOnDisk())) {
      try {
        await site.restore()
      } catch (restoreError) {
        result = new StorageStartupFailure(
          'restore',
          `startup failed (${describe(failure)}) and restoring the upgrade snapshot failed: ${describe(restoreError)}`,
          {
            cause: restoreError,
            ...(site.location === undefined ? {} : { snapshot: site.location }),
          },
        )
      }
    }
  } catch (error) {
    result = new AggregateError([result, error], 'startup failure and recovery inspection failed')
  }
  try {
    await lock.release()
  } catch (error) {
    return new AggregateError([result, error], 'startup cleanup and owner lock release failed')
  }
  return result
}

/**
 * 撤除收尾（design.md「成对的装载与撤除」末两行）：①守卫置为已撤 …… ④恢复 ⑤放排他。
 * ④失败 ⇒ 快照不删、照样放排他，再以带位置的错误拒绝 `close()`——内核对 disposer 的异常只记日志不上抛，
 * 插件的 disposer 自己记 error，装配经 `guard.pending()` 回头看磁盘。
 */
function ownerTeardown(
  site: OwnerSite,
  attachment: GuardAttachment,
  lock: OwnerLock,
): StorageTeardown {
  return {
    begin() {
      attachment.phase = 'disposing'
      return attachment.confirming
    },
    async finish(handlesClosed) {
      if (!handlesClosed || site.resourcesClosed?.() === false)
        throw new StorageDefect('native resources remain open; ownership is retained')
      let outcome: { ok: true } | { ok: false; error: unknown } = { ok: true }
      try {
        // 句柄没关干净就不替换库文件：快照留在磁盘上，下一次启动的②恢复它
        if (handlesClosed && (await site.snapshotOnDisk())) await site.restore()
      } catch (error) {
        outcome = {
          ok: false,
          error: new Error(
            `restoring the unconfirmed upgrade snapshot on dispose failed; snapshot kept at ${site.location ?? '(none)'}: ${describe(error)}`,
            { cause: error },
          ),
        }
      } finally {
        attachment.phase = 'ended'
      }
      try {
        await lock.release()
      } catch (error) {
        if (!outcome.ok)
          throw new AggregateError(
            [outcome.error, error],
            'snapshot recovery and owner lock release failed',
          )
        throw error
      }
      if (!outcome.ok) throw outcome.error
    },
  }
}
