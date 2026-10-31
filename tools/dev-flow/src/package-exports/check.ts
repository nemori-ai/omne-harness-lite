// One complete check of a built package against its export inventory and public-api page.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  compareAugmentations,
  compareEntries,
  comparisonProblems,
  manifestDeclarations,
} from './declarations.ts'
import { decodeInventory, inventoryProblems } from './inventory.ts'
import { navigationProblems, publicApiChapters } from './page.ts'

export const DEFAULT_INVENTORY = 'tests/fixtures/exports.json'

export type EntrySummary = Readonly<{ entry: string; listed: number; pending: number }>

export type PackageExportsReport = Readonly<{
  package: string
  entries: readonly EntrySummary[]
  /** Empty when the built package, the inventory and the page agree. */
  problems: readonly string[]
}>

export type PackageExportsCheck =
  | Readonly<{ kind: 'checked'; report: PackageExportsReport }>
  /** The check could not run: unreadable or malformed inventory, no manifest, or a package not built. */
  | Readonly<{ kind: 'cannot-check'; reasons: readonly string[] }>

export function checkPackageExports(
  packageDirectory: string,
  inventoryPath: string = resolve(packageDirectory, DEFAULT_INVENTORY),
): PackageExportsCheck {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(inventoryPath, 'utf8'))
  } catch (error) {
    return { kind: 'cannot-check', reasons: [`cannot read ${inventoryPath}: ${String(error)}`] }
  }
  const decoded = decodeInventory(parsed)
  if (decoded.kind === 'invalid') return { kind: 'cannot-check', reasons: decoded.problems }
  const inventory = decoded.inventory

  let manifest: ReturnType<typeof manifestDeclarations>
  try {
    manifest = manifestDeclarations(packageDirectory)
  } catch (error) {
    return { kind: 'cannot-check', reasons: [String(error)] }
  }
  const unbuilt: string[] = []
  const declarations: Record<string, string> = {}
  for (const entry of Object.keys(inventory.entries)) {
    const path = manifest.declarations[entry]
    if (path === undefined) continue
    if (existsSync(path)) declarations[entry] = path
    else unbuilt.push(`${entry}: ${path} does not exist; build the package first`)
  }
  const pagePath = resolve(packageDirectory, inventory.source)
  if (!existsSync(pagePath)) unbuilt.push(`the inventory source ${pagePath} does not exist`)
  if (unbuilt.length > 0) return { kind: 'cannot-check', reasons: unbuilt }

  const problems = inventoryProblems(inventory, manifest.entries)
  for (const entry of Object.keys(inventory.entries))
    if (declarations[entry] === undefined && manifest.entries.includes(entry))
      problems.push(`${entry}: package.json states no types for it`)
  // Entries without a declaration were reported above; compare the others only.
  const comparable = Object.fromEntries(
    Object.entries(inventory.entries).filter(([entry]) => declarations[entry] !== undefined),
  )
  const scoped = { ...inventory, entries: comparable }
  let comparisons: ReturnType<typeof compareEntries>
  try {
    comparisons = compareEntries(scoped, declarations)
    problems.push(...comparisons.flatMap(comparisonProblems))
    problems.push(...compareAugmentations(scoped, declarations, packageDirectory))
  } catch (error) {
    return { kind: 'cannot-check', reasons: [String(error)] }
  }
  problems.push(
    ...navigationProblems(
      inventory,
      publicApiChapters(readFileSync(pagePath, 'utf8')),
      packageDirectory,
      dirname(pagePath),
    ),
  )
  return {
    kind: 'checked',
    report: {
      package: inventory.package,
      entries: comparisons.map(item => ({
        entry: item.entry,
        listed: item.total,
        pending: item.pending,
      })),
      problems,
    },
  }
}
