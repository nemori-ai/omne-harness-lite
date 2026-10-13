import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'

const MEMBER_ROOTS = ['packages', 'apps', 'examples'] as const

/** 在 `cwd` 跑一条 git 命令，返回去掉尾部空白的标准输出；失败就抛出。 */
export function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', args, {
    env: repositoryEnv(process.env),
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd()
}

export interface Coordinates {
  /** 被度量的检出（可能是一棵工作树）。 */
  readonly root: string
  /** 主检出根；产物落在它的 `tmp/` 下，工作树退役不带走。 */
  readonly mainRoot: string
  readonly head: string
  readonly shortHead: string
  readonly branch: string
  /** 有未提交或未跟踪的改动；这样的产物不能当作某个提交的度量。 */
  readonly dirty: boolean
  readonly base?: { readonly ref: string; readonly mergeBase: string }
}

export function coordinates(root: string, baseRef: string | undefined): Coordinates {
  const head = git(root, ['rev-parse', 'HEAD'])
  // 不用 `--path-format=absolute`：Git 2.31 之前不认它，会把这个参数原样回显成一行输出。
  const common = resolve(root, git(root, ['rev-parse', '--git-common-dir']))
  const result = {
    root,
    mainRoot: dirname(common),
    head,
    shortHead: git(root, ['rev-parse', '--short=9', 'HEAD']),
    branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: git(root, ['status', '--porcelain']) !== '',
  }
  if (baseRef === undefined) return result
  return {
    ...result,
    base: { ref: baseRef, mergeBase: git(root, ['merge-base', baseRef, 'HEAD']) },
  }
}

/** 一个文件在基线之后改动的行区间（新一侧，闭区间）；整文件新增记为 `[1, Infinity]`。 */
export type ChangedLines = ReadonlyMap<string, readonly (readonly [number, number])[]>

export function parseDiff(diff: string): Map<string, [number, number][]> {
  const changed = new Map<string, [number, number][]>()
  let current: [number, number][] | undefined
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = line.slice(4)
      current = undefined
      if (path.startsWith('b/')) {
        current = []
        changed.set(path.slice(2), current)
      }
      continue
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/u.exec(line)
    if (hunk === null || current === undefined) continue
    const start = Number(hunk[1])
    const count = hunk[2] === undefined ? 1 : Number(hunk[2])
    // 纯删除（count 为 0）也算碰过这一行所在的函数。
    current.push([start, count === 0 ? start : start + count - 1])
  }
  return changed
}

/** 基线合并点到当前工作树（含未提交与未跟踪）的改动。 */
export function changedLines(root: string, mergeBase: string): ChangedLines {
  const changed = parseDiff(
    git(root, ['diff', '--no-color', '--no-renames', '-U0', mergeBase, '--', ...MEMBER_ROOTS]),
  )
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '--', ...MEMBER_ROOTS])
  for (const path of untracked.split('\n'))
    if (path !== '') changed.set(path, [[1, Number.POSITIVE_INFINITY]])
  return changed
}

/** `-z` 输出的路径：以 NUL 分隔，非 ASCII 的文件名原样给出（不加引号、不转义）。 */
export const nulSeparated = (output: string) => output.split('\u0000').filter(path => path !== '')

/** 基线合并点到当前工作树改动过的全部仓库相对路径（含删除、未提交与未跟踪），不限目录；改名拆成删与增。 */
export function changedFiles(root: string, mergeBase: string): string[] {
  const tracked = git(root, ['diff', '--no-renames', '--name-only', '-z', mergeBase])
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z'])
  return [...new Set([...nulSeparated(tracked), ...nulSeparated(untracked)])].sort()
}

/** 某个提交上该路径的文本；那时还没有这个文件则为 undefined。 */
export function fileAt(root: string, revision: string, path: string): string | undefined {
  try {
    return execFileSync('git', ['show', `${revision}:${path}`], {
      env: repositoryEnv(process.env),
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return undefined
  }
}

export function touches(
  ranges: readonly (readonly [number, number])[],
  line: number,
  endLine: number,
) {
  return ranges.some(([start, end]) => start <= endLine && end >= line)
}

export interface CommitShape {
  readonly commits: number
  readonly medianFiles: number
  readonly maxFiles: number
}

export function shapeOf(fileCounts: readonly number[]): CommitShape {
  const sorted = [...fileCounts].sort((a, b) => a - b)
  return {
    commits: sorted.length,
    medianFiles: sorted[Math.floor((sorted.length - 1) / 2)] ?? 0,
    maxFiles: sorted[sorted.length - 1] ?? 0,
  }
}

/** 基线以来非合并提交各改了多少文件。 */
export function commitShape(root: string, mergeBase: string): CommitShape {
  const log = git(root, [
    'log',
    '--no-merges',
    '--format=%x00',
    '--name-only',
    `${mergeBase}..HEAD`,
  ])
  const counts = log
    .split('\u0000')
    .slice(1)
    .map(block => block.split('\n').filter(line => line !== '').length)
  return shapeOf(counts)
}
import { repositoryEnv } from '../git-environment.ts'
