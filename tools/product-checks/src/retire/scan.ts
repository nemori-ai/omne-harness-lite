import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isTestPath } from '@omne-harness/repo-toolchain/core/rule'
import { declaredValues } from './declared.ts'
import { readTestingEntries, type Site, type TestingExport } from './exports.ts'
import { findReferences, headOf, type Reference } from './references.ts'
import { isDue, type RetireItem, type RetireTable, type Wave } from './table.ts'

export type FindingKind = 'overdue' | 'retired-referenced' | 'misassembled'

export interface Finding {
  readonly kind: FindingKind
  readonly id: string
  readonly name: string
  readonly path: string
  readonly line: number
  /** 给人读的补充，例如应删未删的替身还有几个文件在引用。 */
  readonly detail?: string
}

export interface InventoryExport {
  readonly name: string
  /** 名字是否出现在退役表的某一项里；表外导出不算问题。 */
  readonly inTable: boolean
  readonly ids: readonly string[]
  /** 引用它的测试与测试设施文件数（定义链上的文件不计）。 */
  readonly testFiles: number
  /** 引用它的产品源码等其余文件数。 */
  readonly productFiles: number
}

export interface InventoryMember {
  readonly member: string
  readonly entry: string
  readonly exports: readonly InventoryExport[]
}

export interface ScanResult {
  readonly wave: Wave
  /** 被扫描检出的 HEAD 提交。 */
  readonly ref: string
  readonly findings: readonly Finding[]
  readonly inventory: readonly InventoryMember[]
  /** 已存在却没有导出名的 B、C 类项：它们没被扫描，状态未知。 */
  readonly unmapped: readonly { readonly id: string; readonly category: string }[]
  /** 表里写的导出名找不到定义，且该项尚未到期：表过期。 */
  readonly stale: readonly { readonly id: string; readonly name: string }[]
}

export interface ScanOptions {
  readonly root: string
  readonly wave: Wave
  readonly table: RetireTable
}

const KIND_ORDER: Record<FindingKind, number> = {
  overdue: 0,
  'retired-referenced': 1,
  misassembled: 2,
}
const PRODUCT_SOURCE = /^(?:apps|packages)\/(?:.+\/)?src\//u
// `src/testing/`、`src/testing.ts` 与 `src/testing-*.ts` 都是测试设施。
const TESTING_SUPPORT = /(?:^|\/)src\/testing(?:[-.][^/]*)?(?:\/|$)/u

/** 产品源码：apps、packages 的 src 下，非测试、非测试设施。 */
export function isProductSource(path: string): boolean {
  return PRODUCT_SOURCE.test(path) && !isTestPath(path) && !TESTING_SUPPORT.test(path)
}

