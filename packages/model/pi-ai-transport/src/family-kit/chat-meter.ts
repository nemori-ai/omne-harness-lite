import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { MediaMeasurementFact, TransportFailure } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  MeterUnits,
  ProjectedPart,
  ProjectedRequest,
  ProjectedTurn,
} from '../chat-completions/vocabulary.ts'
import { arr, memberOf, obj, str } from './meter.ts'
import type { ImageTokenRule } from './record.ts'

// How a chat-shaped record writes the request its meter counts. `imageDetail` is null when the
// record takes no images; `files` says whether a file reference is written.
export type ChatRepresentation = Readonly<{
  instructionRole: string
  imageDetail: string | null
  files: boolean
}>

function partJson(part: ProjectedPart, shape: ChatRepresentation): JsonValue | null {
  switch (part.kind) {
    case 'text':
      return obj({ type: str('text'), text: str(part.text) })
    case 'image': {
      if (shape.imageDetail === null) return null
      const mediaType = 'ref' in part ? part.ref.mediaType : part.mediaType
      return obj({ type: str('image'), mediaType: str(mediaType), detail: str(shape.imageDetail) })
    }
    case 'file':
      return shape.files ? obj({ type: str('file') }) : null
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

function turnJson(turn: ProjectedTurn, shape: ChatRepresentation): JsonValue {
  const parts = turn.blocks.flatMap(block => {
    const json = partJson(block, shape)
    return json === null ? [] : [json]
  })
  return obj({ role: str(turn.role), content: arr(parts), ...replayJson(turn) })
}

export function chatRepresentation(
  view: ProjectedRequest,
  shape: ChatRepresentation,
): Readonly<{ tokenInput: JsonValue; units: MeterUnits }> {
  const instruction = view.instruction.flatMap(block =>
    block.kind === 'text' ? [obj({ type: str('text'), text: str(block.text) })] : [],
  )
  const leading: readonly Readonly<{ json: JsonValue; message: null }>[] =
    instruction.length === 0
      ? []
      : [
          {
            json: obj({ role: str(shape.instructionRole), content: arr(instruction) }),
            message: null,
          },
        ]
  const units = [
    ...leading,
    ...view.turns.map(turn => ({ json: turnJson(turn, shape), message: turn.message })),
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

export type ChatUnit<D extends string = string> = Readonly<{
  images: readonly Readonly<{ detail: D }>[]
  files: boolean
  reasoning: boolean
}>

// With `details`, an image whose detail is not one of them makes the input unreadable.
export function chatUnitsOf(tokenInput: JsonValue): readonly ChatUnit[] | null
export function chatUnitsOf<D extends string>(
  tokenInput: JsonValue,
  details: readonly D[],
): readonly ChatUnit<D>[] | null
export function chatUnitsOf(
  tokenInput: JsonValue,
  details?: readonly string[],
): readonly ChatUnit[] | null {
  const messages = memberOf(tokenInput, 'messages')
  if (messages?.kind !== 'array') return null
  const units: ChatUnit[] = []
  for (const message of messages.items) {
    const unit = unitOf(message, details)
    if (unit === null) return null
    units.push(unit)
  }
  return units
}

function unitOf(message: JsonValue, details: readonly string[] | undefined): ChatUnit | null {
  const content = memberOf(message, 'content')
  if (content?.kind !== 'array') return null
  const images: { detail: string }[] = []
  let files = false
  for (const part of content.items) {
    const type = memberOf(part, 'type')
    if (type?.kind !== 'string') return null
    if (type.value === 'file') files = true
    if (type.value !== 'image') continue
    const detail = details === undefined ? '' : detailOf(part, details)
    if (detail === null) return null
    images.push({ detail })
  }
  return { images, files, reasoning: memberOf(message, 'reasoning_details') !== undefined }
}

function detailOf(part: JsonValue, details: readonly string[]): string | null {
  const detail = memberOf(part, 'detail')
  if (detail?.kind !== 'string') return null
  return details.find(item => item === detail.value) ?? null
}

const POSITIVE = /^[1-9][0-9]*$/
const NONNEGATIVE = /^(0|[1-9][0-9]*)$/

function tilesOf(rule: ImageTokenRule): Readonly<{ tile: bigint; rate: bigint; overhead: bigint }> {
  if (
    !POSITIVE.test(rule.tilePixels) ||
    !POSITIVE.test(rule.tokensPerTile) ||
    !NONNEGATIVE.test(rule.overheadTokens)
  )
    throw new RangeError('invalid image token rule')
  return {
    tile: BigInt(rule.tilePixels),
    rate: BigInt(rule.tokensPerTile),
    overhead: BigInt(rule.overheadTokens),
  }
}

// Each image's tokens stay on its message, so a suffix calibrates alone. A file reference makes
// the request uncountable: its text is extracted upstream.
export function tileImageTokens(
  owner: string,
  rule: ImageTokenRule | undefined,
  units: readonly Readonly<{ images: readonly unknown[]; files: boolean }>[],
  media: readonly MediaMeasurementFact[],
): Outcome<readonly bigint[], TransportFailure> {
  const unavailable = (diagnostic: string): Outcome<never, TransportFailure> => ({
    failure: { kind: 'unavailable', dependency: owner, diagnostic },
  })
  if (units.some(unit => unit.files)) return unavailable('file-text-not-countable')
  const facts = media.filter(fact => fact.kind === 'image')
  const count = units.reduce((total, unit) => total + unit.images.length, 0)
  if (facts.length !== count) return unavailable('image-measurement-missing')
  if (count === 0) return { ok: units.map(() => 0n) }
  if (rule === undefined) return unavailable('image-rule-missing')
  const { tile, rate, overhead } = tilesOf(rule)
  const extras = []
  let position = 0
  for (const unit of units) {
    let extra = 0n
    for (let index = 0; index < unit.images.length; index++) {
      const fact = facts[position++]
      if (
        fact === undefined ||
        !POSITIVE.test(fact.widthPixels) ||
        !POSITIVE.test(fact.heightPixels)
      )
        return unavailable('invalid-image-dimensions')
      const across = (BigInt(fact.widthPixels) + tile - 1n) / tile
      const down = (BigInt(fact.heightPixels) + tile - 1n) / tile
      extra += across * down * rate + overhead
    }
    extras.push(extra)
  }
  return { ok: extras }
}
