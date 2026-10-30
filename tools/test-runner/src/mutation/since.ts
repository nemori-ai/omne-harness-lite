// 差分变异的 `--since <ref>`：基线仍是 targetBase（或 `--base`），`--since` 只把改动行收窄到 `<ref>` 以来改动的那些。
// 先核对 `<ref>`：是 HEAD 的祖先，并且不早于基线与 HEAD 的合并点；不满足时抛 `SinceRefusal`，调用方以 2 退出。
// 改动行与现有范围计算同形（`ChangedLines`，新一侧行号），可直接交给 `changedTargets`。
import { spawnSync } from 'node:child_process'
import { changedLines, git, type ChangedLines } from '@omne-harness/repo-toolchain/core/git'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'

/** `--since` 的取值不能用；`message` 写明原因，给人读。 */
export class SinceRefusal extends Error {
  override name = 'SinceRefusal'
}

export interface SinceRequest {
  /** 被变异的检出。 */
  readonly root: string
  /** `--since` 给的引用：提交号、分支、`HEAD~1` 等。 */
  readonly since: string
  /** 范围的基线：task context 的 targetBase，或未绑定时的 `--base`；合并点由它与 HEAD 算出。 */
  readonly base: string
}

export interface SinceRange {
  /** `--since` 解析出的提交。 */
  readonly commit: string
  /** 基线与 HEAD 的合并点。 */
  readonly mergeBase: string
  /**
   * `<ref>` 到工作树（含未提交、未跟踪）的改动行，再与合并点到工作树的改动行取交：
   * 两份 diff 的新一侧都是同一份工作树，行号可比。取交保证范围只会收窄，不会因为
   * `<ref>` 之前改过、之后又改回基线原样的行而扩大到基线以来没变的代码。
   */
  readonly lines: ChangedLines
}

function commitOf(root: string, ref: string): string | undefined {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
    cwd: root,
    env: repositoryEnv(process.env),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status === 0) return result.stdout.trim()
  if (result.status === 1) return undefined
  throw new Error(`git rev-parse ${ref} 失败：${result.stderr.trim() || String(result.error)}`)
}

/** `ancestor` 是 `descendant` 本身或它的祖先。 */
function isAncestor(root: string, ancestor: string, descendant: string): boolean {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
    cwd: root,
    env: repositoryEnv(process.env),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status === 0) return true
  if (result.status === 1) return false
  throw new Error(
    `git merge-base --is-ancestor ${ancestor} ${descendant} 失败：${result.stderr.trim() || String(result.error)}`,
  )
}

const short = (commit: string) => commit.slice(0, 9)

/**
 * 核对 `--since` 的提交，返回它与合并点。等于合并点是允许的：收窄到全范围本身，结果与不给 `--since` 相同；
 * 等于 HEAD 也允许：只剩未提交的改动。
 */
export function checkSince(request: SinceRequest): Pick<SinceRange, 'commit' | 'mergeBase'> {
  const { root, since, base } = request
  if (since.trim() === '')
    throw new SinceRefusal('--since 要给一个提交（提交号、分支或 HEAD~1 这样的引用）')
  if (since.startsWith('-'))
    throw new SinceRefusal(`--since ${since}：引用不能以 - 开头，git 会把它当成选项`)
  const commit = commitOf(root, since)
  if (commit === undefined) throw new SinceRefusal(`--since ${since}：本仓库里没有这个提交`)
  const head = git(root, ['rev-parse', 'HEAD'])
  if (commitOf(root, base) === undefined) throw new Error(`基线 ${base} 不是本仓库里的提交`)
  const mergeBase = git(root, ['merge-base', base, 'HEAD'])
  if (!isAncestor(root, commit, head))
    throw new SinceRefusal(
      `--since ${since}（${short(commit)}）不是 HEAD（${short(head)}）的祖先：只能从当前提交的历史里选一个提交`,
    )
  if (!isAncestor(root, mergeBase, commit))
    throw new SinceRefusal(
      isAncestor(root, commit, mergeBase)
        ? `--since ${since}（${short(commit)}）早于基线 ${base} 与 HEAD 的合并点 ${short(mergeBase)}：` +
            '--since 只收窄变异范围，不扩大；要变异合并点以来的全部改动就不给 --since'
        : `--since ${since}（${short(commit)}）不在基线 ${base} 与 HEAD 的合并点 ${short(mergeBase)} 之后：` +
            '它在合并进来的旁支上，不是从合并点到 HEAD 这条线上的提交',
    )
  return { commit, mergeBase }
}

type Range = readonly [number, number]

/**
 * 两组闭区间的交，按 `a` 的顺序给出。同一份 diff 里的区间互不重叠，所以每一对的交互不重叠，不会重复。
 */
function intersect(a: readonly Range[], b: readonly Range[]): Range[] {
  const result: Range[] = []
  for (const [aStart, aEnd] of a)
    for (const [bStart, bEnd] of b) {
      const start = Math.max(aStart, bStart)
      const end = Math.min(aEnd, bEnd)
      if (start <= end) result.push([start, end])
    }
  return result
}

/** 核对 `--since`，返回收窄后的改动行；取值不能用时抛 `SinceRefusal`。 */
export function sinceRange(request: SinceRequest): SinceRange {
  const { commit, mergeBase } = checkSince(request)
  const sinceLines = changedLines(request.root, commit)
  const baseLines = changedLines(request.root, mergeBase)
  const lines = new Map<string, Range[]>()
  for (const [path, ranges] of sinceLines) {
    const kept = intersect(ranges, baseLines.get(path) ?? [])
    if (kept.length > 0) lines.set(path, kept)
  }
  return { commit, mergeBase, lines }
}
