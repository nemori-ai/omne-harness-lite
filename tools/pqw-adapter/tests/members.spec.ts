import { expect, it } from 'vitest'
import { groupByMember, inScope } from '../src/members.ts'
import { member } from './support.ts'

const members = [
  member('tools/test-runner'),
  member('packages/a/b'),
  member('packages/a/b-c'),
  member('tools/repo-config', false),
]

it('groups changed files by the longest member prefix and keeps files outside every member apart', () => {
  const grouping = groupByMember(
    ['packages/a/b/src/x.ts', 'packages/a/b-c/src/y.ts', 'docs/z.md', 'tools/test-runner/src/s.ts'],
    members,
    [],
  )
  expect(grouping.members.map(m => [m.path, m.files])).toEqual([
    ['tools/test-runner', ['tools/test-runner/src/s.ts']],
    ['packages/a/b', ['packages/a/b/src/x.ts']],
    ['packages/a/b-c', ['packages/a/b-c/src/y.ts']],
  ])
  expect(grouping.outside).toEqual(['docs/z.md'])
})

it('drops files outside the given scopes and narrows each member to the scopes inside it', () => {
  const grouping = groupByMember(
    [
      'tools/test-runner/src/testing/steps.ts',
      'tools/test-runner/src/other.ts',
      'packages/a/b/src/x.ts',
      'docs/a.md',
    ],
    members,
    ['tools/test-runner/src/testing/steps.ts', 'packages/'],
  )
  expect(grouping.members.map(m => [m.path, m.files, m.scopes])).toEqual([
    [
      'tools/test-runner',
      ['tools/test-runner/src/testing/steps.ts'],
      ['tools/test-runner/src/testing/steps.ts'],
    ],
    ['packages/a/b', ['packages/a/b/src/x.ts'], ['packages/a/b/']],
  ])
  expect(grouping.outside).toEqual([])
})

it('marks a member without a test script as not testable', () => {
  const grouping = groupByMember(['tools/repo-config/oxlint.json'], members, [])
  expect(grouping.members).toEqual([
    expect.objectContaining({ path: 'tools/repo-config', testable: false }),
  ])
})

it('treats no scope as everything and a scope as a path prefix', () => {
  expect(inScope('a/b.ts', [])).toBe(true)
  expect(inScope('a/b.ts', ['a/'])).toBe(true)
  expect(inScope('a/b.ts', ['b/'])).toBe(false)
})
