import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { remoteRefs, fetchObject } from './transport.ts'
import { parseTaskBinding, type TaskBinding } from '../delivery/binding.ts'
import { blob, git, maybeBlob, maybeRef, repository, ancestor, clean } from './git.ts'
import {
  ADOPTION_PREFIX,
  DESCRIPTOR_PATH,
  POLICY_PATH,
  parseDescriptor,
  parsePolicy,
  type Policy,
  type Descriptor,
} from './policy.ts'
import {
  array,
  fields,
  json,
  literal,
  sha,
  string,
  digest,
  same,
  IntegrationError,
} from './parse.ts'

export type PolicySource = { commit: string; path: string; blob: string; digest: string }
export type TaskAudit = { binding: TaskBinding; taskSource: string }
export type Context = {
  schemaVersion: 1
  root: string
  gitDir: string
  branch: string
  /** Adoption anchor of the retired adoption path; null for contexts written without adoption. */
  anchor: string | null
  targetBase: string
  tasks: TaskAudit[]
  ownerTask: TaskBinding | null
  operation: string | null
}
export type Legacy = { root: string; gitDir: string; branch: string; head: string; task: string }
export const BOOTSTRAP_CHECK_ENV = 'OMNE_INTEGRATION_BOOTSTRAP_CHECK'
export type BootstrapCheck = {
  operation: string
  root: string
  gitDir: string
  constructionHead: string
  descriptorDigest: string
  namespace: string
}
export function firstAdoptionScope(root: string, operation: string): BootstrapCheck {
  const info = repository(root),
    trusted = trustedDescriptor(root)
  if (trusted.descriptor === null)
    throw new IntegrationError('unknown', 'Committed descriptor missing')
  return {
    operation,
    root: info.root,
    gitDir: info.gitDir,
    constructionHead: trusted.main,
    descriptorDigest: digest(blob(root, trusted.main, DESCRIPTOR_PATH).text),
    namespace: ADOPTION_PREFIX,
  }
}
/** Every consumer re-reads the authority. Scope alone never establishes absence or grants adoption. */
export function observeFirstAdoptionAbsence(root: string, value: unknown) {
  const scope = fields(
    value,
    ['operation', 'root', 'gitDir', 'constructionHead', 'descriptorDigest', 'namespace'],
    'bootstrap check scope',
  )
  string(scope.operation, 'operation')
  const info = repository(root),
    trusted = trustedDescriptor(root)
  if (trusted.descriptor === null)
    throw new IntegrationError('unknown', 'Committed descriptor missing')
  same(
    [scope.root, scope.gitDir, scope.constructionHead, scope.namespace, scope.descriptorDigest],
    [
      info.root,
      info.gitDir,
      trusted.main,
      ADOPTION_PREFIX,
      digest(blob(root, trusted.main, DESCRIPTOR_PATH).text),
    ],
    'Bootstrap check belongs to another construction or worktree',
  )
  same(clean(root).head, trusted.main, 'Bootstrap check requires clean exact construction main')
  if (
    existsSync(join(info.commonDir, 'omne-integration', 'anchor.json')) ||
    git(root, ['for-each-ref', '--format=%(refname)', ADOPTION_PREFIX]) !== '' ||
    git(root, ['config', '--local', '--list'])
      .split('\n')
      .some(line => line.toLowerCase() === 'omne.integrationadopted=true')
  )
    throw new IntegrationError(
      'unknown',
      'Previously adopted repository cannot use first-adoption absence',
    )
  const startedAt = new Date().toISOString()
  const refs = remoteRefs(root, trusted.descriptor.remote, 30_000)
  if ([...refs.keys()].some(ref => ref.startsWith(ADOPTION_PREFIX)))
    throw new IntegrationError('unknown', 'Authority adoption exists; bootstrap is required')
  same(refs.get('refs/heads/main'), trusted.main, 'Authority main changed during bootstrap checks')
  return {
    scope,
    startedAt,
    finishedAt: new Date().toISOString(),
    completeness: 'complete' as const,
    namespace: ADOPTION_PREFIX,
    adoptionRefs: [],
  }
}
export type Adoption = {
  schemaVersion: 1
  repository: string
  policy: PolicySource
  previous: string | null
  decision: string
  constructionHead: string
  legacy: Legacy[]
}
export type IntegrationState =
  | {
      kind: 'pending'
      reason: 'descriptor-not-committed' | 'positive-absence' | 'generic-unadopted'
      main: string | null
    }
  | { kind: 'unknown'; reason: string }
  | { kind: 'legacy'; anchor: string; policy: Policy; source: PolicySource; legacy: Legacy }
  | {
      kind: 'adopted'
      anchor: string
      policy: Policy
      source: PolicySource
      context: Context | null
    }

