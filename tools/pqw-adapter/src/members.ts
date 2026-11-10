// 改动文件按成员分组。成员发现与归属复用 repo-toolchain 的 `listWorkspaceMembers` 与 `ownerOf`
// （pnpm-workspace.yaml 的成员、最长的成员目录前缀），这里只做范围过滤与分组。
import { ownerOf, type WorkspaceMember } from '@omne-harness/repo-toolchain/core/workspace'

export interface ChangedMember {
  readonly path: string
  readonly name: string
  /** 成员有 `test` 脚本才跑得出覆盖率与变异。 */
  readonly testable: boolean
  readonly files: readonly string[]
  /** 落在本成员里的 `--scope`；没给范围时是成员目录本身。 */
  readonly scopes: readonly string[]
}

export interface Grouping {
  readonly members: readonly ChangedMember[]
  /** 在范围里、但不归任何成员的改动文件。 */
  readonly outside: readonly string[]
}

/** 路径在不在范围里：范围是路径前缀；没给范围时全部算。 */
export function inScope(path: string, scopes: readonly string[]): boolean {
  return scopes.length === 0 || scopes.some(scope => path.startsWith(scope))
}

/** 一个成员下的范围：给了范围时取落在成员目录里的，或盖住整个成员的（写成成员目录）；没给时取成员目录。 */
function scopesIn(member: string, scopes: readonly string[]): string[] {
  if (scopes.length === 0) return [`${member}/`]
  const inside = scopes.filter(scope => scope.startsWith(`${member}/`))
  return inside.length > 0 ? inside : [`${member}/`]
}

export function groupByMember(
  paths: readonly string[],
  members: readonly WorkspaceMember[],
  scopes: readonly string[],
): Grouping {
  const files = new Map<string, string[]>()
  const outside: string[] = []
  for (const path of paths) {
    if (!inScope(path, scopes)) continue
    const owner = ownerOf(path, members)
    if (owner === undefined) outside.push(path)
    else files.set(owner.path, [...(files.get(owner.path) ?? []), path])
  }
  return {
    members: members
      .filter(member => files.has(member.path))
      .map(member => ({
        path: member.path,
        name: member.name,
        testable: typeof member.scripts['test'] === 'string',
        files: files.get(member.path) ?? [],
        scopes: scopesIn(member.path, scopes),
      })),
    outside,
  }
}
