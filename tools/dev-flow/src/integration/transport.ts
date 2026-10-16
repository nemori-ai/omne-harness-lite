import { spawnSync } from 'node:child_process'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'
import type { Policy } from './policy.ts'
import { git, lines, maybeRef } from './git.ts'
import { branch, sha, IntegrationError } from './parse.ts'

export function remoteRefs(
  root: string,
  location: string,
  timeoutMs: number,
  pattern = 'refs/*',
): Map<string, string> {
  const result = spawnSync('git', ['ls-remote', '--refs', '--', location, pattern], {
    cwd: root,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...repositoryEnv(process.env), GIT_TERMINAL_PROMPT: '0' },
  })
  if (result.error !== undefined || result.status !== 0)
    throw new IntegrationError('unknown', `Cannot read remote refs from ${location}`)
  const refs = new Map<string, string>()
  for (const line of lines(result.stdout.trim())) {
    const [oid, ref, ...extra] = line.split(/\s+/)
    if (ref === undefined || extra.length > 0 || refs.has(ref))
      throw new IntegrationError('unknown', 'Invalid remote ref listing')
    refs.set(ref, sha(oid))
  }
  return refs
}
export function fetchObject(root: string, location: string, oid: string, timeoutMs: number): void {
  if (maybeRef(root, `${sha(oid)}^{object}`) === null)
    git(root, ['fetch', '--no-tags', '--', location, oid], undefined, timeoutMs)
}
/**
 * Reads the current commit of a remote branch and makes it available locally.
 * Returns null when the remote has no such branch; throws when the remote cannot be read.
 */
export function targetHead(root: string, policy: Policy, ref: string): string | null {
  if (!ref.startsWith('refs/heads/'))
    throw new IntegrationError('refused', `Unsupported target ref ${ref}`)
  branch(ref)
  const oid =
    remoteRefs(root, policy.transport.location, policy.timeouts.networkMs).get(ref) ?? null
  if (oid !== null) fetchObject(root, policy.transport.location, oid, policy.timeouts.networkMs)
  return oid
}
