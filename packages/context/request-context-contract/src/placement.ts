import type {
  ContextReadGroup,
  Coverage,
  TransitionEvidence,
  NewInputBatch,
  SnapshotReminder,
  TailFacts,
  AssemblyFailure,
} from './values.js'
import type { ProjectedHistory } from './projection.js'
import { canonical, reminder } from './internal.js'
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
}>
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
  const last = view.messages
    .filter(m => transition !== null || !newInputs.entries.includes(m.entry))
    .at(-1)
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
  const blocks = material.blocks
    .filter(b => b.volatility !== 'per-request')
    .sort((a, b) => a.key.localeCompare(b.key, 'en'))
  const tail = contextRead.perRequest
    .filter(b => b.volatility === 'per-request')
    .sort((a, b) => a.key.localeCompare(b.key, 'en'))
  const identity = {
    scope: material.scope.ref,
    eligibility: material.eligibility,
    viewRevision: material.revision,
    anchor,
  }
  return {
    snapshot: {
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
    },
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
