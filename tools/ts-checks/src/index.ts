import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Rule, SourceFile, Violation } from './rule.ts'
import { noBailControl } from './rules/no-bail-control.ts'
import { noWallClock } from './rules/no-wall-clock.ts'
import { noTestingImport } from './rules/no-testing-import.ts'
import { restrictedCallSites } from './rules/restricted-call-sites.ts'

export type { Rule, SourceFile, Violation } from './rule.ts'
export { isTestPath, scanLines } from './rule.ts'
export { noBailControl, noTestingImport, noWallClock, restrictedCallSites }

export const RULES: readonly Rule[] = [
  noWallClock,
  noBailControl,
  restrictedCallSites,
  noTestingImport,
]

/** 收集 `root` 下全部 `.ts` 源（跳过 node_modules 与 dist），路径相对于 root。 */
export function collectSources(root: string): SourceFile[] {
  const out: SourceFile[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.ts'))
        out.push({
          path: relative(root, full).replaceAll('\\', '/'),
          text: readFileSync(full, 'utf8'),
        })
    }
  }
  walk(root)
  return out
}

export function runRules(
  files: readonly SourceFile[],
  rules: readonly Rule[] = RULES,
): Violation[] {
  return rules.flatMap(rule => rule.check(files))
}