export function parseSource(value: unknown): PolicySource {
  const p = fields(value, ['commit', 'path', 'blob', 'digest'], 'policy source')
  const result = {
    commit: sha(p.commit),
    path: string(p.path, 'policy.path'),
    blob: sha(p.blob),
    digest: string(p.digest, 'policy.digest'),
  }
  if (!/^[0-9a-f]{64}$/.test(result.digest))
    throw new IntegrationError('input-error', 'Invalid policy digest')
  return result
}
export function parseAdoption(value: unknown): Adoption {
  const v = fields(
    value,
    ['schemaVersion', 'repository', 'policy', 'previous', 'decision', 'constructionHead', 'legacy'],
    'adoption',
  )
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'schemaVersion'),
    repository: string(v.repository, 'repository'),
    policy: parseSource(v.policy),
    previous: v.previous === null ? null : sha(v.previous),
    decision: string(v.decision, 'decision'),
    constructionHead: sha(v.constructionHead),
    legacy: array(v.legacy, 'legacy').map(item => {
      const l = fields(item, ['root', 'gitDir', 'branch', 'head', 'task'], 'legacy')
      return {
        root: string(l.root, 'legacy.root'),
        gitDir: string(l.gitDir, 'legacy.gitDir'),
        branch: string(l.branch, 'legacy.branch'),
        head: sha(l.head),
        task: string(l.task, 'legacy.task'),
      }
    }),
  }
}
export function parseAudit(value: unknown): TaskAudit {
  const v = fields(value, ['binding', 'taskSource'], 'audit')
  return { binding: parseTaskBinding(v.binding), taskSource: sha(v.taskSource, 'taskSource') }
}
export function parseContext(value: unknown): Context {
  const v = fields(
    value,
    [
      'schemaVersion',
      'root',
      'gitDir',
      'branch',
      'anchor',
      'targetBase',
      'tasks',
      'ownerTask',
      'operation',
    ],
    'context',
  )
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'schemaVersion'),
    root: string(v.root, 'root'),
    gitDir: string(v.gitDir, 'gitDir'),
    branch: typeof v.branch === 'string' ? v.branch : string(v.branch, 'branch'),
    anchor: v.anchor === null ? null : sha(v.anchor),
    targetBase: sha(v.targetBase),
    tasks: array(v.tasks, 'tasks').map(parseAudit),
    ownerTask: v.ownerTask === null ? null : parseTaskBinding(v.ownerTask),
    operation: v.operation === null ? null : string(v.operation, 'operation'),
  }
}
export function contextPath(root: string): string {
  return join(repository(root).gitDir, 'omne-integration-context.json')
}
/** Reads this tree's task context and checks that it belongs to this tree and branch. */
export function readContext(root: string): Context {
  const info = repository(root),
    path = contextPath(root),
    context = parseContext(json(readFileSync(path, 'utf8'), path))
  same(
    [context.root, context.gitDir, context.branch],
    [info.root, info.gitDir, info.branch],
    'Context belongs to another tree, branch or adoption',
  )
  return context
}
export type Workspace = {
  policy: Policy
  source: PolicySource
  context: Context | null
  anchor: string | null
}
/**
 * Task admission reads the policy committed at this tree's HEAD. It needs no adoption anchor:
 * trunk publication is enforced by the platform, and this check only keeps local work on its task.
 */
