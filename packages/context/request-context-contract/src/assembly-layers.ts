import { placeContext, type Placement } from './placement.js'
import type { StablePreparation } from './preparation.js'
import type { AssemblyFailure } from './values.js'
import type * as M from '@omne-harness/model-contract'
import type { Message } from '@omne-harness/message'
import type {
  AssemblyInput,
  HistoryRow,
  ProjectedMessage,
  RequestLayers,
  SnapshotAnchor,
} from './values.js'
import type { SnapshotIdentity, CachedAssemblyMaterial } from './reuse.js'
import { adoptionDigest } from './internal.js'
import { buildModelInput } from './model-input.js'
import { compareHistorySequence, type HistorySequence } from './refs.js'
import { canonical } from './internal.js'
export function assembledInput<P>(
  input: AssemblyInput<P>,
  layers: RequestLayers,
  messages: readonly Message[],
): M.AssembledModelInput {
  return buildModelInput(input.selection, {
    system: layers.systemPrompt,
    messages,
    tools: layers.toolDeclarations.direct,
    toolChoice: 'auto',
    source: {
      owner: 'request-context-contract',
      name: 'assembly',
      revision: '1',
      digest: adoptionDigest(input.identity.candidate),
    },
  })
}

export type LayeredRequest = Readonly<{
  kind: 'layers'
  layers: RequestLayers
  messages: readonly Message[]
  anchorSource: Placement['anchorSource']
  /** The stable parts of this placement, for a later call of the same principal and purpose. */
  stable: Readonly<{
    identity: SnapshotIdentity
    split: NonNullable<CachedAssemblyMaterial['split']>
  }>
}>
type Split = CachedAssemblyMaterial['split']

/** The row of a sequence: rows of one epoch are numbered from 0 without a gap. */
function rowAt(rows: readonly HistoryRow[], seq: HistorySequence): HistoryRow | undefined {
  const direct = rows[Number(seq)]
  return direct?.seq === seq ? direct : rows.find(r => r.seq === seq)
}
const before = (message: ProjectedMessage, upper: HistorySequence) =>
  compareHistorySequence(message.seq, upper) <= 0

function splitFull(messages: readonly ProjectedMessage[], anchor: SnapshotAnchor): Split {
  const position = anchor.position
  return {
    anchor,
    head: messages.filter(r => position.kind === 'entry' && before(r, position.seq)),
    body: messages.filter(
      r => position.kind === 'empty' || compareHistorySequence(r.seq, position.seq) > 0,
    ),
  }
}
/**
 * The split of a view that is the cached view plus appended messages: the earlier head and body are
 * kept, and only the messages after the earlier anchor are classified. An anchor that moved
 * backwards, or another epoch, splits the whole view again.
 */
function splitFrom(
  cached: CachedAssemblyMaterial,
  messages: readonly ProjectedMessage[],
  anchor: SnapshotAnchor,
): Split {
  const earlier = cached.split.anchor
  const position = anchor.position
  const added = messages.slice(cached.history.view.messages.length)
  if (canonical(earlier.position) === canonical(position) && earlier.epoch === anchor.epoch)
    return {
      anchor,
      head: cached.split.head,
      body: added.length === 0 ? cached.split.body : [...cached.split.body, ...added],
    }
  const forward =
    earlier.epoch === anchor.epoch &&
    position.kind === 'entry' &&
    (earlier.position.kind === 'empty' ||
      compareHistorySequence(position.seq, earlier.position.seq) > 0)
  if (!forward || position.kind !== 'entry') return splitFull(messages, anchor)
  const pending = [...cached.split.body, ...added]
  let moved = 0
  while (moved < pending.length && before(pending[moved] as ProjectedMessage, position.seq)) moved++
  return {
    anchor,
    head: [...cached.split.head, ...pending.slice(0, moved)],
    body: pending.slice(moved),
  }
}
export function placeLayers<P>(
  input: AssemblyInput<P>,
  prepared: StablePreparation,
): LayeredRequest | AssemblyFailure {
  const placement = placeContext({
    candidate: input.identity.candidate,
    contextRead: input.contextRead,
    adopted: input.adopted?.coverage ?? null,
    transition: input.transition,
    view: prepared.view,
    newInputs: input.inputs,
    cachedSnapshot: prepared.layers?.snapshot ?? null,
  })
  if ('kind' in placement) return placement
  const anchor = placement.snapshot.anchor
  // The history owner supplies the chained digest; never manufacture it from content.
  const position = anchor.position
  const anchorRow = position.kind === 'entry' ? rowAt(prepared.rows, position.seq) : undefined
  const actualAnchor = { ...anchor, prefixDigest: anchorRow?.prefixDigest ?? null }
  const snapshot = { ...placement.snapshot, anchor: actualAnchor }
  const split =
    prepared.layers !== null && prepared.viewFrom !== null
      ? splitFrom(prepared.layers, prepared.view.messages, actualAnchor)
      : splitFull(prepared.view.messages, actualAnchor)
  const layers: RequestLayers = {
    systemPrompt: prepared.prompt.blocks,
    toolDeclarations: prepared.declarations,
    historyHead: split.head.map(r => r.message),
    snapshotReminder: snapshot,
    historyBody: split.body.map(r => r.message),
    tailFacts: placement.tail,
  }
  const messages = [
    ...layers.historyHead,
    ...(snapshot.message === null ? [] : [snapshot.message]),
    ...layers.historyBody,
    ...(layers.tailFacts.message === null ? [] : [layers.tailFacts.message]),
  ]
  return {
    kind: 'layers',
    layers,
    messages,
    anchorSource: placement.anchorSource,
    stable: { identity: placement.identity, split },
  }
}
