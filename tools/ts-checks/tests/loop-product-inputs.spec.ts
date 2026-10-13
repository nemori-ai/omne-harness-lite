// @module-tag slow
// Enumerates real temporary Git trees and missing objects.
import { rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { engineeringEvidence } from '../src/loop/product-inputs.ts'
import { collectMemberSources } from '../src/metrics/sources.ts'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

it('uses the same source, test, declaration and archive scope for current and historical trees', () => {
  const root = repository()
  for (const path of [
    'packages/core/demo/src/中文\tfile.ts',
    'packages/core/demo/src/types.d.mts',
    'packages/core/demo/src/types.d.ts',
    'apps/demo/src/index.cts',
    'examples/demo/src/index.tsx',
    'packages/core/demo/tests/index.spec.ts',
    'apps/demo/tests/index.ts',
    'packages/core/demo/src/skip.js',
    'packages/core/demo/node_modules/skip/src/index.ts',
    'packages/core/demo/dist/src/index.ts',
    'packages/core/demo/coverage/src/index.ts',
    'packages/core/demo/old.legacy/src/index.ts',
    'packages/core/demo/old.legacy-not/src/index.ts',
    'tools/helper/src/index.ts',
  ])
    write(root, path, 'export const value = 1\n')
  const base = commit(root, 'input scope')
  const evidence = engineeringEvidence(root, collectMemberSources(root), [base, 'HEAD', base])
  expect(evidence.current).toEqual({ sources: 5, tests: 2 })
  expect(evidence.baselines).toEqual([{ commit: base, inputs: evidence.current }])
})

it('retains every exact baseline even after deleting or archiving the last input', () => {
  const root = repository()
  const empty = git(root, 'rev-parse', 'HEAD')
  write(root, 'apps/demo/src/index.ts', 'export const value = 1')
  const source = commit(root, 'source')
  git(root, 'mv', 'apps', 'apps.0.0.1.legacy')
  write(root, 'packages/core/demo/tests/index.spec.ts', 'test("test", () => {})')
  const tests = commit(root, 'tests')
  git(root, 'rm', '-r', '-q', 'packages')
  commit(root, 'empty again')
  expect(engineeringEvidence(root, collectMemberSources(root), [empty, source, tests])).toEqual({
    current: { sources: 0, tests: 0 },
    baselines: [
      { commit: empty, inputs: { sources: 0, tests: 0 } },
      { commit: source, inputs: { sources: 1, tests: 0 } },
      { commit: tests, inputs: { sources: 0, tests: 1 } },
    ],
  })
})

it('rejects invalid refs and unreadable trees without converting failure to empty input', () => {
  const root = repository()
  expect(() => engineeringEvidence(root, [], [])).toThrow('baseline evidence')
  expect(() => engineeringEvidence(root, [], ['missing-ref'])).toThrow()
  const tree = git(root, 'rev-parse', 'HEAD^{tree}')
  rmSync(join(root, '.git/objects', tree.slice(0, 2), tree.slice(2)))
  expect(() => engineeringEvidence(root, [], ['HEAD'])).toThrow()
})

it.each(['link', 'gitlink'])('rejects an unclassifiable historical product %s', kind => {
  const root = repository()
  write(root, 'apps/demo/README.md', 'member')
  if (kind === 'link') symlinkSync('../../README.md', join(root, 'apps/demo/linked'))
  else
    git(
      root,
      'update-index',
      '--add',
      '--cacheinfo',
      '160000',
      git(root, 'rev-parse', 'HEAD'),
      'apps/demo/nested',
    )
  if (kind === 'link') commit(root, 'link')
  else git(root, 'commit', '-qm', 'gitlink')
  const base = git(root, 'rev-parse', 'HEAD')
  expect(() => engineeringEvidence(root, [], [base])).toThrow('Cannot classify product inputs')
})

it.each(['apps', 'packages', 'examples'])('rejects historical links at the %s root', directory => {
  for (const kind of ['link', 'gitlink']) {
    const root = repository()
    if (kind === 'link') {
      write(root, 'off-root/demo/src/index.ts', 'export const value = 1')
      symlinkSync('off-root', join(root, directory))
      commit(root, 'root link')
    } else {
      git(
        root,
        'update-index',
        '--add',
        '--cacheinfo',
        '160000',
        git(root, 'rev-parse', 'HEAD'),
        directory,
      )
      git(root, 'commit', '-qm', 'root gitlink')
    }
    const base = git(root, 'rev-parse', 'HEAD')
    git(root, 'rm', '-f', directory)
    commit(root, 'remove root link')
    expect(() => engineeringEvidence(root, [], [base])).toThrow('Cannot classify product inputs')
  }
})
