import type { Rule, Violation } from '../rule.ts'
import { tenancyPackageOf } from '../layout.ts'
import { codeMatches, lineAt, namedImportsOf, viewsOf } from '../source-text.ts'

const STORAGE_SQL = /^@omne-harness\/storage-sql(?:\/|$)/
const BYPASS = new Set(['NodeSqliteDialect', 'NodeSqliteDriver', 'SqlStorage', 'openStorage'])

/**
 * 架构评审 N-2（主线 2026-09-23 追加）；storage-sql 节点 design「自写 node:sqlite Driver 的边界」与
 * tenancy-host design「同一存储、同一约束域：本节点要保证的三件事」：`tenancy/*` 的包源码只经 `Storage` 协议
 * （inject `storage`）进库。不得从 `@omne-harness/storage-sql` 导入 `NodeSqliteDialect`、`NodeSqliteDriver`、
 * `SqlStorage`、`openStorage`（具名导入，或经命名空间／默认导入的成员），也不得 `new Kysely(`——
 * 否则绕过写队列、嵌套检测与升级守卫，另开一个不在同一约束域里的库连接。测试目录豁免。
 */
export const noDialectBypass: Rule = {
  id: 'no-dialect-bypass',
  source:
    '架构评审 N-2 · storage-sql 节点 design「自写 node:sqlite Driver 的边界」· tenancy-host design「同一存储、同一约束域」',
  description:
    'tenancy/*/src 不从 storage-sql 导入 NodeSqliteDialect/NodeSqliteDriver/SqlStorage/openStorage，不 new Kysely(',
  check(files) {
    const out: Violation[] = []
    for (const file of files) {
      if (tenancyPackageOf(file.path) === undefined) continue
      const views = viewsOf(file)
      const push = (index: number, message: string) =>
        out.push({ rule: this.id, path: file.path, line: lineAt(file.text, index), message })
      const namespaces = new Set<string>()
      for (const imp of namedImportsOf(file)) {
        if (!STORAGE_SQL.test(imp.specifier)) continue
        if (imp.imported === '*' || imp.imported === 'default') namespaces.add(imp.local)
        else if (BYPASS.has(imp.imported)) {
          push(
            imp.index,
            `从 ${imp.specifier} 导入了 ${imp.imported}；tenancy 包只经 Storage 协议（inject storage）进库`,
          )
        }
      }
      for (const ns of namespaces) {
        const member = new RegExp(`(?<![\\w$.])${ns}\\s*\\??\\.\\s*(${[...BYPASS].join('|')})\\b`)
        for (const m of codeMatches(views, member)) {
          push(
            m.index,
            `经 ${ns}.${m[1]} 用了 storage-sql 的库连接构件；tenancy 包只经 Storage 协议进库`,
          )
        }
      }
      for (const m of codeMatches(views, /\bnew\s+Kysely\b/)) {
        push(m.index, '直接 new Kysely(；tenancy 包只经 Storage 协议进库，不另开库连接')
      }
    }
    return out
  },
}
