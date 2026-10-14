// 变异的范围：改动碰到的产品源码行（或点名成员的全部产品源码），按成员分组，写成 Stryker 的 `mutate` 条目。
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { touches, type ChangedLines } from '../metrics/git.ts'
import { ownerOf, type TestMember } from '../testing/members.ts'

/** 只变异当前 workspace 里的产品源码。legacy 目录只供阅读，不进入变异。开发工具不属于产品源码。 */
export const MUTATION_ROOTS = ['packages', 'apps'] as const

const SOURCE = /\.(?:[cm]?ts|tsx)$/u
const DECLARATION = /\.d\.[cm]?ts$/u

export type LineRange = readonly [number, number]

export interface MutationTarget {
  readonly member: TestMember
  /** 仓库相对路径 → 要变异的行区间（新一侧，闭区间）；整份为 `[1, Infinity]`。 */
  readonly lines: ReadonlyMap<string, readonly LineRange[]>
}

const isProductSource = (path: string, member: string) =>
  path.startsWith(`${member}/src/`) && SOURCE.test(path) && !DECLARATION.test(path)

const inMutationRoots = (member: TestMember) =>
  MUTATION_ROOTS.some(root => member.path.startsWith(`${root}/`))

/** 基线以来改动碰到的产品源码行，按成员分组；测试、类型声明、开发工具与示例不在内。 */
export function changedTargets(
  changed: ChangedLines,
  members: readonly TestMember[],
): MutationTarget[] {
  const eligible = members.filter(inMutationRoots)
  const grouped = new Map<TestMember, Map<string, LineRange[]>>()
  for (const [path, ranges] of changed) {
    // A pure deletion before the first remaining line has the Git anchor [0, 0].
    // It has no executable line on the new side and is not a Stryker mutation range.
    const present = ranges.filter(([start, end]) => start >= 1 && end >= start)
    const owner = ownerOf(path, eligible)
    if (owner === undefined || !isProductSource(path, owner.path) || present.length === 0) continue
    const files = grouped.get(owner) ?? new Map<string, LineRange[]>()
    files.set(path, [...present])
    grouped.set(owner, files)
  }
  return [...grouped]
    .sort(([a], [b]) => a.path.localeCompare(b.path))
    .map(([member, lines]) => ({ member, lines }))
}

function sourcesUnder(root: string, directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return sourcesUnder(root, path)
    return entry.isFile() ? [path] : []
  })
}

/** 点名成员的全部产品源码，每份整份变异。 */
export function memberTargets(root: string, members: readonly TestMember[]): MutationTarget[] {
  return members.map(member => ({
    member,
    lines: new Map(
      sourcesUnder(root, `${member.path}/src`)
        .filter(path => isProductSource(path, member.path))
        .sort()
        .map(path => [path, [[1, Number.POSITIVE_INFINITY]] as LineRange[]]),
    ),
  }))
}

/** Stryker 的 `mutate` 条目，相对成员目录：整份写路径，部分写 `路径:起-止`。 */
export function mutateEntries(target: MutationTarget): string[] {
  return [...target.lines].flatMap(([path, ranges]) => {
    const local = path.slice(target.member.path.length + 1)
    return ranges.map(([start, end]) =>
      end === Number.POSITIVE_INFINITY ? local : `${local}:${start}-${end}`,
    )
  })
}

/** 一个变异体（报告里的行号）是否落在要变异的行上。 */
export function withinTarget(
  target: MutationTarget,
  path: string,
  startLine: number,
  endLine: number,
): boolean {
  const ranges = target.lines.get(path)
  return ranges !== undefined && touches(ranges, startLine, endLine)
}
