import { judgeArrivalEnvelope } from '@omne-harness-lite/arrival-events'
import type { CloseEvent } from '@omne-harness-lite/arrival-events'
import type { ContentBlock } from '@omne-harness-lite/content-blocks'
import { closeContributesContent, closeMatches, contentOf } from './blocks.ts'
import { sealToolCall } from './close.ts'
import { AssemblyState, recordSlot, replaceRecord, type StateData } from './state.ts'
import { advance, nextPosition, transition } from './transition.ts'
import type { AcceptRejection, AssemblyResult } from './types.ts'
import { ownEvent } from './values.ts'

/** All representation and sequence guards precede the fixed accepted-call sealer. */
function closeTransition(
  data: StateData,
  event: CloseEvent,
): AssemblyResult<StateData, AcceptRejection> {
  const slot = recordSlot(data.blocks, event.index)
  const record = data.blocks[slot]
  if (record === undefined) return Object.freeze({ rejected: 'block_not_open' } as const)
  if (record.closed) return Object.freeze({ rejected: 'block_already_closed' } as const)
  if (!closeMatches(record.opened, event.block))
    return Object.freeze({ rejected: 'payload_kind_mismatch' } as const)
  let block: ContentBlock
  if (record.opened.kind === 'tool_call') {
    const raw = contentOf(record)
    if (raw !== undefined && typeof raw !== 'string')
      throw new Error('tool parameter reduction invariant')
    block = sealToolCall(record.opened, raw ?? '', record.changed)
  } else {
    if (event.block === undefined) throw new Error('matched non-call close has no block')
    block = event.block
  }
  const first =
    data.firstContentAt === undefined &&
    record.fills === undefined &&
    closeContributesContent(block)
  return Object.freeze({
    ok: Object.freeze({
      ...advance(data, event),
      blocks: replaceRecord(
        data.blocks,
        slot,
        Object.freeze({
          opened: record.opened,
          numericIndex: record.numericIndex,
          closed: true,
          block,
        }),
      ),
      ...(first ? { firstContentAt: nextPosition(data) } : {}),
    }),
  })
}

/** S-19/S-25: representation, finish, then sequence; rejection preserves the old value. */
export function accept(
  state: AssemblyState,
  event: unknown,
): AssemblyResult<AssemblyState, AcceptRejection> {
  const data = AssemblyState.read(state)
  const judgment = judgeArrivalEnvelope({ target: data.target, event }, index => {
    const record = data.blocks[recordSlot(data.blocks, index)]
    return record !== undefined && !record.closed ? record.opened : undefined
  })
  if ('rejected' in judgment) return judgment
  if (data.finish !== undefined) return Object.freeze({ rejected: 'event_after_finish' } as const)
  const owned = ownEvent(event)
  const result = owned.t === 'close' ? closeTransition(data, owned) : transition(data, owned)
  return 'rejected' in result ? result : Object.freeze({ ok: AssemblyState.create(result.ok) })
}
