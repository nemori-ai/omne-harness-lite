// 升级守卫测试用的迁移片段（测试与子进程共用）。表都显式建成幂等，名字即片段名。
import type { Kysely } from 'kysely'
import type { MigrationProvider } from 'kysely/migration'
import { composeMigrations, type MigrationFragment } from '@omne-harness-lite/storage'

/** `hang`：跑到它时向 stdout 报 `at:migration` 并永远不返回（子进程在此被杀）；`fail`：抛出。其余：建一张同名表并插一行。 */
export type FragmentKind = string

export function fragment(kind: FragmentKind): MigrationFragment {
  if (kind === 'fail')
    return {
      name: 'fail',
      migration: {
        async up() {
          throw new Error('migration exploded')
        },
      },
    }
  if (kind === 'hang')
    return {
      name: 'hang',
      migration: {
        async up() {
          process.stdout.write('at:migration\n')
          await new Promise(() => undefined)
        },
      },
    }
  return {
    name: kind,
    migration: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async up(db: Kysely<any>) {
        await db.schema
          .createTable(kind)
          .ifNotExists()
          .addColumn('id', 'text', c => c.primaryKey())
          .execute()
        await db
          .insertInto(kind)
          .values({ id: `${kind}-seed` })
          .onConflict(oc => oc.doNothing())
          .execute()
      },
    },
  }
}

export function migrationsOf(...kinds: FragmentKind[]): MigrationProvider {
  return composeMigrations(kinds.map(fragment))
}
