import { activeTrack, parseTrack, UNIT_PREFIX } from './policy.ts'
import { requireCurrentAdoption } from './context.ts'
import { targetHead, annotatedObject, atomicUpdate, observeUpdates } from './transport.ts'
import { newOperation, operationHome, readRecord, writeRecord } from './records.ts'
import { currentCapture, deliveryConfig, readAuthority, captureDigest } from './authority.ts'
import { requireAncestor, git, lines } from './git.ts'
import { parseUpdates } from './publish.ts'
import { canonical, digest, fields, same, sha, string, IntegrationError } from './parse.ts'
import { pendingPrefix } from './units.ts'

export function registerTrack(root: string, entry: unknown): unknown {
  const state = requireCurrentAdoption(root),
    track = parseTrack(entry)
  const main = targetHead(root, state.policy, 'refs/heads/main')
  if (main === null) throw new IntegrationError('unknown', 'Main is missing')
  requireAncestor(root, track.initialMain, main)
  return {
    kind: 'policy-draft',
    adoption: 'required',
    policy: {
      ...state.policy,
      tracks: [...state.policy.tracks.filter(item => item.id !== track.id), track],
    },
    previousAnchor: state.anchor,
  }
}
export function bootstrapTrackPlan(root: string, id: string): unknown {
  const state = requireCurrentAdoption(root),
    track = activeTrack(state.policy, id),
    target = `refs/heads/${track.branch}`
  const main = targetHead(root, state.policy, 'refs/heads/main')
  if (main === null) throw new IntegrationError('unknown', 'Main is missing')
  requireAncestor(root, track.initialMain, main)
  if (targetHead(root, state.policy, target) !== null)
    throw new IntegrationError(
      'refused',
      'Track ref already exists; unknown branches cannot be adopted implicitly',
    )
  const { operation, home } = newOperation(root),
    ref = `${UNIT_PREFIX}${operation}`
  const unit = {
    schemaVersion: 1,
    operation,
    mode: 'track-bootstrap',
    target,
    base: null,
    sources: [track.initialMain],
    candidate: track.initialMain,
    tasks: [],
    policy: state.source,
    verification: digest(canonical(track)),
  }
  const updates = [
    { ref: target, old: null, next: track.initialMain },
    { ref, old: null, next: annotatedObject(root, ref.slice(10), track.initialMain, unit) },
  ]
  writeRecord(home, 'track-bootstrap.json', { anchor: state.anchor, track, updates })
  return {
    operation,
    track,
    allowedRefs: updates.map(update => update.ref),
    mainAnchor: track.initialMain,
  }
}
export function bootstrapTrack(root: string, operation: string, authority: string): unknown {
  const state = requireCurrentAdoption(root),
    home = operationHome(root, operation)
  const plan = fields(
    readRecord(home, 'track-bootstrap.json').value,
    ['anchor', 'track', 'updates'],
    'track bootstrap',
  )
  same(plan.anchor, state.anchor, 'Track plan adoption is stale')
  const track = parseTrack(plan.track)
  same(track, activeTrack(state.policy, track.id), 'Track registry changed')
  const updates = parseUpdates(plan.updates),
    capture = currentCapture(deliveryConfig(root, state.policy, state.source))
  const decision = readAuthority(state.policy, authority, capture)
  if (decision.action !== 'track-bootstrap')
    throw new IntegrationError('refused', 'Track bootstrap authority required')
  same(
    [decision.track, decision.mainAnchor, [...decision.allowedRefs].sort()],
    [track.id, track.initialMain, updates.map(update => update.ref).sort()],
    'Track bootstrap authority scope mismatch',
  )
  same(
    captureDigest(currentCapture(deliveryConfig(root, state.policy, state.source))),
    captureDigest(capture),
    'Track bootstrap authority inputs changed',
  )
  requireCurrentAdoption(root)
  writeRecord(home, 'track-intent.json', { authority, updates })
  try {
    atomicUpdate(root, state.policy, updates)
  } catch (error) {
    if (!(error instanceof IntegrationError)) throw error
  }
  return observeUpdates(root, state.policy, updates)
}
export function retireTrack(root: string, id: string): unknown {
  const state = requireCurrentAdoption(root),
    track = state.policy.tracks.find(track => track.id === id)
  if (track === undefined) throw new IntegrationError('input-error', 'Unknown track')
  const source = targetHead(root, state.policy, `refs/heads/${track.branch}`),
    main = targetHead(root, state.policy, 'refs/heads/main')
  if (source === null || main === null)
    throw new IntegrationError('unknown', 'Track or main is missing')
  const prefix = pendingPrefix(root, state.policy, id, source, main)
  return {
    kind: 'retirement-plan',
    track,
    source,
    main,
    pendingPrefix: prefix,
    worktrees: lines(git(root, ['worktree', 'list', '--porcelain'])),
    deletion: 'not-authorized',
    obligations: [
      'Reconcile all pending units and current Issue tasks',
      'Transfer the track owner and adopt the revised registry',
      'Preserve unique tmp and worktree artifacts before separately authorized cleanup',
    ],
  }
}
