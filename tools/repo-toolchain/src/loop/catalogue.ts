import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { data, noData, type Reading } from './reading.ts'

export const CATEGORIES = ['传感器', '评审问法', '归人', '不适用', '不采'] as const
export type Category = (typeof CATEGORIES)[number]

export interface TableRow {
  readonly line: number
  readonly cells: readonly string[]
}

export interface Table {
  readonly header: readonly string[]
  readonly rows: readonly TableRow[]
}

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

export function countPending(text: string): number {
  return parseTables(text)
    .filter(table => table.header.includes('归类'))
    .reduce((sum, table) => {
      const column = table.header.indexOf('现状')
      if (column < 0) return sum
      return sum + table.rows.filter(row => (row.cells[column] ?? '').startsWith('待建')).length
    }, 0)
}

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

function occurrences(names: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
  return counts
}

export function crossCheck(doctrine: readonly string[], catalogue: readonly string[]): CrossCheck {
  const expected = occurrences(doctrine)
  const seen = occurrences(catalogue)
  return {
    missing: [...expected].filter(([name, count]) => (seen.get(name) ?? 0) < count).map(([n]) => n),
    unknown: [...seen.keys()].filter(name => !expected.has(name)),
    repeated: [...seen]
      .filter(([name, count]) => expected.has(name) && count > (expected.get(name) ?? 0))
      .map(([name]) => name),
  }
}

export interface CatalogueStatus {
  readonly categories: Reading<CategoryCount>
  readonly crossCheck: Reading<CrossCheck>
}

export function readIfFile(full: string): string | undefined {
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
