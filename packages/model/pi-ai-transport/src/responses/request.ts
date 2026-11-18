import type { JsonValue } from '@omne-harness/json-text'
import type {
  Adoption,
  AssembledModelInput,
  FixedModelRequest,
  MeterRepresentation,
  ModelProfile,
  Parameter,
  ParameterAdoption,
  ReplayDeclaration,
  Supplier,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { ProviderDiagnostic, TransportDispatch } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { PiMaterializedMedia } from '../family.ts'
import { bool, finite, lexeme, list, object, text } from '../chat-completions/json.ts'
import { planParameters } from '../chat-completions/parameters.ts'
import {
  appliedFor,
  carriesReplay,
  materialize,
  profileDeclaration,
  wiredParams,
  type EngineBinding,
  type Materialized,
} from '../engine-request.ts'
import type { GatewayParam, ProjectedRequest } from '../chat-completions/vocabulary.ts'
import { projectResponses, type ResponsesItem, type ResponsesProjection } from './projection.ts'
import type { ResponsesRecord } from './vocabulary.ts'

export type ResponsesContext = EngineBinding & Readonly<{ record: ResponsesRecord }>

type Members = Record<string, JsonValue | undefined>

/** The members the parameters write; a field the interface has no member for is refused. */
function parameterMembers(
  context: ResponsesContext,
  params: readonly GatewayParam[],
): Outcome<Members, TransportFailure> {
  const members: Members = {}
  const reasoning: Members = {}
  if (context.record.wire.reasoning.summary !== null)
    reasoning['summary'] = text(context.record.wire.reasoning.summary)
  for (const param of params)
    switch (param.field) {
      case 'max_tokens':
        members['max_output_tokens'] = lexeme(param.value)
        continue
      case 'stop':
        members['stop'] = list(param.value.map(text))
        continue
      case 'temperature':
      case 'top_p':
      case 'frequency_penalty':
      case 'presence_penalty':
        members[param.field] = finite(param.value)
        continue
      case 'reasoning.effort':
        reasoning['effort'] = text(param.value)
        continue
      default:
        return { failure: { kind: 'unsupported', field: param.field, adapter: context.adapter } }
    }
  if (Object.keys(reasoning).length > 0) members['reasoning'] = object(reasoning)
  return { ok: members }
}

type CacheTarget = Readonly<{ item: number; part: number }>

function isText(part: JsonValue): boolean {
  if (part.kind !== 'object') return false
  const type = part.entries.find(entry => entry.key === 'type')?.value
  return type?.kind === 'string' && (type.value === 'input_text' || type.value === 'output_text')
}

// The last text part of the last message that has one.
function cacheTarget(items: readonly ResponsesItem[]): CacheTarget | null {
  for (let item = items.length - 1; item >= 0; item -= 1) {
    const found = items[item]
    if (found?.kind !== 'message') continue
    const part = found.content.findLastIndex(isText)
    if (part >= 0) return { item, part }
  }
  return null
}

function marked(part: JsonValue): JsonValue {
  if (part.kind !== 'object') throw new Error('a content part is an object')
  const members = Object.fromEntries(part.entries.map(entry => [entry.key, entry.value]))
  return object({ ...members, prompt_cache_breakpoint: object({ mode: text('explicit') }) })
}

function itemsJson(items: readonly ResponsesItem[], target: CacheTarget | null): JsonValue {
  return list(
    items.map((item, index) =>
      item.kind === 'item'
        ? item.json
        : object({
            ...item.members,
            type: text('message'),
            content: list(
              item.content.map((part, at) =>
                target !== null && target.item === index && target.part === at
                  ? marked(part)
                  : part,
              ),
            ),
          }),
    ),
  )
}

// The key names what stays the same over a session: the system prompt and the tool declarations,
// as the digests of the request prefix give them.
function cacheKey(prefix: string): string {
  const digest = (label: string): string => {
    const part = prefix.split('.').find(item => item.startsWith(`${label}:`))
    if (part === undefined) throw new Error(`the request prefix has no ${label} part`)
    return part.slice(label.length + 1)
  }
  return `${digest('s')}${digest('t')}`
}

function cacheMembers(
  context: ResponsesContext,
  projection: ResponsesProjection,
): Outcome<Readonly<{ members: Members; target: CacheTarget | null }>, TransportFailure> {
  const { cache } = context.record.wire
  if (cache.kind === 'none') return { ok: { members: {}, target: null } }
  const target = cacheTarget(projection.items)
  // The cache is an optimisation: a request with no text to mark goes out unmarked.
  if (target === null) return { ok: { members: {}, target: null } }
  return {
    ok: {
      members: {
        prompt_cache_key: text(cacheKey(projection.replayPrefix)),
        prompt_cache_options: object({ mode: text('explicit'), ttl: text(cache.ttl) }),
      },
      target,
    },
  }
}

function bodyOf(
  context: ResponsesContext,
  projection: ResponsesProjection,
  params: readonly GatewayParam[],
): Outcome<JsonValue, TransportFailure> {
  const { record } = context
  const members = parameterMembers(context, params)
  if (!('ok' in members)) return members
  const cache = cacheMembers(context, projection)
  if (!('ok' in cache)) return cache
  return {
    ok: object({
      model: text(record.route.model),
      provider: object({
        order: list(record.serving.order.map(text)),
        allow_fallbacks: bool(false),
      }),
      stream: bool(true),
      store: bool(false),
      include: list([text('reasoning.encrypted_content')]),
      ...members.ok,
      ...cache.ok.members,
      instructions: projection.instructions === null ? undefined : text(projection.instructions),
      input: itemsJson(projection.items, cache.ok.target),
      tools: projection.tools.length > 0 ? list(projection.tools) : undefined,
      tool_choice: projection.toolChoice,
    }),
  }
}

function viewOf(projection: ResponsesProjection, applied: readonly Parameter[]): ProjectedRequest {
  return {
    instruction: projection.instruction,
    turns: projection.view,
    tools: projection.declared,
    toolChoice: projection.choice,
    applied,
  }
}

function represent(
  context: ResponsesContext,
  input: Readonly<{
    projection: ResponsesProjection
    applied: readonly Parameter[]
    representation: Adoption
  }>,
): Outcome<Readonly<{ body: JsonValue; representation: Materialized }>, TransportFailure> {
  const params = wiredParams(context, input.applied)
  if (!('ok' in params)) return params
  const body = bodyOf(context, input.projection, params.ok)
  if (!('ok' in body)) return body
  return materialize(context, {
    body: body.ok,
    view: viewOf(input.projection, input.applied),
    representation: input.representation,
  })
}

export function planResponses(
  context: ResponsesContext,
  input: Readonly<{ profile: ModelProfile; supplier: Supplier; assembled: AssembledModelInput }>,
): Outcome<
  Readonly<{ parameters: readonly ParameterAdoption[]; representation: MeterRepresentation }>,
  TransportFailure
> {
  const { profile, supplier, assembled } = input
  const declaration = profileDeclaration(context, profile, supplier)
  if (!('ok' in declaration)) return declaration
  const planned = planParameters({
    record: context.record,
    adapter: context.adapter,
    outputLimit: profile.definition.context.output.provided,
    requested: assembled.parameters,
    supplier: context.adapter,
    source: assembled.source,
  })
  if (!('ok' in planned)) return planned
  const projection = projectResponses({
    record: context.record,
    adapter: context.adapter,
    declaration: declaration.ok,
    system: assembled.system,
    messages: assembled.messages,
    tools: assembled.tools,
    toolChoice: assembled.toolChoice,
    replayOff: assembled.replay === 'off',
    resent: new Set(),
  })
  if (!('ok' in projection)) return projection
  const parameters = planned.ok
  const encoded = represent(context, {
    projection: projection.ok,
    applied: parameters.map(adoption => adoption.applied),
    representation: assembled.representation,
  })
  if (!('ok' in encoded)) return encoded
  return { ok: { parameters, representation: encoded.ok.representation } }
}

export function encodeResponses(
  context: ResponsesContext,
  input: Readonly<{
    request: FixedModelRequest
    media: readonly PiMaterializedMedia[]
    declaration: ReplayDeclaration
    resent: TransportDispatch['resent']
  }>,
): Outcome<
  Readonly<{
    body: JsonValue
    representation: Materialized
    diagnostics: readonly ProviderDiagnostic[]
    replayPrefix: string
    replayCarried: boolean
  }>,
  TransportFailure
> {
  const { request } = input
  if (input.media.length > 0)
    return { failure: { kind: 'unsupported', field: 'media', adapter: context.adapter } }
  const projection = projectResponses({
    record: context.record,
    adapter: context.adapter,
    declaration: input.declaration,
    system: request.system,
    messages: request.messages,
    tools: request.tools,
    toolChoice: request.toolChoice,
    replayOff: request.replay === 'off',
    resent: new Set(input.resent),
  })
  if (!('ok' in projection)) return projection
  const encoded = represent(context, {
    projection: projection.ok,
    applied: appliedFor(context, request),
    representation: request.representation,
  })
  if (!('ok' in encoded)) return encoded
  return {
    ok: {
      ...encoded.ok,
      diagnostics: projection.ok.diagnostics.map(item => ({
        kind: 'replay-omitted',
        message: item.message,
        scope: item.scope,
        format: item.format,
        omittedParts: item.omittedParts,
        reason: item.reason,
      })),
      replayPrefix: projection.ok.replayPrefix,
      replayCarried: carriesReplay(projection.ok.treatments),
    },
  }
}
