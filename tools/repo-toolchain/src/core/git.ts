import { execFileSync } from 'node:child_process'
import { repositoryEnv } from './git-environment.ts'
import { dirname, resolve } from 'node:path'

const MEMBER_ROOTS = ['packages', 'apps', 'examples'] as const

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
  readonly root: string
  readonly mainRoot: string
  readonly head: string
  readonly shortHead: string
  readonly branch: string
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
    current.push([start, count === 0 ? start : start + count - 1])
  }
  return changed
}

export function changedLines(root: string, mergeBase: string): ChangedLines {
  const changed = parseDiff(
    git(root, ['diff', '--no-color', '--no-renames', '-U0', mergeBase, '--', ...MEMBER_ROOTS]),
  )
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '--', ...MEMBER_ROOTS])
  for (const path of untracked.split('\n'))
    if (path !== '') changed.set(path, [[1, Number.POSITIVE_INFINITY]])
  return changed
}

export const nulSeparated = (output: string) => output.split('\u0000').filter(path => path !== '')

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
    if ((error as { status?: unknown }).status !== 1) throw error
    return new Set()
  }
  return new Set(nulSeparated(matched).map(path => path.replace(/\/$/u, '')))
}

function insideWorkTree(root: string): boolean {
  try {
    return git(root, ['rev-parse', '--is-inside-work-tree']) === 'true'
  } catch (error) {
    if ((error as { status?: unknown }).status === 128) return false
    throw error
  }
}

export function isUnderIgnored(path: string, ignoredDirs: ReadonlySet<string>): boolean {
  const segments = path.split('/')
  return segments.some((_, index) => ignoredDirs.has(segments.slice(0, index + 1).join('/')))
}

export function changedFiles(root: string, mergeBase: string): string[] {
  const tracked = git(root, ['diff', '--no-renames', '--name-only', '-z', mergeBase])
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z'])
  return [...new Set([...nulSeparated(tracked), ...nulSeparated(untracked)])].sort()
}

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
