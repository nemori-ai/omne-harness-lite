// The stream decoder of the gateway engine. Slice S5 of #463 delivers it: a phase union
// (`streaming | finished | ended`) and a pure reduce function, per the D4 table of the spec.
// Until then the binding refuses to create a decoder, so no send can start through the engine.
import type { PiResponseDecoder } from '../family.ts'
import type { ChatCompletionsRecord, VendorHooks } from './vocabulary.ts'

export type DecoderInput = Readonly<{ record: ChatCompletionsRecord; hooks: VendorHooks }>

/** Thrown by `createChatCompletionsDecoder` until the decoder exists. */
export class DecoderNotImplementedError extends Error {
  override readonly name = 'DecoderNotImplementedError'
}

/** Creates the decoder of one dispatch. Not implemented yet: always throws. */
export function createChatCompletionsDecoder(input: DecoderInput): PiResponseDecoder {
  throw new DecoderNotImplementedError(
    `the chat-completions decoder of record ${input.record.name} is not implemented`,
  )
}
