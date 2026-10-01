// 条目对照表的条数。约定（正文在 docs/clean-loop.md）：表头有一栏叫「归类」的 Markdown 表，
// 数据行这一格必须是五个词之一。另把对照表的条目名对回条目全表，只报告对不上的。
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { data, noData, type Reading } from './reading.ts'

export const CATEGORIES = ['传感器', '评审问法', '归人', '不适用', '不采'] as const
export type Category = (typeof CATEGORIES)[number]

export interface TableRow {
  /** 1 起的行号。 */
  readonly line: number
  readonly cells: readonly string[]
}

export interface Table {
  readonly header: readonly string[]
  readonly rows: readonly TableRow[]
}

/** 按 `|` 切格，`\|` 不切；去掉首尾的竖线与每格两端的空白。 */
function cellsOf(line: string): string[] {
  const body = line
    .trim()
    .replace(/^\|/u, '')
    .replace(/(?<!\\)\|$/u, '')
  return body.split(/(?<!\\)\|/u).map(cell => cell.trim())
}

const isTableLine = (line: string) => line.trim().startsWith('|')
const isSeparator = (line: string) =>
  /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/u.test(line.trim())

/** 文件里的 Markdown 表：表头、分隔行、数据行连续出现；代码块里的不算。 */
export function parseTables(text: string): Table[] {
  const lines = text.split('\n')
  const tables: Table[] = []
  let fenced = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (/^\s*(```|~~~)/u.test(line)) fenced = !fenced
    if (fenced || !isTableLine(line) || !isSeparator(lines[index + 1] ?? '')) continue
    const header = cellsOf(line)
    const rows: TableRow[] = []
    let next = index + 2
    for (; next < lines.length && isTableLine(lines[next] ?? ''); next += 1)
      rows.push({ line: next + 1, cells: cellsOf(lines[next] ?? '') })
    tables.push({ header, rows })
    index = next - 1
  }
  return tables
}

export interface InvalidRow {
  readonly path: string
  readonly line: number
  readonly cell: string
}

export interface CategoryCount {
  readonly counts: Readonly<Record<Category, number>>
  readonly invalid: readonly InvalidRow[]
}

export function countCategories(path: string, text: string): CategoryCount {
  const counts = Object.fromEntries(CATEGORIES.map(category => [category, 0])) as Record<
    Category,
    number
  >
  const invalid: InvalidRow[] = []
  for (const table of parseTables(text)) {
    const column = table.header.indexOf('归类')
    if (column < 0) continue
    for (const row of table.rows) {
      const cell = row.cells[column] ?? ''
      const category = CATEGORIES.find(name => name === cell)
      if (category === undefined) invalid.push({ path, line: row.line, cell })
      else counts[category] += 1
    }
  }
  return { counts, invalid }
}

/** 表头第一栏叫「条目」的表里，每行第一格的条目名。 */
export function entryNames(text: string): string[] {
  return parseTables(text)
    .filter(table => table.header[0] === '条目')
    .flatMap(table => table.rows.map(row => row.cells[0] ?? ''))
    .filter(name => name !== '')
}

export interface CrossCheck {
  readonly missing: readonly string[]
  readonly unknown: readonly string[]
  readonly repeated: readonly string[]
}

/** 全表有而对照表没有、对照表有而全表没有、对照表里出现多次。 */
export function crossCheck(doctrine: readonly string[], catalogue: readonly string[]): CrossCheck {
  const inDoctrine = new Set(doctrine)
  const seen = new Map<string, number>()
  for (const name of catalogue) seen.set(name, (seen.get(name) ?? 0) + 1)
  return {
    missing: [...inDoctrine].filter(name => !seen.has(name)),
    unknown: [...seen.keys()].filter(name => !inDoctrine.has(name)),
    repeated: [...seen].filter(([, count]) => count > 1).map(([name]) => name),
  }
}

export interface CatalogueStatus {
  readonly categories: Reading<CategoryCount>
  readonly crossCheck: Reading<CrossCheck>
}

function readIfFile(full: string): string | undefined {
  return statSync(full, { throwIfNoEntry: false })?.isFile() === true
    ? readFileSync(full, 'utf8')
    : undefined
}

export function readCatalogue(root: string, path: string, doctrinePath: string): CatalogueStatus {
  const text = readIfFile(join(root, path))
  if (text === undefined)
    return {
      categories: noData('对照表还没写'),
      crossCheck: noData('对照表还没写'),
    }
  const doctrine = readIfFile(join(root, doctrinePath))
  return {
    categories: data(countCategories(path, text)),
    crossCheck:
      doctrine === undefined
        ? noData(`条目全表 ${doctrinePath} 不存在`)
        : data(crossCheck(entryNames(doctrine), entryNames(text))),
  }
}
