import { execFileSync } from 'node:child_process'
import { repositoryEnv } from './git-environment.ts'
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

/**
 * 工作树里自身被 git 忽略的未跟踪目录（仓库相对路径，不带尾斜杠），例如变异运行器的 `.stryker-tmp-*` 沙箱。
 * 只有目录本身匹配忽略规则才算：只忽略了目录里个别文件的目录不在其中；已跟踪的目录 git 从不当作被忽略。
 * 两步都只跑 git：先列出整个被忽略的候选目录，再让 `check-ignore` 核对目录自身是否匹配。
 * 不在 git 工作树里时没有忽略规则可言，返回空集合（`omne-deps --root` 可指向非 git 目录）。
 */
export function ignoredDirectories(root: string): Set<string> {
  if (!insideWorkTree(root)) return new Set()
  const candidates = nulSeparated(
    git(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z']),
  ).filter(path => path.endsWith('/'))
  if (candidates.length === 0) return new Set()
  let matched: string
  try {
    matched = execFileSync('git', ['check-ignore', '--stdin', '-z'], {
      env: repositoryEnv(process.env),
      cwd: root,
      encoding: 'utf8',
      input: candidates.join('\u0000'),
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (error) {
    // 退出码 1 是「一个也不匹配」，不是出错。
    if ((error as { status?: unknown }).status !== 1) throw error
    return new Set()
  }
  return new Set(nulSeparated(matched).map(path => path.replace(/\/$/u, '')))
}

/** `root` 在一棵 git 工作树里。`rev-parse` 以 128 退出才是「不在仓库里」，别的失败照常抛出。 */
function insideWorkTree(root: string): boolean {
  try {
    return git(root, ['rev-parse', '--is-inside-work-tree']) === 'true'
  } catch (error) {
    if ((error as { status?: unknown }).status === 128) return false
    throw error
  }
}

/** `path` 自己或某个上级目录在 `ignoredDirs` 里。 */
export function isUnderIgnored(path: string, ignoredDirs: ReadonlySet<string>): boolean {
  const segments = path.split('/')
  return segments.some((_, index) => ignoredDirs.has(segments.slice(0, index + 1).join('/')))
}

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
