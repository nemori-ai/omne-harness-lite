import type { JsonValue } from '@omne-harness/json-text'
import type { ProfileReplay } from '@omne-harness/model-contract'
import type { PiModelRecordHead } from '../family-table.ts'
import type {
  ChatCompletionsLimits,
  ExtensionRule,
  ParameterTable,
  ServingPin,
} from '../chat-completions/vocabulary.ts'

/** How a request of the record is written on the Responses interface. */
export type ResponsesWire = Readonly<{
  system: 'developer' | 'instructions'
  cache: Readonly<{ kind: 'none' }> | Readonly<{ kind: 'explicit'; ttl: '30m' }>
  image: Readonly<{ mediaTypes: readonly string[] }> | null
  reasoning: Readonly<{ summary: 'auto' | null }>
  toolNames: Readonly<{ rule: 'underscore/1'; maxLength: number }>
}>

/** What the model refuses that the parameter table does not already say. */
export type ResponsesAccepts = Readonly<{
  forcedToolChoice: boolean
  endsWithAssistant: boolean
}>

export type ResponsesRecord = PiModelRecordHead &
  Readonly<{
    engine: 'responses'
    serving: ServingPin
    wire: ResponsesWire
    parameters: ParameterTable
    extensions: readonly ExtensionRule[]
    accepts: ResponsesAccepts
    replay: Readonly<{
      declaration: ProfileReplay
      formats: Readonly<{ produces: string; accepts: readonly string[] }>
      binding: 'prefix' | 'none'
    }>
  }>

export type ResponsesLimits = ChatCompletionsLimits

/** An output item as the reasoning state keeps it; text and calls stay in the reply's blocks. */
export type ItemEntry =
  | Readonly<{ type: 'reasoning'; item: JsonValue }>
  | Readonly<{ type: 'message'; id: string; parts: number; phase: string | null }>
  | Readonly<{ type: 'function_call'; id: string; callId: string }>

/** A phase is kept as the interface wrote it when it is a word, and is otherwise absent. */
export const PHASE = /^[a-z_]{1,64}$/
