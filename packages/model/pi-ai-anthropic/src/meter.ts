// The input meter of the Anthropic family. `represent` turns the projection that encode writes
// into the token input of `anthropic-visible-json/1` and the message side table of its units;
// `measure` counts the NFKC form of that text with the legacy Claude BPE, adds the 28-pixel patch
// rule per measured image, and reports an estimate with the configured margin. Signed reasoning
// is never tokenized and never dropped: a unit that carries a signed group is counted as the
// output tokens of the call that produced it when a preparation lease hands that count over, else
// the request has no estimate.
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type {
  MediaMeasurementFact,
  ModelTextTokenizer,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { recordAdoption } from '@omne-harness/pi-ai-transport'
import {
  createCalibratedMeter,
  type FamilyMeter,
  type MeterMargin,
  type MeterUnits,
  type ProjectedRequest,
  type ProjectedTurn,
} from '@omne-harness/pi-ai-transport/chat-completions'
import { componentAdoption, countingBasis } from './adoptions.ts'
import { IMAGE_MEDIA_TYPES, IMAGE_RULES } from './images.ts'
import { ANTHROPIC_OWNER } from './owner.ts'
import type { AnthropicRecord } from './record.ts'

/**
 * The sealed method of the output-count substitution (input-meters/anthropic-replay.ts,
 * `ANTHROPIC_REPLAY_REVISION`): the method name suffix of a measurement that counted a unit as the
 * output of its source. The anchored suffix is the shared `ANCHORED_METHOD`.
 */
export const OUTPUT_GROUP_METHOD =
  'anthropic-complete-signed-encrypted-output-zero-framing-estimated/1'
export { ANCHORED_METHOD, type MeterMargin } from '@omne-harness/pi-ai-transport/chat-completions'

/** What the token input writes in place of image data. */
const IMAGE_PLACEHOLDER = '[image]'

// --- the token input -------------------------------------------------------------------------

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

function call(id: string, name: string, args: string): JsonValue {
  return obj({
    id: str(id),
    type: str('function'),
    function: obj({ name: str(name), arguments: str(args) }),
  })
}

/** The members of one wire message that its parts give: content, tool calls and tool call id. */
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
      // A thinking part goes out through the replay member only. Foreign thinking that the
      // projection writes as text reaches the meter as a text part.
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
      // Only the count: a signed group is not text this meter can count.
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

/**
 * The token input of `anthropic-visible-json/1`: the wire messages and the tools, in wire order.
 * Images are `[image]` placeholders without data; cache markers select reuse, not prompt text, so
 * they are not part of it. The units name the message of each member of `messages`, built from
 * the same list, so the two stay aligned by construction; the instruction unit is `null`.
 */
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

// --- reading the token input -----------------------------------------------------------------

/** What the meter reads from one message unit of the token input. */
type UnitContent = Readonly<{
  images: number
  /**
   * True when the unit carries a `reasoning_details` member. The family codec wrote it only for
   * a whole group it can replay (sealed classifyAnthropicReasoning: format `anthropic-claude-v1`,
   * signed `reasoning.text` or `reasoning.encrypted` with ciphertext that is not `[REDACTED]`),
   * so this is the sealed whole-group condition seen from the meter.
   */
  reasoning: boolean
}>

function memberOf(value: JsonValue, key: string): JsonValue | undefined {
  return value.kind === 'object' ? value.entries.find(entry => entry.key === key)?.value : undefined
}

/** The image count and the reasoning of each unit of a token input, or `null` when it is not this schema. */
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

// --- measuring -------------------------------------------------------------------------------

function unavailable(diagnostic: string): Outcome<never, TransportFailure> {
  return { failure: { kind: 'unavailable', dependency: ANTHROPIC_OWNER, diagnostic } }
}

function isImageMediaType(mediaType: string): boolean {
  return IMAGE_MEDIA_TYPES.some(item => item === mediaType)
}

/**
 * The estimated tokens of the measured images, per unit and in order, or the failure that keeps
 * one out. The facts stand for the images of the whole token input, in image order.
 */
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
          adapter: componentAdoption(record, 'media'),
        },
      }
    extras[owner] = (extras[owner] ?? 0n) + BigInt(tokens)
  }
  return { ok: extras }
}

/**
 * The meter of one record over an initialized tokenizer. Pure: no file, network or environment.
 * The shared meter of pi-ai-transport does the checks, the arithmetic and the budget; this family
 * gives its adoptions, its unit reading, its image rule, its tokenizer and its method names.
 */
export function createAnthropicMeter(
  record: AnthropicRecord,
  tokenizer: ModelTextTokenizer,
  margin: MeterMargin,
): FamilyMeter {
  const representation = componentAdoption(record, 'representation')
  const instance = createCalibratedMeter<UnitContent>({
    owner: ANTHROPIC_OWNER,
    supplier: recordAdoption(ANTHROPIC_OWNER, record),
    adoptions: {
      meter: componentAdoption(record, 'meter'),
      representation,
      media: componentAdoption(record, 'media'),
    },
    basis: countingBasis(record),
    margin,
    outputGroup: OUTPUT_GROUP_METHOD,
    uncountable: 'signed-reasoning-not-countable',
    tokens: { tokenizer, form: 'nfkc' },
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
