import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { MediaMeasurementFact, TransportFailure } from '@omne-harness/model-contract'
import type { ModelTextTokenizer } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import {
  type FamilyMeter,
  type MeterMargin,
  type MeterUnits,
  type ProjectedRequest,
  type ProjectedTurn,
} from '@omne-harness/pi-ai-transport/chat-completions'
import {
  arr,
  componentAdoption,
  createGatewayMeter,
  memberOf,
  obj,
  str,
} from '@omne-harness/pi-ai-transport/family-kit'
import { IMAGE_MEDIA_TYPES, IMAGE_RULES } from './images.ts'
import { ANTHROPIC_OWNER } from './owner.ts'
import type { AnthropicRecord } from './record.ts'

export const OUTPUT_GROUP_METHOD =
  'anthropic-complete-signed-encrypted-output-zero-framing-estimated/1'
export { ANCHORED_METHOD, type MeterMargin } from '@omne-harness/pi-ai-transport/chat-completions'

const IMAGE_PLACEHOLDER = '[image]'

function call(id: string, name: string, args: string): JsonValue {
  return obj({
    id: str(id),
    type: str('function'),
    function: obj({ name: str(name), arguments: str(args) }),
  })
}

function partsJson(turn: ProjectedTurn): Readonly<Record<string, JsonValue | undefined>> {
  const content: JsonValue[] = []
  const calls: JsonValue[] = []
  let toolCallId: JsonValue | undefined
  for (const part of turn.blocks) {
    switch (part.kind) {
      case 'text':
        content.push(obj({ type: str('text'), text: str(part.text) }))
        break
      case 'image':
        content.push(
          obj({ type: str('image_url'), image_url: obj({ url: str(IMAGE_PLACEHOLDER) }) }),
        )
        break
      case 'tool_call':
        calls.push(call(part.callId, part.name, writeJsonText(part.arguments)))
        break
      case 'tool_call_unparsed':
        calls.push(call(part.callId, part.name, part.raw))
        break
      case 'tool_result':
        toolCallId = str(part.callId)
        break
      case 'thinking':
      case 'tool_call_incomplete':
      case 'voice':
      case 'file':
        break
      default: {
        const _exhaustive: never = part
        return _exhaustive
      }
    }
  }
  return {
    content: arr(content),
    tool_calls: calls.length > 0 ? arr(calls) : undefined,
    tool_call_id: toolCallId,
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
  return obj({ role: str(turn.role), ...partsJson(turn), ...replayJson(turn) })
}

export function representationOf(
  record: AnthropicRecord,
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
            json: obj({ role: str('system'), content: arr(instruction) }),
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
          type: str('function'),
          function: obj({
            name: str(tool.name),
            description: str(tool.description),
            parameters: tool.argumentsSchema,
          }),
        }),
      ),
    ),
  })
  return { tokenInput, units: units.map(unit => unit.message) }
}

type UnitContent = Readonly<{
  images: number
  reasoning: boolean
}>

function contentOf(tokenInput: JsonValue): readonly UnitContent[] | null {
  const messages = memberOf(tokenInput, 'messages')
  if (messages?.kind !== 'array') return null
  const units: UnitContent[] = []
  for (const message of messages.items) {
    const content = memberOf(message, 'content')
    if (content?.kind !== 'array') return null
    let images = 0
    for (const part of content.items) {
      const type = memberOf(part, 'type')
      if (type?.kind !== 'string') return null
      if (type.value === 'image_url') images += 1
    }
    units.push({ images, reasoning: memberOf(message, 'reasoning_details') !== undefined })
  }
  return units
}

function unavailable(diagnostic: string): Outcome<never, TransportFailure> {
  return { failure: { kind: 'unavailable', dependency: ANTHROPIC_OWNER, diagnostic } }
}

function isImageMediaType(mediaType: string): boolean {
  return IMAGE_MEDIA_TYPES.some(item => item === mediaType)
}

function imageTokens(
  record: AnthropicRecord,
  units: readonly UnitContent[],
  media: readonly MediaMeasurementFact[],
): Outcome<readonly bigint[], TransportFailure> {
  const facts = media.filter(fact => fact.kind === 'image')
  const owners = units.flatMap((unit, index) => Array.from({ length: unit.images }, () => index))
  if (facts.length !== owners.length) return unavailable('image-measurement-missing')
  const rule = IMAGE_RULES[record.meter.image]
  const extras = units.map(() => 0n)
  for (const [position, fact] of facts.entries()) {
    const owner = owners[position]
    const tokens =
      owner !== undefined && fact.kind === 'image' && isImageMediaType(fact.mediaType)
        ? rule({ width: Number(fact.widthPixels), height: Number(fact.heightPixels) })
        : null
    if (tokens === null || owner === undefined)
      return {
        failure: {
          kind: 'unsupported',
          field: `image ${position}`,
          adapter: componentAdoption(ANTHROPIC_OWNER, record, 'media'),
        },
      }
    extras[owner] = (extras[owner] ?? 0n) + BigInt(tokens)
  }
  return { ok: extras }
}

export function createAnthropicMeter(
  record: AnthropicRecord,
  tokenizer: ModelTextTokenizer,
  margin: MeterMargin,
): FamilyMeter {
  return createGatewayMeter<UnitContent>({
    owner: ANTHROPIC_OWNER,
    record,
    tokenizer,
    margin,
    outputGroup: OUTPUT_GROUP_METHOD,
    uncountable: 'signed-reasoning-not-countable',
    form: 'nfkc',
    contentOf,
    imageTokens: ({ units, media }) => imageTokens(record, units, media),
    represent: view => representationOf(record, view),
  })
}
