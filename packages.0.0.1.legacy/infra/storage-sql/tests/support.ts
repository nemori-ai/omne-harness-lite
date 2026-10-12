import { chmodSync, copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** 每个测试文件一个临时文件库，不共享；无 in-memory（D-026）。 */
export function tempSqliteFile(label: string): string {
  return join(mkdtempSync(join(tmpdir(), `omne-storage-sql-${label}-`)), 'db.sqlite')
}

/** 以 root 跑时目录权限挡不住写：依赖「目录只读」的用例在那种环境下不成立。 */
export const canDropWritePermission = process.getuid?.() !== 0

/** 把库所在目录设为只读，返回复原函数。 */
export function makeDirectoryReadOnly(file: string): () => void {
  const directory = dirname(file)
  chmodSync(directory, 0o555)
  return () => chmodSync(directory, 0o755)
}

/** 逐表导出已提交内容（不含 sqlite_ 内部表），按表名与行排序——「内容不变」按内容比，不按字节。 */
export function dumpDatabase(file: string): Record<string, unknown[]> {
  const db = new DatabaseSync(file)
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name",
      )
      .all() as { name: string }[]
    const dump: Record<string, unknown[]> = {}
    for (const { name } of tables) {
      const rows = db.prepare(`SELECT * FROM "${name}"`).all()
      dump[name] = rows
        .map(row => JSON.stringify({ ...row }))
        .sort()
        .map(text => JSON.parse(text) as unknown)
    }
    return dump
  } finally {
    db.close()
  }
}

/** 打开快照的一份拷贝去读（直接打开快照会在它旁边生出预写日志与共享内存）。 */
export function readSnapshotCopy<T>(snapshot: string, read: (db: DatabaseSync) => T): T {
  const copy = join(mkdtempSync(join(tmpdir(), 'omne-storage-sql-snapshot-copy-')), 'copy.sqlite')
  copyFileSync(snapshot, copy)
  const db = new DatabaseSync(copy)
  try {
    return read(db)
  } finally {
    db.close()
  }
}
