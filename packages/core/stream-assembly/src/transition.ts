import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type {
  ArrivalEvent,
  CloseEvent,
  FillEvent,
  OpenEvent,
  TrimEvent,
} from '@omne-harness-lite/arrival-events'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import { addTrim, equalNumbers, sumNumbers } from './account.ts'
import { fillMatches } from './blocks.ts'
import { fillRecord, recordSlot, replaceRecord, type StateData } from './state.ts'
import type { AcceptRejection, AssemblyResult } from './types.ts'

export function nextPosition(data: StateData): JsonNumber {
  return sumNumbers(data.position, 1)
}

export function advance(data: StateData, event: ArrivalEvent): StateData {
  return Object.freeze({
    ...data,
    position: nextPosition(data),
    previousLongTrim: event.t === 'trim' && event.reason === 'frame_too_long',
    acceptedFrames:
      event.t === 'open' || event.t === 'fill' || event.t === 'close'
        ? sumNumbers(data.acceptedFrames, 1)
        : data.acceptedFrames,
  })
}

function openTransition(
  data: StateData,
  event: OpenEvent,
): AssemblyResult<StateData, AcceptRejection> {
  if (recordSlot(data.blocks, event.index) !== -1)
    return Object.freeze({ rejected: 'index_reused' } as const)
  const numericIndex = ExactDecimal.from(event.index)
  const last = data.blocks.at(-1)
  if (last !== undefined && numericIndex.compare(last.numericIndex) <= 0)
    return Object.freeze({ rejected: 'index_not_monotonic' } as const)
  return Object.freeze({
    ok: Object.freeze({
      ...advance(data, event),
      blocks: Object.freeze([
        ...data.blocks,
        Object.freeze({
          opened: event,
          numericIndex,
          closed: false,
          fills: undefined,
          changed: false,
        }),
      ]),
    }),
  })
}

function fillTransition(
  data: StateData,
  event: FillEvent,
): AssemblyResult<StateData, AcceptRejection> {
  const slot = recordSlot(data.blocks, event.index)
  const record = data.blocks[slot]
  if (record === undefined) return Object.freeze({ rejected: 'block_not_open' } as const)
  if (record.closed) return Object.freeze({ rejected: 'block_already_closed' } as const)
  if (!fillMatches(record.opened, event.payload))
    return Object.freeze({ rejected: 'payload_kind_mismatch' } as const)
  const first =
    data.firstContentAt === undefined &&
    (typeof event.payload !== 'string' || event.payload.length > 0)
  return Object.freeze({
    ok: Object.freeze({
      ...advance(data, event),
      blocks: replaceRecord(data.blocks, slot, fillRecord(record, event.payload)),
      ...(first ? { firstContentAt: nextPosition(data) } : {}),
    }),
  })
}

function trimTransition(
  data: StateData,
  event: TrimEvent,
): AssemblyResult<StateData, AcceptRejection> {
  if (event.index !== undefined && recordSlot(data.blocks, event.index) === -1)
    return Object.freeze({ rejected: 'block_not_open' } as const)
  const blocks =
    event.reason === 'rate_merged'
      ? data.blocks
      : Object.freeze(
          data.blocks.map(record =>
            !record.closed &&
            !record.changed &&
            record.opened.kind === 'tool_call' &&
            (event.index === undefined || equalNumbers(record.opened.index, event.index))
              ? Object.freeze({ ...record, changed: true })
              : record,
          ),
        )
  return Object.freeze({
    ok: Object.freeze({
      ...advance(data, event),
      blocks,
      trims: addTrim(data.trims, event, data.previousLongTrim),
    }),
  })
}

/** Sequence guards run after the authoritative representation judge and finish guard. */
export function transition(
  data: StateData,
  event: Exclude<ArrivalEvent, CloseEvent>,
): AssemblyResult<StateData, AcceptRejection> {
  switch (event.t) {
    case 'open':
      return openTransition(data, event)
    case 'fill':
      return fillTransition(data, event)
    case 'trim':
      return trimTransition(data, event)
    case 'account':
      return data.reported === undefined
        ? Object.freeze({ ok: Object.freeze({ ...advance(data, event), reported: event }) })
        : Object.freeze({ rejected: 'account_duplicate' } as const)
    case 'finish':
      return Object.freeze({ ok: Object.freeze({ ...advance(data, event), finish: event }) })
  }
}
