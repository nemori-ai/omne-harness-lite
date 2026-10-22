// The input meter of the Anthropic family. `represent` turns the projection that encode writes
// into the token input of `anthropic-visible-json/1`; `measure` counts the NFKC form of that text
// with the legacy Claude BPE, adds the 28-pixel patch rule per measured image, and reports an
// estimate with the configured margin. Signed reasoning is never tokenized and never dropped: a
// request that carries it has no estimate.
import { createHash } from 'node:crypto'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type {
  Adoption,
  BudgetCheck,
  MediaMeasurementFact,
  ModelInputMeter,
  ModelLimit,
  ModelTextTokenizer,
  RequestBudget,
  TransportFailure,
  UpstreamLimit,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { recordAdoption } from '@omne-harness/pi-ai-transport'
import type {
  FamilyMeter,
  ProjectedPart,
  ProjectedRequest,
  ProjectedTurn,
} from '@omne-harness/pi-ai-transport/chat-completions'
import { componentAdoption, countingBasis } from './adoptions.ts'
import { IMAGE_MEDIA_TYPES, IMAGE_RULES } from './images.ts'
import { ANTHROPIC_OWNER } from './owner.ts'
import type { AnthropicRecord } from './record.ts'

/** The margin that every estimate of the family carries, from the family configuration. */
export type MeterMargin = Readonly<{
  /** A non-negative decimal integer: the margin is `ceil(amount * percent / 100)`. */
  percent: string
  /** The adoption of the margin policy that the assembly configured. */
  source: Adoption
}>

type MeasureInput = Parameters<ModelInputMeter['measure']>[0]

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
        content.push(obj({ type: str('image_url'), image_url: obj({ url: str(IMAGE_PLACEHOLDER) }) }))
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
      // Thinking goes out through the replay member only; the record omits foreign thinking.
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
 * they are not part of it.
 */
export function tokenInputOf(record: AnthropicRecord, view: ProjectedRequest): JsonValue {
  const instruction = view.instruction.flatMap(block =>
    block.kind === 'text' ? [obj({ type: str('text'), text: str(block.text) })] : [],
  )
  const messages = [
    ...(instruction.length === 0
      ? []
      : [obj({ role: str(record.wire.roles.instruction), content: arr(instruction) })]),
    ...view.turns.map(turnJson),
  ]
  return obj({
    messages: arr(messages),
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
}

// --- reading the token input -----------------------------------------------------------------

type Content = Readonly<{ images: number; opaque: boolean }>

function memberOf(value: JsonValue, key: string): JsonValue | undefined {
  return value.kind === 'object' ? value.entries.find(entry => entry.key === key)?.value : undefined
}

/** The image count and the opaque reasoning of a token input, or `null` when it is not this schema. */
function contentOf(tokenInput: JsonValue): Content | null {
  const messages = memberOf(tokenInput, 'messages')
  if (messages?.kind !== 'array') return null
  let images = 0
  let opaque = false
  for (const message of messages.items) {
    const content = memberOf(message, 'content')
    if (content?.kind !== 'array') return null
    if (memberOf(message, 'reasoning_details') !== undefined) opaque = true
    for (const part of content.items) {
      const type = memberOf(part, 'type')
      if (type?.kind !== 'string') return null
      if (type.value === 'image_url') images += 1
    }
  }
  return { images, opaque }
}

// --- measuring -------------------------------------------------------------------------------

function sameAdoption(left: Adoption, right: Adoption): boolean {
  return (
    left.owner === right.owner &&
    left.name === right.name &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

function unavailable(diagnostic: string): Outcome<never, TransportFailure> {
  return { failure: { kind: 'unavailable', dependency: ANTHROPIC_OWNER, diagnostic } }
}

function isImageMediaType(mediaType: string): boolean {
  return IMAGE_MEDIA_TYPES.some(item => item === mediaType)
}

/** The estimated tokens of the measured images, or the failure that keeps one out. */
function imageTokens(
  record: AnthropicRecord,
  images: number,
  media: readonly MediaMeasurementFact[],
): Outcome<bigint, TransportFailure> {
  const facts = media.filter(fact => fact.kind === 'image')
  if (facts.length !== images) return unavailable('image-measurement-missing')
  const rule = IMAGE_RULES[record.meter.image]
  let total = 0n
  for (const [index, fact] of facts.entries()) {
    const tokens =
      fact.kind === 'image' && isImageMediaType(fact.mediaType)
        ? rule({ width: Number(fact.widthPixels), height: Number(fact.heightPixels) })
        : null
    if (tokens === null)
      return {
        failure: {
          kind: 'unsupported',
          field: `image ${index}`,
          adapter: componentAdoption(record, 'media'),
        },
      }
    total += BigInt(tokens)
  }
  return { ok: total }
}

function upstreamOf(entries: ModelLimit['upstream'], supplier: Adoption): UpstreamLimit {
  return entries.find(entry => sameAdoption(entry.supplier, supplier))?.limit ?? { kind: 'unknown' }
}

/** The input bound: the separate input limit, else the window less the output limit. */
function inputCheck(
  input: MeasureInput,
  record: AnthropicRecord,
  margin: MeterMargin,
  amount: bigint,
): BudgetCheck {
  const supplier = input.supplier.adoption
  const { context } = input
  const separate = context.input
  const limit =
    separate === null
      ? BigInt(context.window.provided) - BigInt(context.output.provided)
      : BigInt(separate.provided)
  const upstream = upstreamOf((separate ?? context.window).upstream, supplier)
  const marginTokens = (amount * BigInt(margin.percent) + 99n) / 100n
  return {
    supplier,
    metric: 'input-tokens',
    subject: 'request',
    measurement: {
      kind: 'estimate',
      amount: String(amount),
      margin: String(marginTokens),
      method: componentAdoption(record, 'meter'),
      marginSource: margin.source,
    },
    limit: String(limit),
    constraint: { profile: input.profile, upstream },
  }
}

/** The exact byte and count checks of the profile limits that apply to this request. */
function exactChecks(input: MeasureInput, record: AnthropicRecord): readonly BudgetCheck[] {
  const supplier = input.supplier.adoption
  const method = componentAdoption(record, 'media')
  const images = input.representation.media.filter(fact => fact.kind === 'image')
  const checks: BudgetCheck[] = []
  for (const limit of input.limits) {
    const constraint = { profile: input.profile, upstream: upstreamOf(limit.upstream, supplier) }
    const check = (subject: string, amount: string): BudgetCheck => ({
      supplier,
      metric: limit.metric,
      subject,
      measurement: { kind: 'exact', amount, method },
      limit: limit.provided,
      constraint,
    })
    switch (limit.metric) {
      case 'image-bytes':
        for (const fact of images) checks.push(check(fact.reference.key, fact.bytes))
        break
      case 'image-count':
        checks.push(check('request', String(images.length)))
        break
      case 'request-bytes':
        if (input.representation.kind === 'materialized')
          checks.push(check('request', input.representation.requestBytes))
        break
      case 'voice-bytes':
      case 'voice-duration-ms':
        break
      default: {
        const _exhaustive: never = limit.metric
        return _exhaustive
      }
    }
  }
  return checks
}

function digestOf(input: MeasureInput): string {
  const fixed = {
    profile: input.profile,
    supplier: input.supplier,
    context: input.context,
    limits: input.limits,
    parameters: input.parameters,
    representation: {
      adoption: input.representation.adoption,
      tokenInput: writeJsonText(input.representation.tokenInput),
      media: input.representation.media,
    },
  }
  return createHash('sha256').update(JSON.stringify(fixed)).digest('hex')
}

function measure(
  record: AnthropicRecord,
  tokenizer: ModelTextTokenizer,
  margin: MeterMargin,
  input: MeasureInput,
): Outcome<RequestBudget, TransportFailure> {
  const adapter = componentAdoption(record, 'meter')
  if (!sameAdoption(input.supplier.adoption, recordAdoption(ANTHROPIC_OWNER, record)))
    return { failure: { kind: 'invalid', field: 'supplier', reason: 'not-this-meter' } }
  const { representation } = input
  if (!sameAdoption(representation.adoption, componentAdoption(record, 'representation')))
    return { failure: { kind: 'unsupported', field: 'representation', adapter } }
  // Media that is not read yet has no pixels here; the media path is not part of this meter.
  if (representation.kind === 'pending-media')
    return { failure: { kind: 'unsupported', field: 'representation.kind', adapter } }
  const content = contentOf(representation.tokenInput)
  if (content === null) return { failure: { kind: 'invalid', field: 'tokenInput', reason: 'schema' } }
  if (content.opaque) return unavailable('signed-reasoning-not-countable')
  const images = imageTokens(record, content.images, representation.media)
  if (!('ok' in images)) return images
  // The NFKC form of the token input, as the sealed meter counted it.
  const text = writeJsonText(representation.tokenInput).normalize('NFKC')
  const counted = tokenizer.count([{ kind: 'text', text }])
  if (!('ok' in counted))
    return {
      failure: { kind: 'unavailable', dependency: 'tokenizer', diagnostic: counted.failure.kind },
    }
  const amount = BigInt(counted.ok.tokens) + images.ok
  const counting = countingBasis(record)
  return {
    ok: {
      kind: 'complete',
      inputDigest: digestOf(input),
      checks: [inputCheck(input, record, margin, amount), ...exactChecks(input, record)],
      counting: [counting],
    },
  }
}

/** The meter of one record over an initialized tokenizer. Pure: no file, network or environment. */
export function createAnthropicMeter(
  record: AnthropicRecord,
  tokenizer: ModelTextTokenizer,
  margin: MeterMargin,
): FamilyMeter {
  const representation = componentAdoption(record, 'representation')
  const instance: ModelInputMeter = Object.freeze({
    basis: countingBasis(record),
    measure: (input: MeasureInput) => measure(record, tokenizer, margin, input),
  })
  return Object.freeze({
    instance,
    represent: (view: ProjectedRequest) => ({
      adoption: representation,
      tokenInput: tokenInputOf(record, view),
    }),
  })
}
