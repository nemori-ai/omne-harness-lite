import type {
  ContextReadGroup,
  Coverage,
  TransitionEvidence,
  NewInputBatch,
  SnapshotAnchor,
  SnapshotReminder,
  TailFacts,
  AssemblyFailure,
} from './values.js'
import type { ProjectedHistory } from './projection.js'
import { canonical, reminder } from './internal.js'
import type { SnapshotIdentity } from './reuse.js'
export const SNAPSHOT_ANCHOR_RULE = Object.freeze({
  owner: 'request-context-contract',
  name: 'snapshot-anchor',
  revision: '1',
  at: 'model-visible-history-tail-at-full-read',
  excludes: 'new-inputs-of-this-request',
  afterCompaction: 'history-tail-at-resume; after-compaction-record-when-range-reaches-point',
} as const)
export type Placement = Readonly<{
  snapshot: SnapshotReminder
  /** The identity of the stable reminder: scope, eligibility, snapshot revision and anchor. */
  identity: SnapshotIdentity
  tail: TailFacts
  anchorSource: 'new-full-read' | 'adopted' | 'after-compaction'
}>
export type PlacementInput = Readonly<{
  candidate: import('./refs.js').CandidateRef
  contextRead: ContextReadGroup
  adopted: Coverage | null
  transition: TransitionEvidence | null
  view: ProjectedHistory
  newInputs: NewInputBatch
  /** The stable reminder of an earlier call; it is kept when its identity is this call's identity. */
  cachedSnapshot?: Readonly<{ identity: SnapshotIdentity; reminder: SnapshotReminder }> | null
}>

/** The last model-visible message that is not a new input of this request, scanned from the end. */
function lastBeforeInputs(
  messages: ProjectedHistory['messages'],
  transition: TransitionEvidence | null,
  newInputs: NewInputBatch,
): ProjectedHistory['messages'][number] | undefined {
  if (transition !== null) return messages.at(-1)
  const fresh = new Set(newInputs.entries)
  for (let at = messages.length - 1; at >= 0; at--) {
    const message = messages[at]
    if (message !== undefined && !fresh.has(message.entry)) return message
  }
  return undefined
}
export function placeContext(
  input: PlacementInput,
): Placement | Extract<AssemblyFailure, { kind: 'invalid' }> {
  const { contextRead, adopted, transition, view, newInputs } = input
  const material = contextRead.snapshot
  if (material === null)
    return { kind: 'invalid', field: 'contextRead.snapshot', reason: 'missing-snapshot-material' }
  const full = contextRead.read.kind === 'success' && 'viewRevision' in contextRead.read.value
  if (
    !full &&
    (adopted === null ||
      adopted.snapshot.revision !== material.revision ||
      adopted.snapshot.scope.ref !== material.scope.ref ||
      adopted.snapshot.eligibility.eligibility !== material.eligibility.eligibility ||
      adopted.snapshot.anchor.epoch !== view.epoch)
  )
    return { kind: 'invalid', field: 'contextRead.snapshot', reason: 'missing-snapshot-material' }
  const last = lastBeforeInputs(view.messages, transition, newInputs)
  const anchor =
    !full && adopted !== null
      ? adopted.snapshot.anchor
      : {
          epoch: view.epoch,
          position:
            last === undefined
              ? { kind: 'empty' as const }
              : { kind: 'entry' as const, seq: last.seq },
          prefixDigest: last?.prefixDigest ?? null,
        }
  const identity = {
    scope: material.scope.ref,
    eligibility: material.eligibility,
    viewRevision: material.revision,
    anchor,
  }
  const kept = input.cachedSnapshot
  const stable =
    kept !== null && kept !== undefined && canonical(kept.identity) === canonical(identity)
      ? kept.reminder
      : snapshotOf(material, anchor, identity)
  const tail = contextRead.perRequest
    .filter(b => b.volatility === 'per-request')
    .sort((a, b) => a.key.localeCompare(b.key, 'en'))
  return {
    snapshot: stable,
    identity,
    tail: {
      blocks: tail,
      message: tail.length
        ? reminder(canonical(tail.map(({ key, revision, value }) => ({ key, revision, value }))), {
            layer: 'tail',
            scope: material.scope.ref,
            eligibility: material.eligibility,
            candidate: input.candidate,
          })
        : null,
    },
    anchorSource: transition !== null ? 'after-compaction' : full ? 'new-full-read' : 'adopted',
  }
}

function snapshotOf(
  material: NonNullable<ContextReadGroup['snapshot']>,
  anchor: SnapshotAnchor,
  identity: SnapshotIdentity,
): SnapshotReminder {
  const blocks = material.blocks
    .filter(b => b.volatility !== 'per-request')
    .sort((a, b) => a.key.localeCompare(b.key, 'en'))
  return {
    ...material,
    anchor,
    blocks,
    message: blocks.length
      ? reminder(
          canonical(
            blocks.map(({ key, revision, value, previous }) => ({
              key,
              revision,
              value,
              ...(previous === null ? {} : { previous }),
            })),
          ),
          { layer: 'snapshot', ...identity },
        )
      : null,
  }
}