const isTestSide = (path: string, entries: ReadonlySet<string>): boolean =>
  isTestPath(path) || TESTING_SUPPORT.test(path) || entries.has(path)

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** 按放行波次扫描检出，报三类问题、清点表、未映射与表过期。只读：只运行 git 与读文件。 */
export function scanRetire(options: ScanOptions): ScanResult {
  const root = resolve(options.root)
  const { wave, table } = options
  const ref = headOf(root)
  const entries = readTestingEntries(root)
  const entryFiles = new Set(entries.map(entry => entry.entry))

  const exported = new Map<string, TestingExport[]>()
  for (const entry of entries)
    for (const item of entry.exports)
      exported.set(item.name, [...(exported.get(item.name) ?? []), item])
  const tableNames = [...new Set(table.items.flatMap(item => item.exports))]
  const references = findReferences(root, [...new Set([...tableNames, ...exported.keys()])])

  // 顶层声明：读引用到该名字的非测试文件，每个文件只解析一次。
  const parsed = new Map<string, ReadonlyMap<string, number>>()
  const declaredIn = (name: string): Site[] => {
    const sites: Site[] = []
    for (const file of new Set((references.get(name) ?? []).map(entry => entry.path))) {
      if (isTestPath(file)) continue
      let declared = parsed.get(file)
      if (declared === undefined) {
        declared = declaredValues(file, readFileSync(join(root, file), 'utf8'))
        parsed.set(file, declared)
      }
      const line = declared.get(name)
      if (line !== undefined) sites.push({ path: file, line })
    }
    return sites
  }
  const definitionsOf = (name: string): { sites: Site[]; files: Set<string> } => {
    const sites = new Map<string, Site>()
    const files = new Set<string>()
    for (const item of exported.get(name) ?? []) {
      for (const site of item.sites) sites.set(site.path, site)
      for (const file of item.chain) files.add(file)
    }
    for (const site of declaredIn(name)) {
      if (!sites.has(site.path)) sites.set(site.path, site)
      files.add(site.path)
    }
    return { sites: [...sites.values()], files }
  }
  const outside = (name: string, files: ReadonlySet<string>): Reference[] =>
    (references.get(name) ?? []).filter(entry => !files.has(entry.path))

  const findings: Finding[] = []
  const stale: { id: string; name: string }[] = []
  for (const item of table.items) {
    for (const name of item.exports) {
      const { sites, files } = definitionsOf(name)
      const external = outside(name, files)
      const due = isDue(item, wave)
      if (due) {
        const users = new Set(external.map(entry => entry.path)).size
        for (const site of sites)
          findings.push({
            kind: 'overdue',
            id: item.id,
            name,
            ...site,
            detail: `还有 ${users} 个文件引用它`,
          })
        // 一个文件报一条：取首次出现的行，其余出现处计入说明。
        const perFile = new Map<string, { first: Reference; count: number }>()
        for (const entry of external) {
          const seen = perFile.get(entry.path)
          if (seen === undefined) perFile.set(entry.path, { first: entry, count: 1 })
          else seen.count += 1
        }
        for (const { first, count } of perFile.values())
          findings.push({
            kind: 'retired-referenced',
            id: item.id,
            name,
            ...first,
            ...(count > 1 ? { detail: `该文件共 ${count} 处` } : {}),
          })
      } else if (sites.length === 0) stale.push({ id: item.id, name })
      if (item.category === 'B' || item.category === 'C')
        for (const entry of external)
          if (isProductSource(entry.path))
            findings.push({ kind: 'misassembled', id: item.id, name, ...entry })
    }
  }
  const order = new Map(table.items.map((item, index) => [item.id, index]))
  findings.sort(
    (a, b) =>
      (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      byText(a.name, b.name) ||
      byText(a.path, b.path) ||
      a.line - b.line,
  )

  const idsByName = new Map<string, string[]>()
  for (const item of table.items)
    for (const name of item.exports) idsByName.set(name, [...(idsByName.get(name) ?? []), item.id])
  const inventory = entries.map(entry => ({
    member: entry.member,
    entry: entry.entry,
    exports: entry.exports.map(item => {
      const files = new Set<string>(item.chain)
      for (const site of declaredIn(item.name)) files.add(site.path)
      const users = new Set(outside(item.name, files).map(use => use.path))
      const testFiles = [...users].filter(path => isTestSide(path, entryFiles)).length
      const ids = idsByName.get(item.name) ?? []
      return {
        name: item.name,
        inTable: ids.length > 0,
        ids,
        testFiles,
        productFiles: users.size - testFiles,
      }
    }),
  }))

  const unmapped = table.items
    .filter(unmappedItem)
    .map(item => ({ id: item.id, category: item.category }))
  return { wave, ref, findings, inventory, unmapped, stale }
}

/** B、C 类项已存在而表里没有导出名。A 类是装配替身，没有导出名可查；none 类没有替身。 */
function unmappedItem(item: RetireItem): boolean {
  return (
    item.exists && item.exports.length === 0 && (item.category === 'B' || item.category === 'C')
  )
}
