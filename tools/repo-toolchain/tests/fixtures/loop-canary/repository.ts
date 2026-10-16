// 读 git 的回路测试共用的临时仓库：建仓、写文件、提交，以及把金丝雀假仓库拷进去。
// 建出来的目录记在本模块里，测试在 afterEach 里调 `removeTemporaries()` 收掉。
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { linkWorkspace } from '../../../src/deps/graph.ts'

const made: string[] = []

export function removeTemporaries(): void {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
}

export function temporaryDirectory(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix))
  made.push(path)
  return path
}

export function git(root: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=someone', '-c', 'user.email=someone@example.com', ...args],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim()
}

export function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

export function commit(root: string, message: string): string {
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', message)
  return git(root, 'rev-parse', 'HEAD')
}

/** 一个只有 README 的仓库，主线分支叫 main。 */
export function repository(): string {
  const root = temporaryDirectory('loop-repo-')
  // 本机 git 可能早于 `init -b`，用 symbolic-ref 定主线分支名。
  git(root, 'init', '-q')
  git(root, 'symbolic-ref', 'HEAD', 'refs/heads/main')
  write(root, 'README.md', 'repo\n')
  commit(root, 'init')
  return root
}

const CANARY = fileURLToPath(new URL('./repo/', import.meta.url))

/** 把金丝雀假仓库拷进 `root`：`.ts.txt` 还原成 `.ts`。 */
export function copyCanary(root: string): void {
  cpSync(CANARY, root, { recursive: true })
  const restore = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '.git') restore(full)
      } else if (entry.name.endsWith('.ts.txt')) renameSync(full, full.slice(0, -'.txt'.length))
    }
  }
  restore(root)
  // 像装好依赖的检出那样，让成员间的包导入能被 dependency-cruiser 解析；链接不进提交。
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n')
  linkWorkspace(root, join(root, 'node_modules'))
}
