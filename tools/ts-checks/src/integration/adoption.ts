import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ADOPTION_PREFIX, parsePolicy, requireCheckpointCoverage } from './policy.ts'
import {
  adoptedSource,
  firstAdoptionScope,
  observeFirstAdoptionAbsence,
  latchAnchor,
  loadIntegration,
  parseAdoption,
  parseSource,
  trustedDescriptor,
  type Legacy,
} from './context.ts'
import {
  annotatedObject,
  atomicUpdate,
  fetchObject,
  remoteRefs,
  observeUpdates,
} from './transport.ts'
import { blob, clean, git, maybeRef, repository, requireAncestor } from './git.ts'
import { canonical, digest, fields, json, same, sha, IntegrationError } from './parse.ts'
import { currentCapture, deliveryConfig, readAuthority, captureDigest } from './authority.ts'
import { newOperation, operationHome, readRecord, writeRecord } from './records.ts'
import { materializeRunner, runCommands, checkCommandEvidence } from './verify.ts'

export function bootstrap(root: string): unknown {
  const trusted = trustedDescriptor(root)
  if (trusted.descriptor === null) return loadIntegration(root)
  const descriptor = trusted.descriptor
  const startedAt = new Date().toISOString()
  const refs = remoteRefs(root, descriptor.remote, 30_000, `${ADOPTION_PREFIX}*`)
  const ordered = [...refs]
    .map(([ref, oid]) => {
      const n = ref.slice(ADOPTION_PREFIX.length)
      if (!/^[1-9]\d*$/.test(n))
        throw new IntegrationError('unknown', 'Unexpected adoption ref namespace member')
      return { ref, oid, n: Number(n) }
    })
    .sort((a, b) => a.n - b.n)
  if (ordered.length === 0) {
    const previous = loadIntegration(root)
    if (
      git(root, ['for-each-ref', '--format=%(refname)', ADOPTION_PREFIX]) !== '' ||
      existsSync(join(repository(root).commonDir, 'omne-integration', 'anchor.json')) ||
      git(root, ['config', '--local', '--list'])
        .split('\n')
        .includes('omne.integrationadopted=true') ||
      previous.kind === 'adopted' ||
      previous.kind === 'legacy'
    )
      throw new IntegrationError('unknown', 'Previously adopted authority lost its adoption refs')
    return {
      kind: 'pending',
      reason: 'positive-absence',
      main: trusted.main,
      startedAt,
      finishedAt: new Date().toISOString(),
      completeness: 'complete',
      namespace: ADOPTION_PREFIX,
    }
  }
  let previous: string | null = null
  for (const [index, entry] of ordered.entries()) {
    if (entry.n !== index + 1) throw new IntegrationError('unknown', 'Adoption chain has a gap')
    fetchObject(root, descriptor.remote, entry.oid, 30_000)
    const read = adoptedSource(root, entry.oid, descriptor)
    same(read.adoption.previous, previous, 'Adoption chain is disconnected')
    requireAncestor(root, read.adoption.policy.commit, trusted.main)
    const local = maybeRef(root, entry.ref)
    if (local !== null) same(local, entry.oid, 'Local immutable adoption tag differs')
    else git(root, ['update-ref', entry.ref, entry.oid, '0'.repeat(40)])
    previous = entry.oid
  }
  if (previous === null) throw new IntegrationError('unknown', 'No adoption anchor')
  latchAnchor(root, previous)
  return loadIntegration(root)
}
export function activationCheck(root: string, legacy: Legacy[]): unknown {
  const measured = clean(root),
    trusted = trustedDescriptor(root)
  if (trusted.descriptor === null)
    throw new IntegrationError('unknown', 'Descriptor is not in trusted main')
  same(
    measured.head,
    trusted.main,
    'First adoption construction must be the exact committed main source',
  )
  const b = blob(root, measured.head, trusted.descriptor.policyPath)
  const source = {
      commit: measured.head,
      path: trusted.descriptor.policyPath,
      blob: b.oid,
      digest: digest(b.text),
    },
    policy = parsePolicy(json(b.text, 'policy'))
  const config = deliveryConfig(root, policy, source)
  requireCheckpointCoverage(policy)
  for (const path of policy.requiredFiles) blob(root, source.commit, path)
  for (const item of legacy) {
    const info = repository(item.root)
    same(
      [info.root, info.gitDir, info.branch, info.head],
      [item.root, item.gitDir, item.branch, item.head],
      'Legacy worktree snapshot is not exact',
    )
  }
  const { operation, home } = newOperation(root),
    runner = materializeRunner(root, home, source.commit)
  const runnerBefore = clean(runner)
  const scope = firstAdoptionScope(root, operation)
  const absenceBefore = observeFirstAdoptionAbsence(root, scope)
  const commands = runCommands(policy, 'full', runner, root, home, null, [], scope)
  const absenceAfter = observeFirstAdoptionAbsence(root, scope)
  same(clean(root), measured, 'Construction changed during activation checks')
  same(clean(runner), runnerBefore, 'Trusted runner changed during activation checks')
  const capture = currentCapture(config)
  const checksDigest = writeRecord(home, 'activation-check.json', {
    source,
    legacy,
    constructionHead: measured.head,
    absenceBefore,
    absenceAfter,
    commands,
    captureDigest: captureDigest(capture),
  })
  return {
    operation,
    checksDigest,
    constructionHead: measured.head,
    legacyDigest: digest(canonical(legacy)),
  }
}
export function activate(root: string, operation: string, authority: string): unknown {
  const trusted = trustedDescriptor(root)
  if (trusted.descriptor === null)
    throw new IntegrationError('unknown', 'Descriptor is not committed')
  const home = operationHome(root, operation),
    checked = readRecord(home, 'activation-check.json')
  const v = fields(
      checked.value,
      [
        'source',
        'legacy',
        'constructionHead',
        'commands',
        'captureDigest',
        'absenceBefore',
        'absenceAfter',
      ],
      'activation check',
    ),
    source = parseSource(v.source)
  same(clean(root).head, source.commit, 'Construction HEAD changed after activation checks')
  same(trusted.main, source.commit, 'Construction is not authoritative main')
  checkCommandEvidence(v.commands)
  observeFirstAdoptionAbsence(root, firstAdoptionScope(root, operation))
  const policy = parsePolicy(json(blob(root, source.commit, source.path).text, 'policy')),
    config = deliveryConfig(root, policy, source),
    capture = currentCapture(config)
  const decision = readAuthority(policy, authority, capture)
  if (decision.action !== 'adopt')
    throw new IntegrationError('refused', 'First activation needs an adopt action')
  same(
    [
      decision.policyCommit,
      decision.constructionHead,
      decision.checksDigest,
      decision.legacyDigest,
    ],
    [source.commit, v.constructionHead, checked.digest, digest(canonical(v.legacy))],
    'Adopt decision does not match complete checked construction',
  )
  const refs = remoteRefs(
    root,
    trusted.descriptor.remote,
    policy.timeouts.networkMs,
    `${ADOPTION_PREFIX}*`,
  )
  if (refs.size > 0)
    throw new IntegrationError(
      'refused',
      'Adoption already exists; bootstrap or explicit policy adoption is required',
    )
  const adoption = parseAdoption({
    schemaVersion: 1,
    repository: policy.repository,
    policy: source,
    previous: null,
    decision: authority,
    constructionHead: source.commit,
    legacy: v.legacy,
  })
  const ref = `${ADOPTION_PREFIX}1`,
    oid = annotatedObject(root, ref.slice(10), source.commit, adoption)
  const updates = [{ ref, old: null, next: oid }]
  writeRecord(home, 'activation-intent.json', { updates, authority })
  try {
    atomicUpdate(root, policy, updates)
  } catch (error) {
    if (!(error instanceof IntegrationError)) throw error
  }
  const observed = observeUpdates(root, policy, updates)
  if (observed.kind === 'published') return bootstrap(root)
  return observed
}
