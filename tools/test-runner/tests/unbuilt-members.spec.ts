import { describe, expect, it } from 'vitest'
import type { WorkspaceMember } from '@omne-harness/repo-toolchain/core/workspace'
import { unbuiltMembers } from '../src/testing/steps.ts'

const member = (
  path: string,
  scripts: Record<string, string> = { build: 'tsc' },
): WorkspaceMember => ({
  path,
  name: `@x/${path.split('/').at(-1) ?? path}`,
  scripts,
  dependencies: [],
})

describe('没有构建产物的成员', () => {
  const members = [
    member('packages/a'),
    member('packages/b'),
    member('packages/c'),
    member('packages/no-build', { test: 'vitest run' }),
    member('packages/old.legacy'),
    member('packages/old.legacy/inner'),
  ]

  it('有构建脚本、没被计划选中、没有 dist 的才算；归档目录里的不算', () => {
    const built = new Set(['packages/b'])
    expect(
      unbuiltMembers(members, new Set(['packages/a']), path => built.has(path)).map(
        each => each.path,
      ),
    ).toEqual(['packages/c'])
  })

  it('都有 dist 时是空的；一个都没有时，计划之外有构建脚本的全在', () => {
    expect(unbuiltMembers(members, new Set(), () => true)).toEqual([])
    expect(unbuiltMembers(members, new Set(), () => false).map(each => each.path)).toEqual([
      'packages/a',
      'packages/b',
      'packages/c',
    ])
  })
})
