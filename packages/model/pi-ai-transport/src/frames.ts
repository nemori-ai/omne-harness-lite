import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import type { PiProtocolFrame } from './family.ts'
import { closeIterable, closeSourceOnEarlyEnd } from './iteration.ts'

export type FrameFailure = 'invalid-json' | 'event-after-end'

export type FrameOptions = Readonly<{
  endMarker: string | null
  json: JsonLimits
}>

const END_MARKER: PiProtocolFrame = Object.freeze({ kind: 'end-marker' })

export type ProtocolFrames = AsyncGenerator<Outcome<PiProtocolFrame, FrameFailure>, void, undefined>

export function readProtocolFrames(
  events: AsyncIterable<string>,
  options: FrameOptions,
): ProtocolFrames {
  return closeSourceOnEarlyEnd(frameData(events, options), () => closeIterable(events))
}

async function* frameData(events: AsyncIterable<string>, options: FrameOptions): ProtocolFrames {
  let ended = false
  for await (const data of events) {
    if (ended) {
      yield { failure: 'event-after-end' }
      return
    }
    if (options.endMarker !== null && data === options.endMarker) {
      ended = true
      yield { ok: END_MARKER }
      continue
    }
    const read = readJsonText(data, options.json)
    if (read.kind !== 'ok') {
      yield { failure: 'invalid-json' }
      return
    }
    yield { ok: { kind: 'data', value: read.value } }
  }
}
