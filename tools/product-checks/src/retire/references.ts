import { spawnSync } from 'node:child_process'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'

export interface Reference {
  readonly path: string
  readonly line: number
}

/** 检出不可用或 git 失败。 */
export class GitError extends Error {
  override readonly name = 'GitError'
}

const SCAN_PATHSPEC = ['packages', 'apps']
const CODE = /\.[cm]?[jt]sx?$/u
// 命令行长度上限（Windows 约 32k）之内，每批点名的名字数。
const BATCH = 60

function git(root: string, args: readonly string[]): { status: number; stdout: string } {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
    env: repositoryEnv(process.env),
  })
  if (result.error !== undefined) throw new GitError(`无法运行 git：${result.error.message}`)
  return { status: result.status ?? 2, stdout: result.stdout }
}

/** 检出的 HEAD 提交号。`root` 不是 git 检出时抛 GitError。 */
export function headOf(root: string): string {
  const result = git(root, ['rev-parse', 'HEAD'])
  if (result.status !== 0) throw new GitError(`${root} 不是 git 检出，或没有提交`)
  return result.stdout.trim()
}

/**
 * 名字级引用查找：`git grep -n -w`，只看 `packages/`、`apps/` 下已跟踪的脚本文件。
 * 一次点名一批名字，再按整词拆行归还每个名字的出现处。同名的无关符号会误报，别名导入会漏报。
 */
export function findReferences(root: string, names: readonly string[]): Map<string, Reference[]> {
  const unique = [...new Set(names)]
  const wanted = new Set(unique)
  const found = new Map<string, Reference[]>(unique.map(name => [name, []]))
  for (let start = 0; start < unique.length; start += BATCH) {
    const args = ['grep', '-n', '-w', '-F', '-I', '--null']
    for (const name of unique.slice(start, start + BATCH)) args.push('-e', name)
    args.push('--', ...SCAN_PATHSPEC)
    const result = git(root, args)
    if (result.status > 1) throw new GitError(`git grep 失败（退出 ${result.status}）`)
    for (const row of result.stdout.split('\n')) {
      const [path, line, ...rest] = row.split('\0')
      if (path === undefined || line === undefined || !CODE.test(path)) continue
      const seen = new Set<string>()
      for (const token of rest.join('\0').match(/\w+/gu) ?? []) {
        if (!wanted.has(token) || seen.has(token)) continue
        seen.add(token)
        found.get(token)?.push({ path, line: Number(line) })
      }
    }
  }
  return found
}
