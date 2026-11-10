import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'

/** Runs git in `root` without the host's repository variables; a failure throws with stderr. */
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
  // The fixture carries its own identity: commits must not depend on the host's global Git config.
  git(root, ['config', 'user.name', 'Fixture'])
  git(root, ['config', 'user.email', 'fixture@example.test'])
  // Checked-out bytes equal committed bytes: Git for Windows defaults to autocrlf=true in its system
  // configuration and would rewrite checkouts with CRLF. POSIX Git already defaults to false.
  git(root, ['config', 'core.autocrlf', 'false'])
}
