import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { isLegacyDirectory } from '../core/check-scope.ts'
import type { SourceFile } from '../core/rule.ts'
import { fileAt } from '../core/git.ts'
import { memberOf } from '../deps/graph.ts'

/** 成员目录下的 TypeScript 源，路径相对于仓库根；不进 node_modules、dist 与覆盖率产物。 */
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

/**
 * 改动过的成员 TypeScript 源在基线上的文本（基线上还没有的文件值为 undefined），
 * 用来按函数文本判断哪些函数真的变了、或还原基线上的导入。
 */
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
