import { spawnSync } from 'node:child_process'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'
import type { Policy } from './policy.ts'
import { git, lines, maybeBlob, maybeRef } from './git.ts'
import { branch, sha, IntegrationError } from './parse.ts'

/**
 * Lists remote refs matching the patterns. Git matches patterns against the tail of a ref name,
 * so callers look up exact ref names in the result.
 */
export function remoteRefs(
  root: string,
  location: string,
  timeoutMs: number,
  patterns: string | readonly string[] = 'refs/*',
): Map<string, string> {
  const wanted = typeof patterns === 'string' ? [patterns] : patterns
  const result = spawnSync('git', ['ls-remote', '--refs', '--', location, ...wanted], {
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
/** Fetches, in one fetch, every listed object that is missing locally. */
export function fetchObjects(
  root: string,
  location: string,
  oids: readonly string[],
  timeoutMs: number,
): void {
  if (oids.length === 0) return
  const missing = lines(
    git(root, ['cat-file', '--batch-check'], `${oids.map(oid => sha(oid)).join('\n')}\n`),
  )
    .filter(line => line.endsWith(' missing'))
    .map(line => sha(line.slice(0, -' missing'.length)))
  if (missing.length > 0)
    git(root, ['fetch', '--no-tags', '--', location, ...missing], undefined, timeoutMs)
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
    remoteRefs(root, policy.transport.location, policy.timeouts.networkMs, ref).get(ref) ?? null
  if (oid !== null) fetchObject(root, policy.transport.location, oid, policy.timeouts.networkMs)
  return oid
}
/**
 * Returns the message of an annotated tag object: the bytes after the blank line that ends
 * the tag header. Fetches the object first when it is missing locally. A lightweight tag,
 * whose ref names a commit instead of a tag object, is unknown.
 */
export function tagMessage(root: string, location: string, oid: string, timeoutMs: number): string {
  fetchObject(root, location, oid, timeoutMs)
  if (git(root, ['cat-file', '-t', sha(oid)]) !== 'tag')
    throw new IntegrationError('unknown', `${oid} is not an annotated tag`)
  const text = git(root, ['cat-file', 'tag', oid]),
    end = text.indexOf('\n\n')
  return end === -1 ? '' : text.slice(end + 2)
}
/** Reads a committed file from a remote commit, fetching it when missing; null when absent. */
export function remoteFile(
  root: string,
  location: string,
  commit: string,
  path: string,
  timeoutMs: number,
): string | null {
  fetchObject(root, location, commit, timeoutMs)
  return maybeBlob(root, commit, path)?.text ?? null
}
