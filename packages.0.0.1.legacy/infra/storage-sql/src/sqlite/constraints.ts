// P-11／R-13：把 sqlite 报文里的列元组映射回迁移里的约束名。
// 「UNIQUE constraint failed: t.a, t.b」→ 在 PRAGMA index_list(t) 里找列集合相同的唯一索引：
//   origin 'c'（CREATE UNIQUE INDEX）或 'u'（表内 UNIQUE 约束，sqlite 自动索引 sqlite_autoindex_t_N，拿不回迁移名）→ 索引名；
//   origin 'pk' → `<t>_pkey`（pg 对未命名主键的默认名；迁移**不得**给主键起别的名字，两方言才对得上）。
// 映射不到 ⇒ 调用方按 StorageDefect 处理（R-13）。
import type { AsyncSqliteDatabase } from './async-database.ts'

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

  async resolve(db: AsyncSqliteDatabase, message: string): Promise<string | undefined> {
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
    const indexed = await resolveIndex(db, table, wanted)
    const found =
      indexed ?? (columns.length === 1 ? await resolveRowid(db, table, wanted) : undefined)
    this.#cache.set(key, found)
    return found
  }
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

async function resolveIndex(db: AsyncSqliteDatabase, table: string, wanted: string) {
  const indexes = (await db.all(
    `PRAGMA index_list(${quoteIdentifier(table)})`,
  )) as unknown as IndexListRow[]
  for (const index of indexes) {
    if (index.unique !== 1) continue
    const info = (await db.all(
      `PRAGMA index_info(${quoteIdentifier(index.name)})`,
    )) as unknown as IndexInfoRow[]
    const cols = info
      .map(r => r.name ?? '')
      .sort()
      .join(',')
    if (cols !== wanted) continue
    // origin 'c'：CREATE UNIQUE INDEX，名字就是迁移里的名字；'pk'：主键，两方言统一为 <table>_pkey；
    // 'u'：表内 UNIQUE 约束的自动索引 sqlite_autoindex_*，拿不回迁移名 ⇒ 不映射（调用方按 StorageDefect 处理）
    if (index.origin === 'c') return index.name
    if (index.origin === 'pk') return `${table}_pkey`
    return undefined
  }
  return undefined
}

async function resolveRowid(db: AsyncSqliteDatabase, table: string, wanted: string) {
  const primary = (
    (await db.all(`PRAGMA table_info(${quoteIdentifier(table)})`)) as unknown as TableInfoRow[]
  ).filter(column => column.pk > 0)
  if (
    primary.length === 1 &&
    primary[0]!.name === wanted &&
    primary[0]!.type.toUpperCase() === 'INTEGER'
  )
    return `${table}_pkey`
  return undefined
}
