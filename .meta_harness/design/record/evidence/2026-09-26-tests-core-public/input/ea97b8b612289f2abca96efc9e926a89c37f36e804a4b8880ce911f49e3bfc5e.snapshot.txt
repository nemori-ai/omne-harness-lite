// sqlite 上的属主机制：库旁锁文件上的排他、在线备份建一致快照、「库不存在」标记、恢复次序。
// 取证（Node 24.18 `node:sqlite`，2026-09-23，见包内测试与交付记录）：
// - 同一进程两个 DatabaseSync 句柄对同一文件 `BEGIN EXCLUSIVE`：后者得 SQLITE_BUSY（互斥）；跨进程同样，持有者被 SIGKILL 后即可取得。
// - `backup(source, path)` 读穿预写日志（只在预写日志里的提交进了快照）；目标是有效库 ⇒ 覆盖；目标是半成品 ⇒
//   SQLITE_NOTADB／SQLITE_CORRUPT 失败。`VACUUM INTO` 对非空目标报 "output file already exists"。所以②删半成品而不是忽略。
import { DatabaseSync, backup } from 'node:sqlite'
import { chmod, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { StorageStartupFailure } from '../upgrade/guard.ts'
import { exists, fsyncDirectory, fsyncFile, readHead, removeIfExists } from '../upgrade/files.ts'
import type { OwnerLock, OwnerSite, StorageSqlLogger, UpgradeHooks } from '../upgrade/owner.ts'
import { isSqliteBusy } from './errors.ts'

/** 快照位置上的「库不存在」标记：内容固定；有效的 sqlite 库总以 `SQLite format 3\0` 开头，二者不会混淆。 */
const ABSENT_MARKER = Buffer.from(
  'omne-harness-lite storage-sql upgrade marker: the database did not exist before this upgrade\n',
  'utf8',
)
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'latin1')

/**
 * 持锁句柄钉在模块里，直到显式放锁：没人引用的 DatabaseSync 被垃圾回收时会关闭并放掉文件锁（取证：Node 24.18，
 * `--expose-gc` 下丢弃引用再 gc() 后另一句柄即可取得）。锁只随 release() 或进程死亡结束，不交给 GC。
 */
const heldOwnerLocks = new Set<DatabaseSync>()

export interface SqliteOwnerPaths {
  readonly db: string
  readonly directory: string
  readonly sidecars: readonly string[]
  readonly lock: string
  readonly snapshot: string
  readonly snapshotTemp: string
  readonly snapshotTempSidecars: readonly string[]
}