export function taskWorkspace(root: string): Workspace {
  const info = repository(root)
  const descriptor = maybeBlob(root, info.head, DESCRIPTOR_PATH)
  const path =
    descriptor === null
      ? POLICY_PATH
      : parseDescriptor(json(descriptor.text, DESCRIPTOR_PATH)).policyPath
  const file = maybeBlob(root, info.head, path)
  if (file === null) throw new IntegrationError('unknown', `Committed ${path} is missing`)
  const policy = parsePolicy(json(file.text, 'policy'))
  const anchorFile = join(info.commonDir, 'omne-integration', 'anchor.json')
  return {
    policy,
    source: { commit: info.head, path, blob: file.oid, digest: digest(file.text) },
    context: existsSync(contextPath(root)) ? readContext(root) : null,
    anchor: existsSync(anchorFile)
      ? sha(fields(json(readFileSync(anchorFile, 'utf8'), 'anchor'), ['anchor'], 'anchor').anchor)
      : null,
  }
}
export function writeContext(root: string, context: Context): void {
  writeFileSync(contextPath(root), `${JSON.stringify(context, null, 2)}\n`, { flag: 'wx' })
}
export function trustedDescriptor(root: string): { main: string; descriptor: Descriptor | null } {
  const main = maybeRef(root, 'refs/remotes/origin/main') ?? maybeRef(root, 'refs/heads/main')
  if (main === null) throw new IntegrationError('unknown', 'Trusted main ref is missing')
  const descriptor = maybeBlob(root, main, DESCRIPTOR_PATH)
  return {
    main,
    descriptor:
      descriptor === null ? null : parseDescriptor(json(descriptor.text, DESCRIPTOR_PATH)),
  }
}
export function readTag(
  root: string,
  object: string,
): { target: string; body: unknown; name: string } {
  if (git(root, ['cat-file', '-t', sha(object)]) !== 'tag')
    throw new IntegrationError('unknown', 'Expected an annotated tag')
  const text = git(root, ['cat-file', 'tag', object])
  const split = text.indexOf('\n\n')
  const header = text.slice(0, split).split('\n')
  const target = header.find(line => line.startsWith('object '))?.slice(7)
  const name = header.find(line => line.startsWith('tag '))?.slice(4)
  if (!header.includes('type commit') || split < 0)
    throw new IntegrationError('unknown', 'Tag must point to a commit')
  return {
    target: sha(target),
    name: string(name, 'tag name'),
    body: json(text.slice(split + 2), 'tag annotation'),
  }
}
export function adoptedSource(
  root: string,
  anchor: string,
  descriptor: Descriptor,
): { adoption: Adoption; policy: Policy } {
  const tag = readTag(root, anchor),
    adoption = parseAdoption(tag.body)
  same(adoption.repository, descriptor.repository, 'Adoption repository mismatch')
  same(adoption.policy.path, descriptor.policyPath, 'Adoption policy path mismatch')
  same(tag.target, adoption.policy.commit, 'Adoption does not point at policy commit')
  const source = blob(root, adoption.policy.commit, adoption.policy.path)
  same(
    { blob: source.oid, digest: digest(source.text) },
    { blob: adoption.policy.blob, digest: adoption.policy.digest },
    'Policy object mismatch',
  )
  const policy = parsePolicy(json(source.text, 'policy'))
  same(policy.repository, descriptor.repository, 'Policy repository mismatch')
  return { adoption, policy }
}
export function latchAnchor(root: string, anchor: string): void {
  const info = repository(root)
  mkdirSync(join(info.commonDir, 'omne-integration'), { recursive: true })
  writeFileSync(join(info.commonDir, 'omne-integration', 'anchor.json'), JSON.stringify({ anchor }))
  git(root, ['config', '--local', 'omne.integrationAdopted', 'true'])
}
export function loadIntegration(root: string): IntegrationState {
  try {
    const info = repository(root)
    const latch = git(root, ['config', '--local', '--list'])
      .split('\n')
      .some(line => line.toLowerCase() === 'omne.integrationadopted=true')
    const anchorFile = join(info.commonDir, 'omne-integration', 'anchor.json')
    if (
      maybeRef(root, 'refs/remotes/origin/main') === null &&
      maybeRef(root, 'refs/heads/main') === null &&
      git(root, ['remote']) === '' &&
      git(root, ['for-each-ref', '--format=%(refname)', ADOPTION_PREFIX]) === '' &&
      !existsSync(anchorFile) &&
      !latch &&
      git(root, ['log', '--all', '--format=%H', '--', DESCRIPTOR_PATH]) === ''
    )
      return { kind: 'pending', reason: 'generic-unadopted', main: null }
    return loadKnown(info, trustedDescriptor(root), anchorFile, latch)
  } catch (error) {
    if (error instanceof IntegrationError) return { kind: 'unknown', reason: error.message }
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return { kind: 'unknown', reason: 'Adoption or context file is missing' }
    throw error
  }
}
function loadKnown(
  info: ReturnType<typeof repository>,
  trusted: ReturnType<typeof trustedDescriptor>,
  anchorFile: string,
  latch: boolean,
): IntegrationState {
  if (trusted.descriptor === null) {
    if (
      latch ||
      existsSync(anchorFile) ||
      git(info.root, ['for-each-ref', '--format=%(refname)', ADOPTION_PREFIX]) !== '' ||
      git(info.root, ['log', trusted.main, '--format=%H', '--', DESCRIPTOR_PATH]) !== ''
    )
      return { kind: 'unknown', reason: 'Adopted repository lost its trusted descriptor' }
    return { kind: 'pending', reason: 'descriptor-not-committed', main: trusted.main }
  }
  if (!existsSync(anchorFile)) {
    const scope = process.env[BOOTSTRAP_CHECK_ENV]
    if (scope !== undefined) {
      observeFirstAdoptionAbsence(info.root, json(scope, BOOTSTRAP_CHECK_ENV))
      return { kind: 'pending', reason: 'positive-absence', main: trusted.main }
    }
    return { kind: 'unknown', reason: 'Bootstrap required: no verified adoption anchor' }
  }
  const anchor = sha(
    fields(json(readFileSync(anchorFile, 'utf8'), 'anchor'), ['anchor'], 'anchor').anchor,
  )
  const { adoption, policy } = adoptedSource(info.root, anchor, trusted.descriptor)
  const anchorRefs = git(info.root, [
    'for-each-ref',
    '--format=%(objectname)',
    ADOPTION_PREFIX,
  ]).split('\n')
  if (!anchorRefs.includes(anchor))
    return { kind: 'unknown', reason: 'Adoption anchor ref is missing' }
  const path = contextPath(info.root)
  if (existsSync(path)) {
    const context = readContext(info.root)
    if (context.anchor !== null)
      same(context.anchor, anchor, 'Context belongs to another tree, branch or adoption')
    return { kind: 'adopted', anchor, policy, source: adoption.policy, context }
  }
  const legacy = adoption.legacy.find(
    item =>
      item.root === info.root &&
      item.gitDir === info.gitDir &&
      item.branch === info.branch &&
      ancestor(info.root, item.head, info.head),
  )
  if (legacy !== undefined)
    return { kind: 'legacy', anchor, policy, source: adoption.policy, legacy }
  return { kind: 'adopted', anchor, policy, source: adoption.policy, context: null }
}
export function requireAdopted(root: string): Extract<IntegrationState, { kind: 'adopted' }> {
  const state = loadIntegration(root)
  if (state.kind !== 'adopted')
    throw new IntegrationError('unknown', `Integration is ${state.kind}`)
  return state
}
/** Operation admission reads the authority; a local status cache cannot authorize old policy. */
export function requireCurrentAdoption(
  root: string,
): Extract<IntegrationState, { kind: 'adopted' }> {
  const state = requireAdopted(root),
    trusted = trustedDescriptor(root)
  if (trusted.descriptor === null)
    throw new IntegrationError('unknown', 'Committed descriptor missing')
  const refs = remoteRefs(
    root,
    trusted.descriptor.remote,
    state.policy.timeouts.networkMs,
    `${ADOPTION_PREFIX}*`,
  )
  const chain = [...refs]
    .map(([ref, oid]) => {
      const suffix = ref.slice(ADOPTION_PREFIX.length)
      if (!/^[1-9]\d*$/.test(suffix))
        throw new IntegrationError('unknown', 'Unexpected authority adoption ref')
      return { number: Number(suffix), oid }
    })
    .sort((a, b) => a.number - b.number)
  if (chain.length === 0) throw new IntegrationError('unknown', 'Authority lost its adoption chain')
  if (chain.at(-1)?.oid !== state.anchor)
    throw new IntegrationError(
      'stale',
      'Authority adoption changed; explicit bootstrap and task handoff required',
    )
  let previous: string | null = null
  for (const [index, entry] of chain.entries()) {
    same(entry.number, index + 1, 'Authority adoption chain has a gap')
    fetchObject(root, trusted.descriptor.remote, entry.oid, state.policy.timeouts.networkMs)
    const read = adoptedSource(root, entry.oid, trusted.descriptor)
    same(read.adoption.previous, previous, 'Authority adoption chain changed')
    previous = entry.oid
  }
  return state
}
/**
 * Without a task context a tree checks against the explicit base, or the caller's default.
 * With one, the fixed targetBase and the task audits apply.
 */
export function baselines(
  root: string,
  explicitBase?: string,
): { state: IntegrationState['kind']; targetBase: string | undefined; audits: TaskAudit[] } {
  if (!existsSync(contextPath(root)))
    return { state: 'pending', targetBase: explicitBase, audits: [] }
  const context = readContext(root)
  if (explicitBase !== undefined)
    same(
      maybeRef(root, `${explicitBase}^{commit}`),
      context.targetBase,
      'Explicit base differs from fixed targetBase',
    )
  return {
    state: 'adopted',
    targetBase: context.targetBase,
    audits:
      context.operation === null && context.ownerTask !== null
        ? [{ binding: context.ownerTask, taskSource: repository(root).head }]
        : context.tasks,
  }
}

export function firstAdoptionCommit(root: string, anchor: string): string {
  let adoption = parseAdoption(readTag(root, anchor).body)
  const seen = new Set<string>([anchor])
  while (adoption.previous !== null) {
    if (seen.has(adoption.previous)) throw new IntegrationError('unknown', 'Adoption chain cycle')
    seen.add(adoption.previous)
    adoption = parseAdoption(readTag(root, adoption.previous).body)
  }
  return adoption.constructionHead
}
