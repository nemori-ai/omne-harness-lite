import { ownerOf, type WorkspaceMember } from '@omne-harness/repo-toolchain/core/workspace'

export interface ChangedMember {
  readonly path: string
  readonly name: string
  readonly testable: boolean
  readonly files: readonly string[]
  readonly scopes: readonly string[]
}

export interface Grouping {
  readonly members: readonly ChangedMember[]
  readonly outside: readonly string[]
}

export function inScope(path: string, scopes: readonly string[]): boolean {
  return scopes.length === 0 || scopes.some(scope => path.startsWith(scope))
}

function scopesIn(member: string, scopes: readonly string[]): string[] {
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
    members: members.flatMap(member => {
      const own = files.get(member.path)
      if (own === undefined) return []
      return [
        {
          path: member.path,
          name: member.name,
          testable: typeof member.scripts['test'] === 'string',
          files: own,
          scopes: scopesIn(member.path, scopes),
        },
      ]
    }),
    outside,
  }
}
