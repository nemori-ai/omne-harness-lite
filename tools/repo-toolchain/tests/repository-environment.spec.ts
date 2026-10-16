// @module-tag slow
// Exercises real Git routing, object storage and local transport.
import { copyFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import {
  ancestor,
  clean,
  git,
  maybeRef,
  repository as coordinates,
} from '../src/integration/git.ts'
import { remoteRefs } from '../src/integration/transport.ts'
import { fileAt, git as metricsGit } from '../src/core/git.ts'
import { readRevisionTexts } from '../src/core/revision-files.ts'
import { readCommits } from '../src/commits.ts'
import { repositoryEnv } from '../src/core/git-environment.ts'
import {
  commit,
  git as fixtureGit,
  removeTemporaries,
  repository,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(() => {
  vi.unstubAllEnvs()
  removeTemporaries()
})

it('preserves execution, authentication and integration settings without changing its input', () => {
  const base = {
    ...process.env,
    GIT_DIR: '/foreign',
    GIT_TERMINAL_PROMPT: '1',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'test.value',
    GIT_CONFIG_VALUE_0: 'kept',
    GIT_SSH_COMMAND: 'custom-ssh',
    SSH_AUTH_SOCK: '/agent',
    OMNE_SUBJECT_ROOT: '/subject',
    OMNE_RUNNER_ROOT: '/runner',
    OMNE_TEST_TIER: 'slow',
    OMNE_TEST_SLOT_HELD: '1',
    OMNE_TEST_TIMING_FILE: '/timings',
    OMNE_CORE_VERIFICATION_EVIDENCE_ROOT: '/evidence',
  }
  const snapshot = { ...base }
  const env = repositoryEnv(base)
  expect(base).toEqual(snapshot)
  const { GIT_DIR, ...retained } = base
  expect(env).toEqual(retained)
  expect(GIT_DIR).toBe('/foreign')
})

it.each([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_SHALLOW_FILE',
])('keeps explicit repository observations and writes local under %s', key => {
  const a = repository(),
    b = repository()
  write(a, 'identity', 'A')
  const first = commit(a, 'A first')
  write(a, 'identity', 'A second')
  const head = commit(a, 'A second')
  write(b, 'identity', 'B')
  const foreignHead = commit(b, 'B')
  write(a, 'identity', 'dirty A')
  const externalIndex = join(b, 'external-index')
  copyFileSync(join(b, '.git/index'), externalIndex)
  const shallow = join(b, 'shallow')
  write(b, 'shallow', head + '\n')
  const paths: Record<string, string> = {
    GIT_DIR: join(b, '.git'),
    GIT_WORK_TREE: b,
    GIT_INDEX_FILE: externalIndex,
    GIT_COMMON_DIR: join(b, '.git'),
    GIT_OBJECT_DIRECTORY: join(b, '.git/objects'),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: join(b, '.git/objects'),
    GIT_NAMESPACE: 'foreign',
    GIT_SHALLOW_FILE: shallow,
  }
  const before = {
    index: readFileSync(externalIndex),
    gitIndex: readFileSync(join(b, '.git/index')),
    refs: fixtureGit(b, 'show-ref'),
    file: readFileSync(join(b, 'identity')),
  }
  const value = paths[key]
  if (value === undefined) throw new Error('Missing hostile fixture')
  vi.stubEnv(key, value)
  expect(git(a, ['rev-parse', 'HEAD'])).toBe(head)
  expect(metricsGit(a, ['rev-parse', 'HEAD'])).toBe(head)
  expect(coordinates(a).commonDir).toBe(join(a, '.git'))
  expect(() => clean(a)).toThrow('not clean')
  expect(maybeRef(a, 'HEAD')).toBe(head)
  expect(maybeRef(a, `${foreignHead}^{object}`)).toBeNull()
  expect(git(a, ['diff', '--', 'identity'])).toContain('dirty A')
  expect(maybeRef(a, 'refs/heads/missing')).toBeNull()
  expect(ancestor(a, first, head)).toBe(true)
  expect(fileAt(a, head, 'identity')).toBe('A second')
  expect(readRevisionTexts(a, head, ['identity']).get('identity')).toBe('A second')
  expect(readCommits(a).map(record => record.sha)).toContain(first)
  expect(remoteRefs(a, a, 10_000).get('refs/heads/main')).toBe(head)
  const object = git(a, ['hash-object', '-w', '--stdin'], 'unique local object ' + key)
  git(a, ['add', 'identity'])
  vi.unstubAllEnvs()
  expect(fixtureGit(a, 'cat-file', '-p', object)).toBe('unique local object ' + key)
  expect(fixtureGit(a, 'show', ':identity')).toBe('dirty A')
  expect({
    index: readFileSync(externalIndex),
    gitIndex: readFileSync(join(b, '.git/index')),
    refs: fixtureGit(b, 'show-ref'),
    file: readFileSync(join(b, 'identity')),
  }).toEqual(before)
})
