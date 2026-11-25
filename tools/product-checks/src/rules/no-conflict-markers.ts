import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { git, nulSeparated } from '@omne-harness/repo-toolchain/core/git'
import type { Rule, SourceFile } from '@omne-harness/repo-toolchain/core/rule'

const MARKER = /^(?:<{7}|>{7}) /u

export const noConflictMarkers: Rule = {
  id: 'no-conflict-markers',
  source: 'tools/product-checks/SPEC.md 扫描与报告',
  description: '被跟踪的文本文件里不许有合并冲突标记行',
  check(files) {
    return files.flatMap(file =>
      file.text.split('\n').flatMap((line, index) =>
        MARKER.test(line)
          ? [
              {
                rule: this.id,
                path: file.path,
                line: index + 1,
                message: '这一行是合并冲突标记；合并没有解完',
              },
            ]
          : [],
      ),
    )
  },
}

/** Every file Git tracks that reads as text: one with a NUL byte is binary, and a path that is not a
 * file (a submodule, a deleted one) has nothing to read. */
export function collectTrackedText(root: string): SourceFile[] {
  const files: SourceFile[] = []
  for (const path of nulSeparated(git(root, ['ls-files', '-z']))) {
    const full = join(root, path)
    if (!statSync(full, { throwIfNoEntry: false })?.isFile()) continue
    const bytes = readFileSync(full)
    if (bytes.includes(0)) continue
    files.push({ path, text: bytes.toString('utf8') })
  }
  return files
}
