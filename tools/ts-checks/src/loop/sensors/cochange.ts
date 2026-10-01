// 总是一起改却分属两组的成员：读 HEAD 上最近若干个非合并提交各自碰过哪些成员，
// 数两两同时被碰到的次数。批量改动（一次碰了太多成员的提交）不计。
// 解析与计数是纯函数；读 git 只在 `readCommitMembers` 一处。
import { git } from '../../metrics/git.ts'
import { memberOf } from '../../metrics/graph.ts'

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

export function cochange(
  commits: readonly (readonly string[])[],
  options: CochangeOptions,
): CochangeResult {
  const touched = new Map<string, number>()
  const together = new Map<string, number>()
  let counted = 0
  let skipped = 0
  for (const members of commits) {
    if (members.length === 0) continue
    if (members.length > options.maxMembersPerCommit) {
      skipped += 1
      continue
    }
    counted += 1
    for (const member of members) touched.set(member, (touched.get(member) ?? 0) + 1)
    for (let i = 0; i < members.length; i += 1)
      for (let j = i + 1; j < members.length; j += 1) {
        const a = members[i]
        const b = members[j]
        if (a === undefined || b === undefined || groupOf(a) === groupOf(b)) continue
        const key = `${a}\u0000${b}`
        together.set(key, (together.get(key) ?? 0) + 1)
      }
  }
  const pairs: CochangePair[] = []
  for (const [key, count] of together) {
    const [a = '', b = ''] = key.split('\u0000')
    const ratio = count / Math.min(touched.get(a) ?? count, touched.get(b) ?? count)
    if (count >= options.minTogether && ratio >= options.minRatio)
      pairs.push({ a, b, together: count, ratio })
  }
  pairs.sort((x, y) => y.together - x.together || y.ratio - x.ratio || x.a.localeCompare(y.a))
  return { counted, skipped, pairs }
}

/** HEAD 上最近 `window` 个非合并提交各自碰过的成员。 */
export function readCommitMembers(root: string, window: number): string[][] {
  return parseCommitMembers(
    git(root, ['log', '--no-merges', `-n${window}`, '--format=%x00', '--name-only', 'HEAD']),
  )
}
