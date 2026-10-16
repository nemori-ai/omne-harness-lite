import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { requireCurrentAdoption, readTag } from './context.ts'
import {
  captureDigest,
  confirmConditions,
  currentCapture,
  deliveryConfig,
  readAuthority,
  revalidateTask,
} from './authority.ts'
import { candidateStillExact, verifiedReceipt } from './verify.ts'
import { operationHome, readCandidate, readRecord, writeRecord } from './records.ts'
import { UNIT_PREFIX } from './policy.ts'
import { unitFor, parseUnit } from './units.ts'
import {
  annotatedObject,
  atomicUpdate,
  observeUpdates,
  targetRefs,
  fetchObject,
  type RefUpdate,
  type PublicationObservation,
} from './transport.ts'
import { requireAncestor } from './git.ts'
import { array, fields, same, sha, string, IntegrationError } from './parse.ts'

export function parseUpdates(value: unknown): RefUpdate[] {
  return array(value, 'updates').map(item => {
    const v = fields(item, ['ref', 'old', 'next'], 'update')
    return { ref: string(v.ref, 'ref'), old: v.old === null ? null : sha(v.old), next: sha(v.next) }
  })
}
export function resume(root: string, operation: string): PublicationObservation {
  const state = requireCurrentAdoption(root),
    candidate = readCandidate(root, operation)
  same(
    state.anchor,
    candidate.anchor,
    'Operation belongs to an earlier adoption; owner handoff required',
  )
  const intent = fields(
    readRecord(operationHome(root, operation), 'intent.json').value,
    ['updates', 'authority', 'captureDigest', 'receiptDigest'],
    'intent',
  )
  return observeUpdates(root, state.policy, parseUpdates(intent.updates))
}
export function publish(
  root: string,
  operation: string,
  authority: string,
): { observation: PublicationObservation; handoff: unknown } {
  const state = requireCurrentAdoption(root),
    candidate = readCandidate(root, operation),
    home = operationHome(root, operation)
  if (existsSync(join(home, 'intent.json'))) {
    const observation = resume(root, operation)
    return { observation, handoff: handoff(candidate, observation) }
  }
  same(state.anchor, candidate.anchor, 'Adoption changed')
  same(state.source, candidate.policy, 'Policy changed')
  const receipt = verifiedReceipt(root, candidate)
  const config = deliveryConfig(root, state.policy, state.source),
    capture = currentCapture(config)
  const decision = readAuthority(state.policy, authority, capture)
  if (decision.action !== 'publish')
    throw new IntegrationError('refused', 'A publish decision is required')
  same(
    [
      decision.operation,
      decision.candidate,
      decision.expectedBase,
      decision.sources,
      decision.tasks,
      decision.receiptDigest,
    ],
    [
      operation,
      candidate.candidate,
      candidate.expectedBase,
      candidate.sources,
      candidate.tasks,
      receipt.digest,
    ],
    'Publish decision does not bind this verified candidate',
  )
  for (const audit of candidate.tasks) {
    const current = revalidateTask(capture, audit, candidate.mode, decision.revalidations)
    confirmConditions(
      config,
      capture,
      current,
      'integration',
      candidate.target,
      decision.confirmations,
      state.policy,
    )
  }
  const tagRef = `${UNIT_PREFIX}${operation}`
  const tag = annotatedObject(
    root,
    tagRef.slice(10),
    candidate.candidate,
    unitFor(candidate, receipt.digest),
  )
  const updates: RefUpdate[] = [
    { ref: candidate.target, old: candidate.expectedBase, next: candidate.candidate },
    { ref: tagRef, old: null, next: tag },
  ]
  if (candidate.checkpoint !== null) {
    const ref = `refs/tags/omne/integration/checkpoint/${candidate.checkpoint}`
    const refs = targetRefs(root, state.policy),
      existing = refs.get(ref)
    if (existing !== undefined) {
      fetchObject(root, state.policy.transport.location, existing, state.policy.timeouts.networkMs)
      const original = readTag(root, existing),
        binding = fields(
          original.body,
          ['schemaVersion', 'operation', 'candidate', 'receiptDigest'],
          'checkpoint',
        )
      same(
        [original.name, original.target, binding.candidate],
        [ref.slice(10), candidate.candidate, candidate.candidate],
        'Checkpoint name already binds another object',
      )
      const priorRef = `${UNIT_PREFIX}${string(binding.operation, 'operation')}`,
        prior = refs.get(priorRef)
      if (prior === undefined)
        throw new IntegrationError('unknown', 'Checkpoint lost its original unit')
      fetchObject(root, state.policy.transport.location, prior, state.policy.timeouts.networkMs)
      const oldTag = readTag(root, prior),
        oldUnit = parseUnit(oldTag.body)
      same(
        [
          oldTag.name,
          oldTag.target,
          oldUnit.operation,
          oldUnit.mode,
          oldUnit.target,
          oldUnit.verification,
        ],
        [
          priorRef.slice(10),
          candidate.candidate,
          binding.operation,
          'checkpoint',
          'refs/heads/stable',
          binding.receiptDigest,
        ],
        'Original checkpoint unit binding differs',
      )
      const stable = refs.get('refs/heads/stable')
      if (stable === undefined)
        throw new IntegrationError('unknown', 'Checkpoint has no stable ref')
      fetchObject(root, state.policy.transport.location, stable, state.policy.timeouts.networkMs)
      requireAncestor(root, candidate.candidate, stable)
      same(oldUnit.candidate, candidate.candidate, 'Checkpoint unit has another candidate')
      const observation: PublicationObservation = {
        kind: stable === candidate.candidate ? 'published' : 'published-advanced',
        target: stable,
        reason:
          'Existing immutable checkpoint and original unit already establish this publication',
      }
      return {
        observation,
        handoff: {
          ...handoff(candidate, observation),
          existingCheckpoint: { ref, object: existing, originalOperation: binding.operation },
        },
      }
    }
    updates.push({
      ref,
      old: null,
      next: annotatedObject(root, ref.slice(10), candidate.candidate, {
        schemaVersion: 1,
        operation,
        candidate: candidate.candidate,
        receiptDigest: receipt.digest,
      }),
    })
  }
  same(
    [...decision.allowedRefs].sort(),
    updates.map(update => update.ref).sort(),
    'Publish allowed refs differ from exact transaction',
  )
  if (candidate.expectedBase !== null)
    requireAncestor(root, candidate.expectedBase, candidate.candidate)
  candidateStillExact(candidate)
  const fresh = currentCapture(config)
  same(captureDigest(fresh), captureDigest(capture), 'Issue inputs changed before publication')
  same(
    readAuthority(state.policy, authority, fresh),
    decision,
    'Authority changed before publication',
  )
  requireCurrentAdoption(root)
  writeRecord(home, 'intent.json', {
    updates,
    authority,
    captureDigest: captureDigest(fresh),
    receiptDigest: receipt.digest,
  })
  try {
    atomicUpdate(root, state.policy, updates)
  } catch (error) {
    if (!(error instanceof IntegrationError)) throw error
  }
  const observation = observeUpdates(root, state.policy, updates)
  writeRecord(home, 'publication.json', observation)
  return { observation, handoff: handoff(candidate, observation) }
}
function handoff(candidate: ReturnType<typeof readCandidate>, observation: PublicationObservation) {
  return {
    operation: candidate.operation,
    candidate: candidate.candidate,
    target: candidate.target,
    tasks: candidate.tasks.map(task => ({
      issue: task.binding.issue,
      revision: task.binding.revision,
      attempt: task.binding.attempt,
      declaredTarget: task.binding.completionTarget,
      observedTransport:
        observation.kind === 'published' || observation.kind === 'published-advanced'
          ? candidate.target
          : 'unknown',
      acceptance: 'unknown',
      platformWrite: 'not-performed',
    })),
    nextOwner: 'existing single Issue body writer',
  }
}
