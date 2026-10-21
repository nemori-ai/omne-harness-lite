import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import type { PiProtocolFrame } from './family.ts'

/** `invalid-json`: the data is not one JSON document within the limits. */
export type FrameFailure = 'invalid-json' | 'event-after-end'

export type FrameOptions = Readonly<{
  /** The protocol end-marker data text, or `null` when the protocol has none. */
  endMarker: string | null
  json: JsonLimits
}>

const END_MARKER: PiProtocolFrame = Object.freeze({ kind: 'end-marker' })

/**
 * Turns SSE event data into protocol frames. The end-marker text becomes its own frame; any
 * event after it fails. Other data is read as lossless JSON. The sequence stops after the first
 * failure. The end of the events only ends the sequence: it is never a terminal frame.
 */
export async function* readProtocolFrames(
  events: AsyncIterable<string>,
  options: FrameOptions,
): AsyncGenerator<Outcome<PiProtocolFrame, FrameFailure>> {
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
