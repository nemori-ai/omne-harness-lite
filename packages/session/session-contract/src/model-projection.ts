import type { Message } from '@omne-harness/message'
import { encodeEntry } from './entries.ts'
import { entries, invalid, rejected } from './decision-support.ts'
import type { SessionCommand } from './ports.ts'
import type { DecideReads, Decision } from './judgments.ts'
import type { DurableEvidence } from './identity.ts'
import type { WorkSnapshot } from './values.ts'

/** Only already-visible reminder text can be withdrawn; original log records remain intact. */
export function projectModelMessage(message: Message, blocks: ReadonlySet<string>): Message | null {
  if (message.role !== 'system_reminder') return message
  const kept = message.blocks.filter(block => !blocks.has(block.id))
  const [first, ...rest] = kept
  return first === undefined
    ? null
    : kept.length === message.blocks.length
      ? message
      : { ...message, blocks: [first, ...rest] }
}

export function decideModelProjection(
  state: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'commitDerived' }>,
  reads: DecideReads,
  source: DurableEvidence,
): Decision {
  const { input } = command
  if (input.value.kind !== 'model-projection') return invalid('value', 'not a model projection')
  if (reads.compactionEpoch === undefined || reads.compaction === null)
    return rejected({
      kind: 'unavailable',
      owner: 'session-history',
      diagnostic: 'the current model projection basis is unavailable',
    })
  if (input.value.epoch !== reads.compactionEpoch)
    return rejected({ kind: 'changed', revision: state.revision })
  const blocks = new Set(input.value.blocks)
  const restore = input.value.restoreOriginals === true
  if ((!restore && blocks.size === 0) || blocks.size !== input.value.blocks.length)
    return invalid('value.blocks', 'empty or duplicate block withdrawal')
  const found = new Set<string>()
  let hasSummary = false
  for (const row of [...reads.compaction.covered, ...reads.compaction.after]) {
    const message = row.message
    if (message?.role === 'compaction') hasSummary = true
    for (const block of message?.blocks ?? []) {
      if (!blocks.has(block.id) || message?.role !== 'system_reminder') continue
      if (block.kind !== 'text')
        return invalid('value.blocks', 'only reminder text can be withdrawn')
      found.add(block.id)
    }
  }
  if (restore && !hasSummary) return invalid('value.restoreOriginals', 'no summary to rebuild')
  if (!restore && found.size !== blocks.size)
    return invalid('value.blocks', 'a withdrawn block is outside the current model view')
  return entries([
    encodeEntry(
      {
        kind: 'session.model-projected',
        epoch: input.value.epoch,
        ...(restore ? { restoreOriginals: true as const } : {}),
        blocks: input.value.blocks,
        source: input.value.source,
      },
      { owner: 'session', via: 'direct', source },
    ),
  ])
}
