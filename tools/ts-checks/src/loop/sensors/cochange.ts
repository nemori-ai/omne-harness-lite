// 总是一起改却分属两组的成员：读 HEAD 上最近若干个非合并提交各自碰过哪些成员，
// 数两两同时被碰到的次数。批量改动（一次碰了太多成员的提交）不计。
// 解析与计数是纯函数；读 git 只在 `readCommitMembers` 一处。
import { git } from '../../metrics/git.ts'
import { memberOf } from '../../deps/graph.ts'

export interface CochangeOptions {
  readonly maxMembersPerCommit: number
  readonly minTogether: number
  readonly minRatio: number
}

export interface CochangePair {
  readonly a: string
  readonly b: string
  /** 同时碰到两者的提交数。 */
  readonly together: number
  /** together ÷ 两者各自被碰到的提交数中较小的那个。 */
  readonly ratio: number
}

export interface CochangeResult {
  /** 参与计数的提交数（去掉批量改动之后）。 */
  readonly counted: number
  /** 因为一次碰了太多成员而不计的提交数。 */
  readonly skipped: number
  readonly pairs: readonly CochangePair[]
}

/** `git log --format=%x00 --name-only` 的输出 → 每个提交碰过的成员（只看 packages/ 与 apps/）。 */
export function parseCommitMembers(log: string): string[][] {
  return log
    .split('\u0000')
    .slice(1)
    .map(block => {
      const members = new Set<string>()
      for (const path of block.split('\n')) {
        const member = memberOf(path)
        if (member !== undefined && member.group !== 'examples') members.add(member.path)
      }
      return [...members].sort()
    })
}

const groupOf = (member: string) => memberOf(`${member}/`)?.group ?? member

/** 一个提交里分属不同组的成员对，键为 `a\0b`（a、b 按提交里的顺序）。 */
function crossGroupPairs(members: readonly string[]): string[] {
  const keys: string[] = []
  members.forEach((a, i) => {
    for (const b of members.slice(i + 1)) if (groupOf(a) !== groupOf(b)) keys.push(`${a}\u0000${b}`)
  })
  return keys
}

export function cochange(
  commits: readonly (readonly string[])[],
  options: CochangeOptions,
): CochangeResult {
  const touched = new Map<string, number>()
  const together = new Map<string, number>()
  const counting = commits.filter(members => members.length > 0)
  const kept = counting.filter(members => members.length <= options.maxMembersPerCommit)
  for (const members of kept) {
    for (const member of members) touched.set(member, (touched.get(member) ?? 0) + 1)
    for (const key of crossGroupPairs(members)) together.set(key, (together.get(key) ?? 0) + 1)
  }
  const pairs = [...together]
    .map(([key, count]): CochangePair => {
      const [a = '', b = ''] = key.split('\u0000')
      const ratio = count / Math.min(touched.get(a) ?? count, touched.get(b) ?? count)
      return { a, b, together: count, ratio }
    })
    .filter(pair => pair.together >= options.minTogether && pair.ratio >= options.minRatio)
    .sort((x, y) => y.together - x.together || y.ratio - x.ratio || x.a.localeCompare(y.a))
  return { counted: kept.length, skipped: counting.length - kept.length, pairs }
}

/** HEAD 上最近 `window` 个非合并提交各自碰过的成员。 */
export function readCommitMembers(root: string, window: number): string[][] {
  return parseCommitMembers(
    git(root, ['log', '--no-merges', `-n${window}`, '--format=%x00', '--name-only', 'HEAD']),
  )
}
