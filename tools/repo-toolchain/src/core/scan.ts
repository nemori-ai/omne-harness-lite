import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { isLegacyDirectory } from './check-scope.ts'
import type { Rule, SourceFile, Violation } from './rule.ts'

export function collectSources(root: string): SourceFile[] {
  const out: SourceFile[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (!isLegacyDirectory(relative(root, full))) walk(full)
      } else if (entry.endsWith('.ts'))
        out.push({
          path: relative(root, full).replaceAll('\\', '/'),
          text: readFileSync(full, 'utf8'),
        })
    }
  }
  if (!isLegacyDirectory(root)) walk(root)
  return out
}

export function runRules(files: readonly SourceFile[], rules: readonly Rule[]): Violation[] {
  return rules.flatMap(rule => rule.check(files))
}
