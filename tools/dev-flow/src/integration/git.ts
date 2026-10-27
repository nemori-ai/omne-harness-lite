import { spawnSync } from 'node:child_process'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { IntegrationError, sha } from './parse.ts'

export class GitError extends IntegrationError {
  readonly argv: readonly string[]
  readonly status: number | null
  readonly stderr: string
  constructor(argv: readonly string[], status: number | null, stderr: string) {
    super('unknown', `git ${argv[0]} failed (${status ?? 'interrupted'}): ${stderr.trim()}`)
    this.argv = argv
    this.status = status
    this.stderr = stderr
  }
}
function gitOutput(
  root: string,
  argv: readonly string[],
  input?: string,
  timeoutMs?: number,
): Buffer {
  const result = spawnSync('git', [...argv], {
    cwd: root,
    input,
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...repositoryEnv(process.env), GIT_TERMINAL_PROMPT: '0' },
  })
  if (result.error !== undefined || result.status !== 0)
    throw new GitError(
      argv,
      result.status,
      result.error?.message ?? result.stderr?.toString('utf8') ?? '',
    )
  return result.stdout
}
export function git(
  root: string,
  argv: readonly string[],
  input?: string,
  timeoutMs?: number,
): string {
  return gitOutput(root, argv, input, timeoutMs).toString('utf8').trimEnd()
}
export function maybeRef(root: string, ref: string): string | null {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], {
    env: repositoryEnv(process.env),
    cwd: root,
    encoding: 'utf8',
  })
  if (result.error !== undefined) throw result.error
  if (result.status === 1) return null
  if (result.status !== 0) throw new GitError(['rev-parse', ref], result.status, result.stderr)
  return sha(result.stdout.trim())
}
export function ancestor(root: string, older: string, newer: string): boolean {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', sha(older), sha(newer)], {
    env: repositoryEnv(process.env),
    cwd: root,
    encoding: 'utf8',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0 && result.status !== 1)
    throw new GitError(['merge-base'], result.status, result.stderr)
  return result.status === 0
}
export function requireAncestor(root: string, older: string, newer: string): void {
  if (!ancestor(root, older, newer))
    throw new IntegrationError('refused', `${older} is not an ancestor of ${newer}`)
}
export function repository(root: string): {
  root: string
  commonDir: string
  gitDir: string
  branch: string
  head: string
} {
  const actual = realpathSync(git(root, ['rev-parse', '--show-toplevel']))
  return {
    root: actual,
    commonDir: realpathSync(resolve(actual, git(actual, ['rev-parse', '--git-common-dir']))),
    gitDir: realpathSync(resolve(actual, git(actual, ['rev-parse', '--git-dir']))),
    branch: git(actual, ['branch', '--show-current']),
    head: sha(git(actual, ['rev-parse', 'HEAD'])),
  }
}
export function clean(root: string): { head: string; tree: string } {
  if (git(root, ['status', '--porcelain=v1', '--untracked-files=all']) !== '')
    throw new IntegrationError('refused', `Worktree is not clean: ${root}`)
  return {
    head: sha(git(root, ['rev-parse', 'HEAD'])),
    tree: sha(git(root, ['rev-parse', 'HEAD^{tree}'])),
  }
}
function blobId(root: string, commit: string, path: string): string {
  const oid = sha(git(root, ['rev-parse', `${sha(commit)}:${path}`]))
  if (git(root, ['cat-file', '-t', oid]) !== 'blob')
    throw new IntegrationError('unknown', `${path} is not a committed blob`)
  return oid
}
/** Preserves all UTF-8 text bytes for source digests; invalid UTF-8 is refused. */
export function exactTextBlob(root: string, commit: string, path: string): ReturnType<typeof blob> {
  const oid = blobId(root, commit, path)
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    gitOutput(root, ['cat-file', 'blob', oid]),
  )
  return { text, oid }
}
export function blob(root: string, commit: string, path: string): { text: string; oid: string } {
  const oid = blobId(root, commit, path)
  return { text: git(root, ['cat-file', 'blob', oid]), oid }
}
export function maybeBlob(
  root: string,
  commit: string,
  path: string,
): ReturnType<typeof blob> | null {
  if (maybeRef(root, `${sha(commit)}:${path}`) === null) return null
  return blob(root, commit, path)
}
export function lines(value: string): string[] {
  return value === '' ? [] : value.split('\n')
}
