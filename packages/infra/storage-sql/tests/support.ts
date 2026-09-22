import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** 每个测试文件一个临时文件库，不共享；无 in-memory（D-026）。 */
export function tempSqliteFile(label: string): string {
  return join(mkdtempSync(join(tmpdir(), `omne-storage-sql-${label}-`)), 'db.sqlite')
}
