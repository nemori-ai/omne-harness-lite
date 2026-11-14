import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'

export function git(root: string, argv: readonly string[]): string {
  const result = spawnSync('git', [...argv], {
    cwd: root,
    encoding: 'utf8',
    env: { ...repositoryEnv(process.env), GIT_TERMINAL_PROMPT: '0' },
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`git ${argv[0]} failed: ${result.stderr.trim()}`)
  return result.stdout.trimEnd()
}
export function commit(root: string, name: string, content: string): string {
  writeFileSync(join(root, name), content)
  git(root, ['add', '--', name])
  git(root, ['commit', '-m', `Fixture ${name}`])
  return git(root, ['rev-parse', 'HEAD'])
}
export function init(root: string): void {
  mkdirSync(root, { recursive: true })
  git(root, ['init'])
  git(root, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
  git(root, ['config', 'user.name', 'Fixture'])
  git(root, ['config', 'user.email', 'fixture@example.test'])
  git(root, ['config', 'core.autocrlf', 'false'])
}
