import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { SourceFile } from '../rule.ts'

/** 成员目录下的 TypeScript 源，路径相对于仓库根；不进 node_modules、dist 与覆盖率产物。 */
export function collectMemberSources(root: string): SourceFile[] {
  const out: SourceFile[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.[cm]?tsx?$/u.test(entry))
        out.push({
          path: relative(root, full).replaceAll('\\', '/'),
          text: readFileSync(full, 'utf8'),
        })
    }
  }
  for (const top of ['packages', 'apps', 'examples']) {
    const full = join(root, top)
    if (statSync(full, { throwIfNoEntry: false })?.isDirectory() === true) walk(full)
  }
  return out
}
