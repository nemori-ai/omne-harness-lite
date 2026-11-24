import { dirname, join, relative, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { guidanceDirectories } from '../src/guidance-directories.ts'

it('includes the bound root once and accepts only absolute visit evidence', () => {
  const root = resolve('repo/app')
  const unconfirmed = relative(process.cwd(), join(root, 'unconfirmed'))
  expect(guidanceDirectories(root, [])).toEqual([root])
  expect(guidanceDirectories(root, [root, unconfirmed, root])).toEqual([root])
})

it('unions only bounded ancestors across shuffled, repeated, and out-of-workspace visits', () => {
  const root = resolve('repo/app')
  const leaves = Array.from({ length: 128 }, (_, i) => join(root, 'src', 'modules', String(i)))
  const visits = Array.from({ length: 10_000 }, (_, i) => leaves[(i * 37) % leaves.length]!)
  const expected = new Set([root])
  for (const leaf of leaves) {
    for (let at = leaf; relative(root, at) !== ''; at = dirname(at)) expected.add(at)
  }
  const cold = guidanceDirectories(root, visits)
  expect(cold).toHaveLength(131)
  expect(new Set(cold)).toEqual(expected)
  expect(cold[0]).toBe(root)
  for (const path of cold.slice(1))
    expect(cold.indexOf(dirname(path))).toBeLessThan(cold.indexOf(path))
  expect(
    guidanceDirectories(root, [...visits.reverse(), dirname(root), root + '-sibling']),
  ).toEqual(cold)
})
