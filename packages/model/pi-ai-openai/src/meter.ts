// The input meter of the OpenAI family. `represent` turns the projection that encode writes into
// the token input of `openai-visible-json/1` and the message side table of its units; `measure`
// counts that text with the o200k proxy encoding, adds the image rule of the record per measured
// image, and reports an estimate with the configured margin. Encrypted reasoning is never
// tokenized and never dropped: a unit that carries it is counted as the output tokens of the call
// that produced it when a preparation lease hands that count over, else the request has no estimate.
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
  type ProjectedPart,
  type ProjectedRequest,
  type ProjectedTurn,
} from '@omne-harness/pi-ai-transport/chat-completions'
import { componentAdoption, countingBasis } from './adoptions.ts'
import { IMAGE_RULES, type ImageDetail } from './images.ts'
import { OPENAI_OWNER } from './owner.ts'
import type { OpenAiRecord } from './record.ts'

/**
 * The sealed method of the output-count substitution (input-meters/openai-family-policy.ts,
 * `OPENAI_FAMILY_REPLAY`): the method name suffix of a measurement that counted a unit as the
 * output of its source. The anchored suffix is the shared `ANCHORED_METHOD`.
 */
export const OUTPUT_GROUP_METHOD = 'openai-complete-output-group-workload-estimated/1'
export { ANCHORED_METHOD, type MeterMargin } from '@omne-harness/pi-ai-transport/chat-completions'

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

/** One part of a wire message in the token input; `null` for a part the wire does not carry here. */
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
    // A thinking part goes out through the replay member only. Foreign thinking that the
    // projection writes as text reaches the meter as a text part.
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
      // Only the count: ciphertext has no text to count.
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

/**
 * The token input of `openai-visible-json/1`: the instruction, the wire messages, the tools, the
 * tool choice and the applied parameters, in wire order. Images are placeholders without data.
 * The units name the message of each member of `messages`, built from the same list, so the two
 * stay aligned by construction; the instruction unit is `null`.
 */
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

// --- reading the token input -----------------------------------------------------------------

/** What the meter reads from one message unit of the token input. */
type UnitContent = Readonly<{
  images: readonly Readonly<{ detail: ImageDetail }>[]
  /**
   * True when the unit carries a `reasoning_details` member. The family codec wrote it only for
   * a whole group it can replay (sealed classifyOpenAiDetail: `reasoning.encrypted`, format
   * `openai-responses-v1`, ciphertext present and not `[REDACTED]`), so this is the sealed
   * whole-group condition seen from the meter.
   */
  reasoning: boolean
}>

function memberOf(value: JsonValue, key: string): JsonValue | undefined {
  return value.kind === 'object' ? value.entries.find(entry => entry.key === key)?.value : undefined
}

const DETAILS: readonly ImageDetail[] = ['low', 'high', 'auto', 'original']

/** The images and the reasoning of each unit of a token input, or `null` when it is not this schema. */
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

// --- measuring -------------------------------------------------------------------------------

function unavailable(diagnostic: string): Outcome<never, TransportFailure> {
  return { failure: { kind: 'unavailable', dependency: OPENAI_OWNER, diagnostic } }
}

/**
 * The estimated tokens of each measured image, per unit and in order, or the failure that keeps
 * one out. The facts stand for the images of the whole token input, in image order.
 */
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

/**
 * The meter of one record over an initialized tokenizer. Pure: no file, network or environment.
 * The shared meter of pi-ai-transport does the checks, the arithmetic and the budget; this family
 * gives its adoptions, its unit reading, its image rule, its tokenizer and its method names.
 */
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
