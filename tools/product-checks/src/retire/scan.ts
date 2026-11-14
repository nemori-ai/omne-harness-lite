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
  readonly detail?: string
}

export interface InventoryExport {
  readonly name: string
  readonly inTable: boolean
  readonly ids: readonly string[]
  readonly testFiles: number
  readonly productFiles: number
}

export interface InventoryMember {
  readonly member: string
  readonly entry: string
  readonly exports: readonly InventoryExport[]
}

export interface ScanResult {
  readonly wave: Wave
  readonly ref: string
  readonly findings: readonly Finding[]
  readonly inventory: readonly InventoryMember[]
  readonly unmapped: readonly { readonly id: string; readonly category: string }[]
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
const TESTING_SUPPORT = /(?:^|\/)src\/testing(?:[-.][^/]*)?(?:\/|$)/u

export function isProductSource(path: string): boolean {
  return PRODUCT_SOURCE.test(path) && !isTestPath(path) && !TESTING_SUPPORT.test(path)
}

const isTestSide = (path: string, entries: ReadonlySet<string>): boolean =>
  isTestPath(path) || TESTING_SUPPORT.test(path) || entries.has(path)

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

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

function unmappedItem(item: RetireItem): boolean {
  return (
    item.exists && item.exports.length === 0 && (item.category === 'B' || item.category === 'C')
  )
}
