// The input meter of the OpenAI family. `represent` turns the projection that encode writes into
// the token input of `openai-visible-json/1`; `measure` counts that text with the o200k proxy
// encoding, adds the image rule of the record per measured image, and reports an estimate with the
// configured margin. Encrypted reasoning is never tokenized and never dropped: a request that
// carries it has no estimate.
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
import { IMAGE_RULES, type ImageDetail } from './images.ts'
import { OPENAI_OWNER } from './owner.ts'
import type { OpenAiRecord } from './record.ts'

/** The margin that every estimate of the family carries, from the family configuration. */
export type MeterMargin = Readonly<{
  /** A non-negative decimal integer: the margin is `ceil(amount * percent / 100)`. */
  percent: string
  /** The adoption of the margin policy that the assembly configured. */
  source: Adoption
}>

type MeasureInput = Parameters<ModelInputMeter['measure']>[0]

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
    // Thinking goes out through the replay member only; the record omits foreign thinking.
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
      return { reasoning_details: obj({ opaque: { kind: 'number', lexeme: String(turn.replay.details.length) } }) }
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
 */
export function tokenInputOf(record: OpenAiRecord, view: ProjectedRequest): JsonValue {
  const detail = record.wire.image?.detail ?? 'auto'
  const instruction = view.instruction.flatMap(block =>
    block.kind === 'text' ? [obj({ type: str('text'), text: str(block.text) })] : [],
  )
  const messages = [
    ...(instruction.length === 0
      ? []
      : [obj({ role: str(record.wire.roles.instruction), content: arr(instruction) })]),
    ...view.turns.map(turn => turnJson(turn, detail)),
  ]
  return obj({
    messages: arr(messages),
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
}

// --- reading the token input -----------------------------------------------------------------

type Content = Readonly<{
  images: readonly Readonly<{ detail: ImageDetail }>[]
  opaque: boolean
}>

function memberOf(value: JsonValue, key: string): JsonValue | undefined {
  return value.kind === 'object' ? value.entries.find(entry => entry.key === key)?.value : undefined
}

const DETAILS: readonly ImageDetail[] = ['low', 'high', 'auto', 'original']

/** The images and the opaque reasoning of a token input, or `null` when it is not this schema. */
function contentOf(tokenInput: JsonValue): Content | null {
  const messages = memberOf(tokenInput, 'messages')
  if (messages?.kind !== 'array') return null
  const images: { detail: ImageDetail }[] = []
  let opaque = false
  for (const message of messages.items) {
    const content = memberOf(message, 'content')
    if (content?.kind !== 'array') return null
    if (memberOf(message, 'reasoning_details') !== undefined) opaque = true
    for (const part of content.items) {
      const type = memberOf(part, 'type')
      if (type?.kind !== 'string') return null
      if (type.value !== 'image') continue
      const detail = memberOf(part, 'detail')
      const known = DETAILS.find(item => detail?.kind === 'string' && item === detail.value)
      if (known === undefined) return null
      images.push({ detail: known })
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
  return { failure: { kind: 'unavailable', dependency: OPENAI_OWNER, diagnostic } }
}

/** The estimated tokens of each measured image, in order, or the failure that keeps one out. */
function imageTokens(
  record: OpenAiRecord,
  images: Content['images'],
  media: readonly MediaMeasurementFact[],
): Outcome<bigint, TransportFailure> {
  const facts = media.filter(fact => fact.kind === 'image')
  if (facts.length !== images.length) return unavailable('image-measurement-missing')
  const rule = IMAGE_RULES[record.meter.image]
  let total = 0n
  for (const [index, fact] of facts.entries()) {
    const image = images[index]
    if (fact.kind !== 'image' || image === undefined) return unavailable('image-measurement-missing')
    const tokens = rule({
      width: Number(fact.widthPixels),
      height: Number(fact.heightPixels),
      detail: image.detail,
    })
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
  record: OpenAiRecord,
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
function exactChecks(input: MeasureInput, record: OpenAiRecord): readonly BudgetCheck[] {
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
  record: OpenAiRecord,
  tokenizer: ModelTextTokenizer,
  margin: MeterMargin,
  input: MeasureInput,
): Outcome<RequestBudget, TransportFailure> {
  const adapter = componentAdoption(record, 'meter')
  if (!sameAdoption(input.supplier.adoption, recordAdoption(OPENAI_OWNER, record)))
    return { failure: { kind: 'invalid', field: 'supplier', reason: 'not-this-meter' } }
  const { representation } = input
  if (!sameAdoption(representation.adoption, componentAdoption(record, 'representation')))
    return { failure: { kind: 'unsupported', field: 'representation', adapter } }
  // Media that is not read yet has no pixels here; the media path is not part of this meter.
  if (representation.kind === 'pending-media')
    return { failure: { kind: 'unsupported', field: 'representation.kind', adapter } }
  const content = contentOf(representation.tokenInput)
  if (content === null) return { failure: { kind: 'invalid', field: 'tokenInput', reason: 'schema' } }
  if (content.opaque) return unavailable('encrypted-reasoning-not-countable')
  const images = imageTokens(record, content.images, representation.media)
  if (!('ok' in images)) return images
  const counted = tokenizer.count([{ kind: 'text', text: writeJsonText(representation.tokenInput) }])
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
export function createOpenAiMeter(
  record: OpenAiRecord,
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
