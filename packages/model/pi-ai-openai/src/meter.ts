import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { MediaMeasurementFact, TransportFailure } from '@omne-harness/model-contract'
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
import { IMAGE_RULES, type ImageDetail } from './images.ts'
import { OPENAI_OWNER } from './owner.ts'
import type { OpenAiRecord } from './record.ts'

export const OUTPUT_GROUP_METHOD = 'openai-complete-output-group-workload-estimated/1'
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

function partJson(part: ProjectedPart, detail: string): JsonValue | null {
  switch (part.kind) {
    case 'text':
      return obj({ type: str('text'), text: str(part.text) })
    case 'image':
      return 'ref' in part
        ? obj({ type: str('image'), mediaType: str(part.ref.mediaType), detail: str(detail) })
        : obj({ type: str('image'), mediaType: str(part.mediaType), detail: str(detail) })
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
    case 'thinking':
    case 'tool_call_incomplete':
    case 'voice':
    case 'file':
      return null
    default: {
      const _exhaustive: never = part
      return _exhaustive
    }
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

function turnJson(turn: ProjectedTurn, detail: string): JsonValue {
  const parts = turn.blocks.flatMap(block => {
    const json = partJson(block, detail)
    return json === null ? [] : [json]
  })
  return obj({ role: str(turn.role), content: arr(parts), ...replayJson(turn) })
}

export function representationOf(
  record: OpenAiRecord,
  view: ProjectedRequest,
): Readonly<{ tokenInput: JsonValue; units: MeterUnits }> {
  const detail = record.wire.image?.detail ?? 'auto'
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
    ...view.turns.map(turn => ({ json: turnJson(turn, detail), message: turn.message })),
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

type UnitContent = Readonly<{
  images: readonly Readonly<{ detail: ImageDetail }>[]
  reasoning: boolean
}>

function memberOf(value: JsonValue, key: string): JsonValue | undefined {
  return value.kind === 'object' ? value.entries.find(entry => entry.key === key)?.value : undefined
}

const DETAILS: readonly ImageDetail[] = ['low', 'high', 'auto', 'original']

function contentOf(tokenInput: JsonValue): readonly UnitContent[] | null {
  const messages = memberOf(tokenInput, 'messages')
  if (messages?.kind !== 'array') return null
  const units: UnitContent[] = []
  for (const message of messages.items) {
    const content = memberOf(message, 'content')
    if (content?.kind !== 'array') return null
    const images: { detail: ImageDetail }[] = []
    for (const part of content.items) {
      const type = memberOf(part, 'type')
      if (type?.kind !== 'string') return null
      if (type.value !== 'image') continue
      const detail = memberOf(part, 'detail')
      const known = DETAILS.find(item => detail?.kind === 'string' && item === detail.value)
      if (known === undefined) return null
      images.push({ detail: known })
    }
    units.push({ images, reasoning: memberOf(message, 'reasoning_details') !== undefined })
  }
  return units
}

function unavailable(diagnostic: string): Outcome<never, TransportFailure> {
  return { failure: { kind: 'unavailable', dependency: OPENAI_OWNER, diagnostic } }
}

function imageTokens(
  record: OpenAiRecord,
  units: readonly UnitContent[],
  media: readonly MediaMeasurementFact[],
): Outcome<readonly bigint[], TransportFailure> {
  const facts = media.filter(fact => fact.kind === 'image')
  const images = units.flatMap((unit, index) => unit.images.map(image => ({ ...image, index })))
  if (facts.length !== images.length) return unavailable('image-measurement-missing')
  const rule = IMAGE_RULES[record.meter.image]
  const extras = units.map(() => 0n)
  for (const [position, fact] of facts.entries()) {
    const image = images[position]
    if (fact.kind !== 'image' || image === undefined)
      return unavailable('image-measurement-missing')
    const tokens = rule({
      width: Number(fact.widthPixels),
      height: Number(fact.heightPixels),
      detail: image.detail,
    })
    if (tokens === null)
      return {
        failure: {
          kind: 'unsupported',
          field: `image ${position}`,
          adapter: componentAdoption(record, 'media'),
        },
      }
    extras[image.index] = (extras[image.index] ?? 0n) + BigInt(tokens)
  }
  return { ok: extras }
}

export function createOpenAiMeter(
  record: OpenAiRecord,
  tokenizer: ModelTextTokenizer,
  margin: MeterMargin,
): FamilyMeter {
  const representation = componentAdoption(record, 'representation')
  const instance = createCalibratedMeter<UnitContent>({
    owner: OPENAI_OWNER,
    supplier: recordAdoption(OPENAI_OWNER, record),
    adoptions: {
      meter: componentAdoption(record, 'meter'),
      representation,
      media: componentAdoption(record, 'media'),
    },
    basis: countingBasis(record),
    margin,
    outputGroup: OUTPUT_GROUP_METHOD,
    uncountable: 'encrypted-reasoning-not-countable',
    tokens: { tokenizer, form: 'as-written' },
    contentOf,
    imageTokens: ({ units, media }) => imageTokens(record, units, media),
  })
  return Object.freeze({
    instance,
    represent: (view: ProjectedRequest) => ({
      adoption: representation,
      ...representationOf(record, view),
    }),
  })
}
