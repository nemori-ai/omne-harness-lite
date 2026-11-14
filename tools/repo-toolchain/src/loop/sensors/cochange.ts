import { git } from '../../core/git.ts'
import { memberOf } from '../../deps/graph.ts'

export interface CochangeOptions {
  readonly maxMembersPerCommit: number
  readonly minTogether: number
  readonly minRatio: number
}

export interface CochangePair {
  readonly a: string
  readonly b: string
  readonly together: number
  readonly ratio: number
}

export interface CochangeResult {
  readonly counted: number
  readonly skipped: number
  readonly pairs: readonly CochangePair[]
}

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

export function readCommitMembers(root: string, window: number): string[][] {
  return parseCommitMembers(
    git(root, ['log', '--no-merges', `-n${window}`, '--format=%x00', '--name-only', 'HEAD']),
  )
}
