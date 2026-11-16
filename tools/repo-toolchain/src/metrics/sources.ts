import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { isLegacyDirectory } from '../core/check-scope.ts'
import type { SourceFile } from '../core/rule.ts'
import { fileAt } from '../core/git.ts'
import { memberOf } from '../deps/graph.ts'

export function collectMemberSources(root: string): SourceFile[] {
  const out: SourceFile[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (['node_modules', 'dist', 'coverage'].includes(entry)) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (!isLegacyDirectory(relative(root, full))) walk(full)
      } else if (/\.[cm]?tsx?$/u.test(entry))
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

export function baseTextsOf(
  root: string,
  mergeBase: string,
  paths: Iterable<string>,
): Map<string, string | undefined> {
  const texts = new Map<string, string | undefined>()
  for (const path of paths)
    if (memberOf(path) !== undefined && /\.[cm]?tsx?$/u.test(path))
      texts.set(path, fileAt(root, mergeBase, path))
  return texts
}
