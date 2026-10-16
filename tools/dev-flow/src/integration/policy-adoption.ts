import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  requireCurrentAdoption,
  trustedDescriptor,
  contextPath,
  writeContext,
  parseAdoption,
  parseSource,
} from './context.ts'
import { blob, clean, git, repository, requireAncestor } from './git.ts'
import { ADOPTION_PREFIX, parsePolicy, requireCheckpointCoverage } from './policy.ts'
import { canonical, digest, fields, json, same, IntegrationError } from './parse.ts'
import { newOperation, operationHome, readRecord, writeRecord } from './records.ts'
import { materializeRunner, runCommands, checkCommandEvidence } from './verify.ts'
import { captureDigest, currentCapture, deliveryConfig, readAuthority } from './authority.ts'
import {
  annotatedObject,
  atomicUpdate,
  observeUpdates,
  targetHead,
  targetRefs,
} from './transport.ts'

/** A policy change invalidates all previous contexts and operations; the owner acknowledges this exact inventory. */
export function policyHandoff(root: string): unknown {
  const state = requireCurrentAdoption(root)
  const trees = git(root, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter(line => line.startsWith('worktree '))
    .map(line => line.slice(9))
    .sort()
  return {
    previous: state.anchor,
    disposition: 'invalidate-old-contexts-and-operations',
    trees: trees.map(path => {
      const info = repository(path),
        context = contextPath(path)
      return {
        root: info.root,
        gitDir: info.gitDir,
        branch: info.branch,
        head: info.head,
        contextDigest: existsSync(context) ? digest(readFileSync(context, 'utf8')) : null,
      }
    }),
  }
}
export function policyCheck(root: string): unknown {
  const state = requireCurrentAdoption(root),
    trusted = trustedDescriptor(root),
    measured = clean(root)
  if (trusted.descriptor === null)
    throw new IntegrationError('unknown', 'Committed descriptor missing')
  same(measured.head, trusted.main, 'New policy must be exact committed main')
  same(
    targetHead(root, state.policy, 'refs/heads/main'),
    trusted.main,
    'Authoritative main differs',
  )
  requireAncestor(root, state.source.commit, measured.head)
  const b = blob(root, measured.head, trusted.descriptor.policyPath)
  const source = {
    commit: measured.head,
    path: trusted.descriptor.policyPath,
    blob: b.oid,
    digest: digest(b.text),
  }
  const next = parsePolicy(json(b.text, 'next policy'))
  if (next.revision === state.policy.revision)
    throw new IntegrationError('refused', 'Policy revision must change')
  same(next.repository, state.policy.repository, 'Repository cannot change during policy adoption')
  same(
    next.transport,
    state.policy.transport,
    'Authority transport migration requires a separate explicit deployment',
  )
  requireCheckpointCoverage(next)
  for (const path of next.requiredFiles) blob(root, source.commit, path)
  deliveryConfig(root, next, source)
  const { operation, home } = newOperation(root),
    subject = join(home, 'subject')
  git(root, ['worktree', 'add', '--detach', subject, source.commit])
  const info = repository(subject)
  writeContext(subject, {
    schemaVersion: 1,
    root: info.root,
    gitDir: info.gitDir,
    branch: info.branch,
    anchor: state.anchor,
    targetBase: state.source.commit,
    tasks: [],
    ownerTask: null,
    operation,
  })
  const runner = materializeRunner(root, home, state.source.commit),
    runnerBefore = clean(runner)
  const commands = runCommands(state.policy, 'full', runner, subject, home, null)
  same(clean(subject), measured, 'Policy subject changed during old-rule verification')
  same(clean(runner), runnerBefore, 'Old policy runner changed')
  const handoff = policyHandoff(root),
    handoffDigest = digest(canonical(handoff))
  const checksDigest = writeRecord(home, 'policy-check.json', {
    previous: state.anchor,
    source,
    handoff,
    handoffDigest,
    commands,
  })
  return { operation, source, previous: state.anchor, handoff, handoffDigest, checksDigest }
}
export function adoptPolicy(root: string, operation: string, authority: string): unknown {
  const state = requireCurrentAdoption(root),
    home = operationHome(root, operation)
  const checked = readRecord(home, 'policy-check.json')
  const v = fields(
      checked.value,
      ['previous', 'source', 'handoff', 'handoffDigest', 'commands'],
      'policy check',
    ),
    source = parseSource(v.source)
  same(state.anchor, v.previous, 'Previous adoption changed')
  same(clean(root).head, source.commit, 'New policy source changed')
  same(
    targetHead(root, state.policy, 'refs/heads/main'),
    source.commit,
    'Main changed since policy checks',
  )
  same(policyHandoff(root), v.handoff, 'Live worktree handoff changed')
  checkCommandEvidence(v.commands)
  const config = deliveryConfig(root, state.policy, state.source),
    capture = currentCapture(config)
  const decision = readAuthority(state.policy, authority, capture)
  if (decision.action !== 'policy-adopt')
    throw new IntegrationError('refused', 'Policy adoption authority required')
  same(
    [decision.previous, decision.policyCommit, decision.handoffDigest, decision.checksDigest],
    [state.anchor, source.commit, v.handoffDigest, checked.digest],
    'Policy authority does not bind checked source and handoff',
  )
  const refs = targetRefs(root, state.policy),
    anchors = [...refs]
      .filter(([ref]) => ref.startsWith(ADOPTION_PREFIX))
      .sort(
        ([a], [b]) =>
          Number(a.slice(ADOPTION_PREFIX.length)) - Number(b.slice(ADOPTION_PREFIX.length)),
      )
  same(anchors.at(-1)?.[1], state.anchor, 'Authority adoption advanced; bootstrap first')
  const ref = `${ADOPTION_PREFIX}${anchors.length + 1}`
  const adoption = parseAdoption({
    schemaVersion: 1,
    repository: state.policy.repository,
    policy: source,
    previous: state.anchor,
    decision: authority,
    constructionHead: source.commit,
    legacy: [],
  })
  const updates = [
    { ref, old: null, next: annotatedObject(root, ref.slice(10), source.commit, adoption) },
  ]
  same(
    captureDigest(currentCapture(config)),
    captureDigest(capture),
    'Policy authority inputs changed',
  )
  writeRecord(home, 'policy-intent.json', { authority, updates })
  try {
    atomicUpdate(root, state.policy, updates)
  } catch (error) {
    if (!(error instanceof IntegrationError)) throw error
  }
  return {
    observation: observeUpdates(root, state.policy, updates),
    next: 'bootstrap; previous contexts and operations are invalidated, preserve their evidence and create explicitly dispatched replacement trees',
  }
}
