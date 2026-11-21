import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { TransportFailure } from '@omne-harness/model-contract'
import type { ModelTextTokenizer } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import { recordAdoption } from '@omne-harness/pi-ai-transport'
import {
  createCalibratedMeter,
  type FamilyMeter,
  type MeterMargin,
  type MeterUnits,
  type ProjectedPart,
  type ProjectedRequest,
  type ProjectedTurn,
} from '@omne-harness/pi-ai-transport/chat-completions'
import { componentAdoption, countingBasis } from './adoptions.ts'
import { QWEN_OWNER } from './owner.ts'
import type { QwenRecord } from './record.ts'

export const OUTPUT_GROUP_METHOD = 'qwen-complete-output-group-workload-estimated/1'
export { ANCHORED_METHOD, type MeterMargin } from '@omne-harness/pi-ai-transport/chat-completions'

function str(value: string): JsonValue {
  return { kind: 'string', value }
}

function obj(members: Readonly<Record<string, JsonValue | undefined>>): JsonValue {
  const entries = Object.entries(members).flatMap(([key, value]) =>
    value === undefined ? [] : [{ key, value }],
  )
  return { kind: 'object', entries }
}

function arr(items: readonly JsonValue[]): JsonValue {
  return { kind: 'array', items }
}

// Speech is not counted: the o200k proxy has no rule for it, as the OpenAI meter has none. The
// projection refuses an image for this record before the meter sees the request.
function partJson(part: ProjectedPart): JsonValue | null {
  switch (part.kind) {
    case 'text':
      return obj({ type: str('text'), text: str(part.text) })
    case 'tool_call':
      return obj({
        type: str('tool_call'),
        id: str(part.callId),
        name: str(part.name),
        arguments: str(writeJsonText(part.arguments)),
      })
    case 'tool_call_unparsed':
      return obj({
        type: str('tool_call'),
        id: str(part.callId),
        name: str(part.name),
        arguments: str(part.raw),
      })
    case 'tool_result':
      return obj({ type: str('tool_result'), id: str(part.callId) })
    default:
      return null
  }
}

function replayJson(turn: ProjectedTurn): Readonly<Record<string, JsonValue>> {
  switch (turn.replay.kind) {
    case 'none':
      return {}
    case 'plain':
      return { reasoning: str(turn.replay.text) }
    case 'details':
      return {
        reasoning_details: obj({
          opaque: { kind: 'number', lexeme: String(turn.replay.details.length) },
        }),
      }
    default: {
      const _exhaustive: never = turn.replay
      return _exhaustive
    }
  }
}

function turnJson(turn: ProjectedTurn): JsonValue {
  const parts = turn.blocks.flatMap(block => {
    const json = partJson(block)
    return json === null ? [] : [json]
  })
  return obj({ role: str(turn.role), content: arr(parts), ...replayJson(turn) })
}

export function representationOf(
  record: QwenRecord,
  view: ProjectedRequest,
): Readonly<{ tokenInput: JsonValue; units: MeterUnits }> {
  const instruction = view.instruction.flatMap(block =>
    block.kind === 'text' ? [obj({ type: str('text'), text: str(block.text) })] : [],
  )
  const leading: readonly Readonly<{ json: JsonValue; message: null }>[] =
    instruction.length === 0
      ? []
      : [
          {
            json: obj({ role: str(record.wire.roles.instruction), content: arr(instruction) }),
            message: null,
          },
        ]
  const units = [
    ...leading,
    ...view.turns.map(turn => ({ json: turnJson(turn), message: turn.message })),
  ]
  const tokenInput = obj({
    messages: arr(units.map(unit => unit.json)),
    tools: arr(
      view.tools.map(tool =>
        obj({
          name: str(tool.name),
          description: str(tool.description),
          parameters: tool.argumentsSchema,
        }),
      ),
    ),
    tool_choice:
      typeof view.toolChoice === 'string'
        ? str(view.toolChoice)
        : obj({ name: str(view.toolChoice.name) }),
    parameters: str(JSON.stringify(view.applied)),
  })
  return { tokenInput, units: units.map(unit => unit.message) }
}

type UnitContent = Readonly<{ reasoning: boolean }>

function memberOf(value: JsonValue, key: string): JsonValue | undefined {
  return value.kind === 'object' ? value.entries.find(entry => entry.key === key)?.value : undefined
}

function contentOf(tokenInput: JsonValue): readonly UnitContent[] | null {
  const messages = memberOf(tokenInput, 'messages')
  if (messages?.kind !== 'array') return null
  const units: UnitContent[] = []
  for (const message of messages.items) {
    const content = memberOf(message, 'content')
    if (content?.kind !== 'array') return null
    units.push({ reasoning: memberOf(message, 'reasoning_details') !== undefined })
  }
  return units
}

/** No part of a request to this record costs tokens beyond its text. */
function noExtras(units: readonly UnitContent[]): Outcome<readonly bigint[], TransportFailure> {
  return { ok: units.map(() => 0n) }
}

export function createQwenMeter(
  record: QwenRecord,
  tokenizer: ModelTextTokenizer,
  margin: MeterMargin,
): FamilyMeter {
  const representation = componentAdoption(record, 'representation')
  const instance = createCalibratedMeter<UnitContent>({
    owner: QWEN_OWNER,
    supplier: recordAdoption(QWEN_OWNER, record),
    adoptions: {
      meter: componentAdoption(record, 'meter'),
      representation,
      media: componentAdoption(record, 'media'),
    },
    basis: countingBasis(record),
    margin,
    outputGroup: OUTPUT_GROUP_METHOD,
    uncountable: 'reasoning-not-countable',
    tokens: { tokenizer, form: 'as-written' },
    contentOf,
    imageTokens: ({ units }) => noExtras(units),
  })
  return Object.freeze({
    instance,
    represent: (view: ProjectedRequest) => ({
      adoption: representation,
      ...representationOf(record, view),
    }),
  })
}
