// P-11／R-13：把 sqlite 报文里的列元组映射回迁移里的约束名。
// 「UNIQUE constraint failed: t.a, t.b」→ 在 PRAGMA index_list(t) 里找列集合相同的唯一索引：
//   origin 'c'（CREATE UNIQUE INDEX）或 'u'（表内 UNIQUE 约束，sqlite 自动索引 sqlite_autoindex_t_N，拿不回迁移名）→ 索引名；
//   origin 'pk' → `<t>_pkey`（pg 对未命名主键的默认名；迁移**不得**给主键起别的名字，两方言才对得上）。
// 映射不到 ⇒ 调用方按 StorageDefect 处理（R-13）。
import type { DatabaseSync } from 'node:sqlite'

interface IndexListRow {
  readonly name: string
  readonly unique: number
  readonly origin: string
}
interface IndexInfoRow {
  readonly name: string | null
}

interface TableInfoRow {
  readonly name: string
  readonly type: string
  readonly pk: number
}

export class UniqueConstraintResolver {
  readonly #cache = new Map<string, string | undefined>()

  resolve(db: DatabaseSync, message: string): string | undefined {
    const match = /UNIQUE constraint failed: (.+)$/.exec(message)
    if (match === null) return undefined
    const columns = match[1]!.split(',').map(s => s.trim())
    const table = columns[0]!.split('.')[0]!
    const wanted = columns
      .map(c => c.split('.').slice(1).join('.'))
      .sort()
      .join(',')
    const key = `${table}:${wanted}`
    if (this.#cache.has(key)) return this.#cache.get(key)
    let found: string | undefined
    const indexes = db
      .prepare(`PRAGMA index_list(${quoteIdentifier(table)})`)
      .all() as unknown as IndexListRow[]
    for (const index of indexes) {
      if (index.unique !== 1) continue
      const info = db
        .prepare(`PRAGMA index_info(${quoteIdentifier(index.name)})`)
        .all() as unknown as IndexInfoRow[]
      const cols = info
        .map(r => r.name ?? '')
        .sort()
        .join(',')
      if (cols !== wanted) continue
      // origin 'c'：CREATE UNIQUE INDEX，名字就是迁移里的名字；'pk'：主键，两方言统一为 <table>_pkey；
      // 'u'：表内 UNIQUE 约束的自动索引 sqlite_autoindex_*，拿不回迁移名 ⇒ 不映射（调用方按 StorageDefect 处理）
      if (index.origin === 'c') found = index.name
      else if (index.origin === 'pk') found = `${table}_pkey`
      break
    }
    if (found === undefined && columns.length === 1) {
      // INTEGER PRIMARY KEY 可直接复用 rowid，没有 index_list 条目。
      const primary = (
        db
          .prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
          .all() as unknown as TableInfoRow[]
      ).filter(column => column.pk > 0)
      if (
        primary.length === 1 &&
        primary[0]!.name === wanted &&
        primary[0]!.type.toUpperCase() === 'INTEGER'
      )
        found = `${table}_pkey`
    }
    this.#cache.set(key, found)
    return found
  }
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}
