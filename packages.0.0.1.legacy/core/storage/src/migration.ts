// 迁移片段：各 owner 包导出自己表的迁移，装配按次序合成。
// 设计：apps/tenancy-host/SPEC.md owner 导出片段、本节点合成」。
import type { Migration, MigrationProvider } from 'kysely/migration'

/**
 * 一个 owner 包导出的一条迁移。
 *
 * - `name` 在包内稳定、发布后不改；片段只追加在 owner 数组末尾、不重排（tenancy-host M-9）。
 *   合成时在前面加全局位置编号，所以 owner 内部的名字不必全局唯一，但合成后的一批里不得重复。
 * - `migration` 只有 `up`；不带 `down`（升级整体性靠快照，不靠反向迁移）。
 */
export interface MigrationFragment {
  readonly name: string
  readonly migration: Migration
}

/** 合成后的迁移名：四位全局位置编号 + owner 给的名字。发布后不改、不重排。 */
export function composedMigrationName(position: number, fragment: MigrationFragment): string {
  return `${String(position).padStart(4, '0')}_${fragment.name}`
}

/**
 * 把各 owner 的片段按给定次序合成一个 Kysely `MigrationProvider`。
 * 次序就是数组次序（装配负责把 AI 片段排在 OG 片段之前等）；
 * 同名片段 ⇒ 抛出（两个 owner 撞名，或同一 owner 重复导出），不静默覆盖。
 */
export function composeMigrations(fragments: readonly MigrationFragment[]): MigrationProvider {
  const migrations: Record<string, Migration> = {}
  const seen = new Set<string>()
  fragments.forEach((fragment, index) => {
    if (seen.has(fragment.name)) {
      throw new Error(`duplicate migration fragment name: ${fragment.name}`)
    }
    seen.add(fragment.name)
    migrations[composedMigrationName(index + 1, fragment)] = fragment.migration
  })
  return { getMigrations: async () => migrations }
}
