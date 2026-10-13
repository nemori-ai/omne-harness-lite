// @module-tag slow
// Real formatter, selected Git indexes, installed hooks and linked worktrees.
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, symlinkSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  temporaryDirectory,
  write,
} from './fixtures/loop-canary/repository.ts'

const runner = fileURLToPath(new URL('../../../', import.meta.url))
afterEach(removeTemporaries)

function formattedRepository() {
  const root = repository()
  mkdirSync(join(root, 'scripts'))
  for (const path of [
    'scripts/git-environment.sh',
    'scripts/format.sh',
    'scripts/install-format-hook.sh',
    'scripts/pre-commit-format',
    '.prettierrc.json',
    '.prettierignore',
  ])
    copyFileSync(join(runner, path), join(root, path))
  symlinkSync(join(runner, 'node_modules'), join(root, 'node_modules'))
  write(root, '.gitignore', 'node_modules\n')
  write(root, 'package.json', '{"scripts":{"format:staged":"./scripts/format.sh staged"}}\n')
  write(root, 'tools/demo.ts', 'export const value = 1\n')
  commit(root, 'formatter fixture')
  return root
}

function run(root: string, script: string, args: string[], env = process.env) {
  return spawnSync('bash', [join(root, 'scripts', script), ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
}

function hooks(root: string) {
  return readdirSync(join(root, '.git/hooks')).map(name => [
    name,
    readFileSync(join(root, '.git/hooks', name)),
  ])
}

it(
  'keeps self-test index writes and hook installation out of an external repository',
  { timeout: 60_000 },
  () => {
    const a = formattedRepository(),
      b = formattedRepository()
    const before = {
      index: readFileSync(join(b, '.git/index')),
      head: git(b, 'rev-parse', 'HEAD'),
      hooks: hooks(b),
    }
    const env = {
      ...process.env,
      GIT_DIR: join(b, '.git'),
      GIT_WORK_TREE: b,
      GIT_INDEX_FILE: join(b, '.git/index'),
      OMNE_SUBJECT_ROOT: b,
      OMNE_RUNNER_ROOT: b,
    }
    const selftest = run(runner, 'test-formatting.sh', [], env)
    expect(selftest.status, selftest.stdout + selftest.stderr).toBe(0)
    const install = run(a, 'install-format-hook.sh', [], env)
    expect(install.status, install.stdout + install.stderr).toBe(0)
    expect(readFileSync(join(a, '.git/hooks/pre-commit'))).toEqual(
      readFileSync(join(a, 'scripts/pre-commit-format')),
    )
    expect({
      index: readFileSync(join(b, '.git/index')),
      head: git(b, 'rev-parse', 'HEAD'),
      hooks: hooks(b),
    }).toEqual(before)
    expect(run(a, 'install-format-hook.sh', [], env).stdout).toContain('already installed')
  },
)

it('checks the explicit bad subject even when Git routing points at a formatted repository', () => {
  const a = formattedRepository(),
    b = formattedRepository()
  write(a, 'tools/demo.ts', 'export const value={bad:true}\n')
  const result = run(runner, 'format.sh', ['check', 'tools/demo.ts'], {
    ...process.env,
    OMNE_SUBJECT_ROOT: a,
    GIT_DIR: join(b, '.git'),
    GIT_WORK_TREE: b,
    GIT_INDEX_FILE: join(b, '.git/index'),
  })
  expect(result.status, result.stdout + result.stderr).toBe(1)
  expect(result.stderr).toContain(join(a, 'tools/demo.ts'))
})

it.each([false, true])(
  'preserves relative selected indexes and the real commit hook in linked worktree=%s',
  { timeout: 60_000 },
  linked => {
    const main = formattedRepository()
    const root = linked ? join(temporaryDirectory('format-linked-'), 'worktree') : main
    if (linked) {
      git(main, 'worktree', 'add', '-qb', 'linked', root)
      symlinkSync(join(runner, 'node_modules'), join(root, 'node_modules'))
    }
    const selected = join(temporaryDirectory('format-index-'), 'selected')
    const gitIndex = resolve(root, git(root, 'rev-parse', '--git-path', 'index'))
    copyFileSync(gitIndex, selected)
    const env = { ...process.env, GIT_INDEX_FILE: relative(root, selected) }
    write(root, 'tools/demo.ts', 'export const value={bad:true}\n')
    git(root, 'add', 'tools/demo.ts')
    const before = readFileSync(gitIndex)
    expect(run(root, 'format.sh', ['staged']).status).toBe(1)
    expect(run(root, 'format.sh', ['staged'], env).status).toBe(0)
    expect(readFileSync(gitIndex)).toEqual(before)
    const stage = spawnSync('git', ['add', 'tools/demo.ts'], { cwd: root, env, encoding: 'utf8' })
    expect(stage.status).toBe(0)
    write(root, 'tools/demo.ts', 'export const value = 2\n')
    git(root, 'add', 'tools/demo.ts')
    expect(run(root, 'format.sh', ['staged']).status).toBe(0)
    expect(run(root, 'format.sh', ['staged'], env).status).toBe(1)
    expect(run(root, 'install-format-hook.sh', []).status).toBe(0)
    const rejected = spawnSync(
      'git',
      [
        '-c',
        'user.name=someone',
        '-c',
        'user.email=someone@example.com',
        'commit',
        '-qm',
        'selected bad',
      ],
      { cwd: root, env, encoding: 'utf8' },
    )
    expect(rejected.status).not.toBe(0)
    expect(spawnSync('git', ['add', 'tools/demo.ts'], { cwd: root, env }).status).toBe(0)
    const accepted = spawnSync(
      'git',
      [
        '-c',
        'user.name=someone',
        '-c',
        'user.email=someone@example.com',
        'commit',
        '-qm',
        'selected good',
      ],
      { cwd: root, env, encoding: 'utf8' },
    )
    expect(accepted.status, accepted.stdout + accepted.stderr).toBe(0)
    expect(git(root, 'show', 'HEAD:tools/demo.ts')).toBe('export const value = 2')
  },
)
