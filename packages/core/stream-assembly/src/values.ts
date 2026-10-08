import { validate } from '@omne-harness-lite/arrival-events'
import type {
  ArrivalEvent,
  ArrivalTarget,
  CloseEvent,
  FillEvent,
} from '@omne-harness-lite/arrival-events'
import {
  copyJsonValue,
  isJsonNumber,
  judgeContentBlock,
  type JsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'

function isObject(value: JsonValue): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}

/** No opaque-bearing member occurs in ArrivalTarget. Schema checks its identity representation. */
function isTarget(value: JsonValue): value is JsonValue & ArrivalTarget {
  return validate('ArrivalTarget', value).valid
}

export function ownTarget(value: unknown): ArrivalTarget | undefined {
  const copied = copyJsonValue(value)
  return 'ok' in copied && isTarget(copied.ok) ? copied.ok : undefined
}

type SimpleEvent = Exclude<ArrivalEvent, FillEvent | CloseEvent>
function isSimpleEvent(value: JsonValue): value is JsonValue & SimpleEvent {
  return (
    isObject(value) &&
    value.t !== 'fill' &&
    value.t !== 'close' &&
    validate('ArrivalEvent', value).valid
  )
}

function ownFill(event: JsonObject, index: JsonNumber): FillEvent {
  if (typeof event.payload === 'string')
    return Object.freeze({ t: 'fill', index, payload: event.payload })
  const block = judgeContentBlock(event.payload)
  if (
    'ok' in block &&
    (block.ok.kind === 'image' || block.ok.kind === 'file' || block.ok.kind === 'tool_result')
  ) {
    return Object.freeze({ t: 'fill', index, payload: block.ok })
  }
  throw new Error('accepted fill has no whole-block payload')
}

function ownClose(event: JsonObject, index: JsonNumber): CloseEvent {
  if (!Object.hasOwn(event, 'block')) return Object.freeze({ t: 'close', index })
  const block = judgeContentBlock(event.block)
  if ('ok' in block && block.ok.kind !== 'tool_call') {
    return Object.freeze({ t: 'close', index, block: block.ok })
  }
  throw new Error('accepted close has no non-call block')
}

/** Precondition: AR has accepted the original envelope in the current open-block context. */
export function ownEvent(value: unknown): ArrivalEvent {
  const copied = copyJsonValue(value)
  if ('failed' in copied || !isObject(copied.ok))
    throw new Error('accepted arrival is not JSON data')
  const event = copied.ok
  if (isSimpleEvent(event)) return event
  if (!isJsonNumber(event.index)) throw new Error('accepted arrival has no numeric index')
  if (event.t === 'fill') return ownFill(event, event.index)
  if (event.t === 'close') return ownClose(event, event.index)
  throw new Error('accepted arrival has an unsupported event discriminator')
}
