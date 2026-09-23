// 模拟「本版多一个片段」的升级用的测试片段，按名字构造（子进程也按名字构造同一份）。
// 它们只经 boot() 的测试钩子 `extraMigrations` 进来，追加在合成序列末尾（M-9：只追加）。
import { chmod } from 'node:fs/promises'
import { sql, type Kysely } from 'kysely'
import type { MigrationFragment } from '@omne-harness-lite/storage'

export type FragmentName =
  | 'upgrade_probe'
  | 'upgrade_probe_2'
  | 'fail'
  | 'hang'
  | 'future_clock'
  | 'block_center_mint'
  | 'lock_directory'

export interface FragmentOptions {
  /** `hang` 开始时的回调（子进程据此向父进程报到）。 */
  readonly onHang?: () => void
  /** `lock_directory` 要改成只读的目录。 */
  readonly directory?: string
  /** `future_clock` 写进 `clock_lease.written_at` 的毫秒时刻。 */
  readonly futureWrittenAt?: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Kysely<any>

export function fragment(name: FragmentName, options: FragmentOptions = {}): MigrationFragment {
  switch (name) {
    case 'upgrade_probe':
    case 'upgrade_probe_2':
      return {
        name,
        migration: {
          async up(db: Db) {
            await db.schema
              .createTable(name)
              .ifNotExists()
              .addColumn('id', 'text', c => c.primaryKey())
              .execute()
            await db
              .insertInto(name)
              .values({ id: 'row' })
              .onConflict(c => c.column('id').doNothing())
              .execute()
          },
        },
      }
    case 'fail':
      return {
        name,
        migration: {
          async up() {
            throw new Error('injected migration failure')
          },
        },
      }
    case 'hang':
      return {
        name,
        migration: {
          async up() {
            options.onHang?.()
            await new Promise(() => undefined)
          },
        },
      }
    case 'future_clock':
      // 迁移之后才把「中心用过的最晚时刻」写到墙钟之后：迁移前的只读核对已过，clock 插件启动时检出回拨
      return {
        name,
        migration: {
          async up(db: Db) {
            const at = options.futureWrittenAt ?? Date.now() + 3_600_000
            await sql`INSERT INTO clock_lease (id, lease_until, written_at) VALUES (1, ${at}, ${at})
              ON CONFLICT (id) DO UPDATE SET lease_until = ${at}, written_at = ${at}`.execute(db)
          },
        },
      }
    case 'block_center_mint':
      // 入口层铸中心标识的那次写失败（sqlite 触发器）
      return {
        name,
        migration: {
          async up(db: Db) {
            await sql`CREATE TRIGGER IF NOT EXISTS block_center_mint BEFORE UPDATE ON governance_center
              BEGIN SELECT RAISE(ABORT, 'injected mint failure'); END`.execute(db)
          },
        },
      }
    case 'lock_directory':
      // 迁移之后让快照所在目录不可写：撤除路径上的恢复会失败
      return {
        name,
        migration: {
          async up() {
            if (options.directory === undefined) throw new Error('lock_directory needs a directory')
            await chmod(options.directory, 0o500)
          },
        },
      }
  }
}