/** 全部位置由 `file` 派生、固定不变（②据此找得到半成品）；与库同目录，改名才原子。 */
export function sqliteOwnerPaths(file: string): SqliteOwnerPaths {
  const db = resolve(file)
  const snapshotTemp = `${db}.upgrade-snapshot.tmp`
  return {
    db,
    directory: dirname(db),
    sidecars: [`${db}-wal`, `${db}-shm`],
    lock: `${db}.owner-lock`,
    snapshot: `${db}.upgrade-snapshot`,
    snapshotTemp,
    // 在线备份写目标时可能留下回滚日志；有人打开过半成品则还有预写日志与共享内存
    snapshotTempSidecars: [`${snapshotTemp}-journal`, `${snapshotTemp}-wal`, `${snapshotTemp}-shm`],
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class SqliteOwnerSite implements OwnerSite {
  readonly paths: SqliteOwnerPaths

  constructor(
    file: string,
    private readonly logger: StorageSqlLogger | undefined,
    private readonly hooks: UpgradeHooks,
  ) {
    this.paths = sqliteOwnerPaths(file)
  }

  get location(): string {
    return this.paths.snapshot
  }

  /**
   * ①：库旁锁文件上一个持住的排他事务。锁是 sqlite 自己的文件锁，随进程死亡由操作系统释放；
   * 同进程第二个句柄同样拿不到。锁文件用内存日志，不留附属文件；它本身常在、无内容。
   */
  async acquire(): Promise<OwnerLock> {
    const db = new DatabaseSync(this.paths.lock, { timeout: 0 })
    try {
      db.exec('PRAGMA journal_mode = MEMORY')
      db.exec('BEGIN EXCLUSIVE')
    } catch (error) {
      db.close()
      if (isSqliteBusy(error))
        throw new StorageStartupFailure(
          'occupied',
          `another owner instance holds ${this.paths.lock}`,
          { cause: error },
        )
      throw error
    }
    heldOwnerLocks.add(db)
    return {
      async release() {
        heldOwnerLocks.delete(db)
        try {
          if (db.isTransaction) db.exec('ROLLBACK')
        } finally {
          db.close()
        }
      },
    }
  }

  /** ②：先删临时名上的半成品并落盘，再看快照位置；有就恢复。 */
  async recoverLeftovers(): Promise<void> {
    const temp = [this.paths.snapshotTemp, ...this.paths.snapshotTempSidecars]
    try {
      let removed = false
      for (const path of temp) removed = (await removeIfExists(path)) || removed
      if (removed) await fsyncDirectory(this.paths.directory)
    } catch (error) {
      throw new StorageStartupFailure(
        'restore',
        `cannot remove the half-written snapshot at ${this.paths.snapshotTemp}: ${describe(error)}`,
        { cause: error, snapshot: this.paths.snapshotTemp },
      )
    }
    try {
      if (await exists(this.paths.snapshot)) await this.restore()
    } catch (error) {
      throw new StorageStartupFailure(
        'restore',
        `restoring the leftover upgrade snapshot failed: ${describe(error)}`,
        { cause: error, snapshot: this.paths.snapshot },
      )
    }
  }

  /** ③：库文件不存在 ⇒ 在快照位置落「库不存在」标记（临时名 → 落盘 → 改名 → 目录落盘），之后才打开库。 */
  async markIfAbsent(): Promise<boolean> {
    try {
      if (await exists(this.paths.db)) return false
      await writeFile(this.paths.snapshotTemp, ABSENT_MARKER)
      await fsyncFile(this.paths.snapshotTemp)
      await this.#publishTemp()
      return true
    } catch (error) {
      await this.#discardTemp()
      throw new StorageStartupFailure(
        'snapshot',
        `cannot lay the database-absent marker at ${this.paths.snapshot}: ${describe(error)}`,
        { cause: error },
      )
    }
  }

  /** ⑥：在线备份把当前已提交状态（含预写日志里的）写成临时名 → 权限同库 → 落盘 → 改名成快照 → 目录落盘。 */
  readonly takeSnapshot = async (): Promise<void> => {
    try {
      const source = new DatabaseSync(this.paths.db, { timeout: 5000 })
      try {
        source.exec('PRAGMA query_only = ON')
        await backup(source, this.paths.snapshotTemp)
      } finally {
        source.close()
      }
      const { mode } = await stat(this.paths.db)
      await chmod(this.paths.snapshotTemp, mode & 0o777)
      await fsyncFile(this.paths.snapshotTemp)
      await this.hooks.beforeSnapshotRename?.()
      await this.#publishTemp()
    } catch (error) {
      await this.#discardTemp()
      throw new StorageStartupFailure(
        'snapshot',
        `cannot take the upgrade snapshot at ${this.paths.snapshot}: ${describe(error)}`,
        { cause: error },
      )
    }
  }

  /**
   * R-U4：附属文件先删、且删除先落盘，再以原子改名把快照换成库文件并让目录落盘。
   * 「库不存在」标记：删库与附属文件并落盘，最后删标记。每一步都可重做：中途断电，快照或标记仍在，下一次再来。
   */
  async restore(): Promise<void> {
    const { paths } = this
    const kind = await this.#snapshotKind()
    const { mtime } = await stat(paths.snapshot)
    this.logger?.warn(
      'storage-sql: restoring an unconfirmed upgrade (%s taken at %s, %s)',
      kind === 'database' ? 'snapshot' : 'database-absent marker',
      mtime.toISOString(),
      paths.snapshot,
    )
    if (kind === 'database') {
      for (const sidecar of paths.sidecars) await removeIfExists(sidecar)
      await fsyncDirectory(paths.directory)
      await this.hooks.afterSidecarsRemoved?.()
      await rename(paths.snapshot, paths.db)
      await fsyncDirectory(paths.directory)
    } else {
      await removeIfExists(paths.db)
      for (const sidecar of paths.sidecars) await removeIfExists(sidecar)
      await fsyncDirectory(paths.directory)
      await this.hooks.afterSidecarsRemoved?.()
      await removeIfExists(paths.snapshot)
      await fsyncDirectory(paths.directory)
    }
  }

  snapshotOnDisk(): Promise<boolean> {
    return exists(this.paths.snapshot)
  }

  /** 确认：删快照或标记，目录落盘之后才算删到。本来就不在 ⇒ false。 */
  async removeSnapshot(): Promise<boolean> {
    const removed = await removeIfExists(this.paths.snapshot)
    if (removed) await fsyncDirectory(this.paths.directory)
    return removed
  }

  async #snapshotKind(): Promise<'database' | 'absent'> {
    const head = await readHead(this.paths.snapshot, ABSENT_MARKER.length + 1)
    if (head.equals(ABSENT_MARKER)) return 'absent'
    if (
      head.length >= SQLITE_HEADER.length &&
      head.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER)
    )
      return 'database'
    throw new Error(`unrecognized content at the upgrade snapshot location ${this.paths.snapshot}`)
  }

  async #publishTemp(): Promise<void> {
    await rename(this.paths.snapshotTemp, this.paths.snapshot)
    await fsyncDirectory(this.paths.directory)
  }

  /** 建快照失败后删半成品；删不掉只记 warn——下一次启动的②会再删它，而它从来不是快照（改名之后才算）。 */
  async #discardTemp(): Promise<void> {
    try {
      for (const path of [this.paths.snapshotTemp, ...this.paths.snapshotTempSidecars])
        await removeIfExists(path)
    } catch (error) {
      this.logger?.warn(
        'storage-sql: cannot remove the half-written snapshot at %s (the next start removes it): %s',
        this.paths.snapshotTemp,
        describe(error),
      )
    }
  }
}
