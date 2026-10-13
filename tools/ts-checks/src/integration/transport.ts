import { spawnSync } from 'node:child_process'
import { repositoryEnv } from '../git-environment.ts'
import type { Policy } from './policy.ts'
import { ancestor, git, GitError, lines, maybeRef } from './git.ts'
import { branch, canonical, sha, IntegrationError } from './parse.ts'

export type RefUpdate = { ref: string; old: string | null; next: string }
function validRef(ref: string): void {
  if (!ref.startsWith('refs/heads/') && !ref.startsWith('refs/tags/omne/integration/'))
    throw new IntegrationError('refused', `Unsupported ref ${ref}`)
  branch(ref)
}
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
    throw new IntegrationError('unknown', 'Cannot read complete authority refs')
  const refs = new Map<string, string>()
  for (const line of lines(result.stdout.trim())) {
    const [oid, ref, ...extra] = line.split(/\s+/)
    if (ref === undefined || extra.length > 0 || refs.has(ref))
      throw new IntegrationError('unknown', 'Invalid authority ref listing')
    refs.set(ref, sha(oid))
  }
  return refs
}
export function fetchObject(root: string, location: string, oid: string, timeoutMs: number): void {
  if (maybeRef(root, `${sha(oid)}^{object}`) === null)
    git(root, ['fetch', '--no-tags', '--', location, oid], undefined, timeoutMs)
}
export function targetRefs(root: string, policy: Policy): Map<string, string> {
  return remoteRefs(root, policy.transport.location, policy.timeouts.networkMs)
}
export function targetHead(root: string, policy: Policy, ref: string): string | null {
  validRef(ref)
  const oid = targetRefs(root, policy).get(ref) ?? null
  if (oid !== null) fetchObject(root, policy.transport.location, oid, policy.timeouts.networkMs)
  return oid
}
export function annotatedObject(
  root: string,
  name: string,
  target: string,
  metadata: unknown,
): string {
  branch(name)
  const identity = git(root, ['var', 'GIT_COMMITTER_IDENT'])
  const body = `object ${sha(target)}\ntype commit\ntag ${name}\ntagger ${identity}\n\n${canonical(metadata)}\n`
  return sha(git(root, ['mktag'], body))
}
export function atomicUpdate(root: string, policy: Policy, updates: RefUpdate[]): void {
  if (new Set(updates.map(update => update.ref)).size !== updates.length || updates.length === 0)
    throw new IntegrationError('input-error', 'Invalid ref transaction')
  for (const update of updates) {
    validRef(update.ref)
    sha(update.next)
    if (update.ref.startsWith('refs/tags/') && update.old !== null)
      throw new IntegrationError('refused', 'Tags are immutable')
    if (
      update.old !== null &&
      update.ref.startsWith('refs/heads/') &&
      !ancestor(root, update.old, update.next)
    )
      throw new IntegrationError('refused', 'Non-fast-forward update refused')
  }
  if (policy.transport.kind === 'local-bare') {
    const target = policy.transport.location
    if (git(target, ['rev-parse', '--is-bare-repository']) !== 'true')
      throw new IntegrationError(
        'refused',
        'Local target must be a bare repository; checked-out refs cannot move',
      )
    const packed = spawnSync('git', ['pack-objects', '--stdout', '--revs'], {
      env: repositoryEnv(process.env),
      cwd: root,
      input: updates.map(update => update.next).join('\n') + '\n',
      maxBuffer: 64 * 1024 * 1024,
    })
    if (packed.error !== undefined || packed.status !== 0)
      throw new IntegrationError('unknown', 'Cannot pack transaction objects')
    const unpacked = spawnSync('git', ['unpack-objects', '-q'], {
      env: repositoryEnv(process.env),
      cwd: target,
      input: packed.stdout,
      maxBuffer: 64 * 1024 * 1024,
    })
    if (unpacked.error !== undefined || unpacked.status !== 0)
      throw new IntegrationError('unknown', 'Cannot import transaction objects')
    const input = updates
      .map(update =>
        update.old === null
          ? `create ${update.ref} ${update.next}\n`
          : `update ${update.ref} ${update.next} ${update.old}\n`,
      )
      .join('')
    git(target, ['update-ref', '--stdin'], input)
    return
  }
  const argv = [
    'push',
    '--atomic',
    '--porcelain',
    ...updates.map(update => `--force-with-lease=${update.ref}:${update.old ?? ''}`),
    '--',
    policy.transport.location,
    ...updates.map(update => `${update.next}:${update.ref}`),
  ]
  const result = spawnSync('git', argv, {
    cwd: root,
    encoding: 'utf8',
    timeout: policy.timeouts.networkMs,
    env: { ...repositoryEnv(process.env), GIT_TERMINAL_PROMPT: '0' },
  })
  if (result.error !== undefined || result.status !== 0)
    throw new GitError(
      argv,
      result.status,
      'Atomic publication did not return success; inspect actual refs before retry',
    )
}
export type PublicationObservation = {
  kind: 'published' | 'published-advanced' | 'not-observed' | 'stale' | 'unknown'
  target: string | null
  reason: string
}
export function observeUpdates(
  root: string,
  policy: Policy,
  updates: RefUpdate[],
): PublicationObservation {
  try {
    const refs = targetRefs(root, policy)
    const branchUpdate = updates.find(update => update.ref.startsWith('refs/heads/'))
    if (branchUpdate === undefined) {
      const complete = updates.every(update => refs.get(update.ref) === update.next)
      const absent = updates.every(update => !refs.has(update.ref))
      return {
        kind: complete ? 'published' : absent ? 'not-observed' : 'unknown',
        target: null,
        reason: 'Observed immutable ref transaction',
      }
    }
    const target = refs.get(branchUpdate.ref) ?? null
    const tags = updates.filter(update => update.ref.startsWith('refs/tags/'))
    const exactTags = tags.every(update => refs.get(update.ref) === update.next)
    const absentTags = tags.every(update => !refs.has(update.ref))
    if (target === branchUpdate.old && absentTags)
      return { kind: 'not-observed', target, reason: 'Expected base remains and tags are absent' }
    if (target !== null)
      fetchObject(root, policy.transport.location, target, policy.timeouts.networkMs)
    if (target === branchUpdate.next && exactTags)
      return { kind: 'published', target, reason: 'Branch and tags match intent' }
    if (target !== null && exactTags && ancestor(root, branchUpdate.next, target))
      return {
        kind: 'published-advanced',
        target,
        reason: 'Exact unit remains and target includes the published candidate',
      }
    if (absentTags && target !== branchUpdate.old)
      return { kind: 'stale', target, reason: 'Target moved without this unit' }
    return {
      kind: 'unknown',
      target,
      reason: 'Split refs or tag collision; do not replay transaction',
    }
  } catch (error) {
    if (error instanceof IntegrationError)
      return { kind: 'unknown', target: null, reason: error.message }
    throw error
  }
}
