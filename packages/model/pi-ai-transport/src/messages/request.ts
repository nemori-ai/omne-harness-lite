import { mediaPending, mediaRead, nativeParsing, type MediaView } from '../media.ts'
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
  represented,
  profileDeclaration,
  wiredParams,
  type EngineBinding,
  type Materialized,
} from '../engine-request.ts'
import type { GatewayParam, ProjectedRequest } from '../chat-completions/vocabulary.ts'
import { projectMessages, type MessagesProjection, type MessagesTurn } from './projection.ts'
import type { MessagesRecord } from './vocabulary.ts'

export type MessagesContext = EngineBinding & Readonly<{ record: MessagesRecord }>

type Members = Record<string, JsonValue | undefined>

/** The members the parameters write; a field the interface has no member for is refused. */
function parameterMembers(
  context: MessagesContext,
  params: readonly GatewayParam[],
): Outcome<Members, TransportFailure> {
  const outputLimit = context.record.parameters['max-output-tokens']
  if (outputLimit.support === 'unsupported')
    return { failure: { kind: 'unsupported', field: 'max_tokens', adapter: context.adapter } }
  const members: Members = { max_tokens: lexeme(outputLimit.accept.max) }
  const thinking = context.record.wire.thinking
  const adaptive: Members = { type: text('adaptive') }
  if (thinking.display !== null) adaptive['display'] = text(thinking.display)
  if (context.record.replay.binding === 'prefix')
    adaptive['block_binding'] = object({ prefix_mismatch_behavior: text('drop_block') })
  members['thinking'] = object(adaptive)
  for (const param of params)
    switch (param.field) {
      case 'max_tokens':
        members['max_tokens'] = lexeme(param.value)
        continue
      case 'stop':
        members['stop_sequences'] = list(param.value.map(text))
        continue
      case 'temperature':
      case 'top_p':
        members[param.field] = finite(param.value)
        continue
      case 'reasoning.effort':
        members['output_config'] = object({ effort: text(param.value) })
        continue
      default:
        return { failure: { kind: 'unsupported', field: param.field, adapter: context.adapter } }
    }
  return { ok: members }
}

type CacheTarget = Readonly<{ turn: number; part: number }>

function cacheTarget(turns: readonly MessagesTurn[]): CacheTarget | null {
  const turn = turns.length - 1
  const last = turns[turn]
  return last === undefined || last.content.length === 0
    ? null
    : { turn, part: last.content.length - 1 }
}

function marked(part: JsonValue, ttl: '5m' | '1h'): JsonValue {
  if (part.kind !== 'object') throw new Error('a content part is an object')
  const members = Object.fromEntries(part.entries.map(entry => [entry.key, entry.value]))
  return object({ ...members, cache_control: object({ type: text('ephemeral'), ttl: text(ttl) }) })
}

function turnsJson(
  turns: readonly MessagesTurn[],
  cache: Readonly<{ target: CacheTarget; ttl: '5m' | '1h' }> | null,
): JsonValue {
  return list(
    turns.map((turn, index) =>
      object({
        role: text(turn.role),
        content: list(
          turn.content.map((part, at) =>
            cache !== null && cache.target.turn === index && cache.target.part === at
              ? marked(part, cache.ttl)
              : part,
          ),
        ),
      }),
    ),
  )
}

function bodyOf(
  context: MessagesContext,
  projection: MessagesProjection,
  params: readonly GatewayParam[],
  plugins: JsonValue | undefined,
): Outcome<JsonValue, TransportFailure> {
  const { record } = context
  const members = parameterMembers(context, params)
  if (!('ok' in members)) return members
  // The cache is an optimisation: a request with no text to mark goes out unmarked.
  const target = record.wire.cache.kind === 'last-message' ? cacheTarget(projection.turns) : null
  const cache =
    target === null || record.wire.cache.kind !== 'last-message'
      ? null
      : { target, ttl: record.wire.cache.ttl }
  return {
    ok: object({
      model: text(record.route.model),
      provider: object({
        order: list(record.serving.order.map(text)),
        allow_fallbacks: bool(false),
      }),
      stream: bool(true),
      ...members.ok,
      system: projection.system.length > 0 ? list(projection.system) : undefined,
      messages: turnsJson(projection.turns, cache),
      tools: projection.tools.length > 0 ? list(projection.tools) : undefined,
      tool_choice: projection.toolChoice,
      plugins,
    }),
  }
}

function viewOf(projection: MessagesProjection, applied: readonly Parameter[]): ProjectedRequest {
  return {
    instruction: projection.instruction,
    turns: projection.view,
    tools: projection.declared,
    toolChoice: projection.choice,
    applied,
  }
}

function shown(
  context: MessagesContext,
  input: Readonly<{
    projection: MessagesProjection
    applied: readonly Parameter[]
    representation: Adoption
    media: MediaView
  }>,
) {
  const params = wiredParams(context, input.applied)
  if (!('ok' in params)) return params
  const body = bodyOf(context, input.projection, params.ok, nativeParsing(input.media))
  if (!('ok' in body)) return body
  const { representation, media } = input
  const view = viewOf(input.projection, input.applied)
  return { ok: { body: body.ok, view, representation, media } }
}

export function planMessages(
  context: MessagesContext,
  input: Readonly<{ profile: ModelProfile; supplier: Supplier; assembled: AssembledModelInput }>,
): Outcome<
  Readonly<{ parameters: readonly ParameterAdoption[]; representation: MeterRepresentation }>,
  TransportFailure
> {
  const { profile, supplier, assembled } = input
  const declaration = profileDeclaration(context, profile, supplier)
  if (!('ok' in declaration)) return declaration
  const media = mediaPending()
  const planned = planParameters({
    record: context.record,
    adapter: context.adapter,
    outputLimit: profile.definition.context.output.provided,
    requested: assembled.parameters,
    supplier: context.adapter,
    source: assembled.source,
  })
  if (!('ok' in planned)) return planned
  const projection = projectMessages({
    record: context.record,
    adapter: context.adapter,
    declaration: declaration.ok,
    system: assembled.system,
    messages: assembled.messages,
    tools: assembled.tools,
    toolChoice: assembled.toolChoice,
    replayOff: assembled.replay === 'off',
    resent: new Set(),
    media,
  })
  if (!('ok' in projection)) return projection
  const parameters = planned.ok
  const request = shown(context, {
    projection: projection.ok,
    applied: parameters.map(adoption => adoption.applied),
    representation: assembled.representation,
    media,
  })
  if (!('ok' in request)) return request
  const encoded = represented(context, request.ok)
  if (!('ok' in encoded)) return encoded
  return { ok: { parameters, representation: encoded.ok.representation } }
}

export function encodeMessages(
  context: MessagesContext,
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
  const media = mediaRead(input.media)
  const projection = projectMessages({
    record: context.record,
    adapter: context.adapter,
    declaration: input.declaration,
    system: request.system,
    messages: request.messages,
    tools: request.tools,
    toolChoice: request.toolChoice,
    replayOff: request.replay === 'off',
    resent: new Set(input.resent),
    media,
  })
  if (!('ok' in projection)) return projection
  const sent = shown(context, {
    projection: projection.ok,
    applied: appliedFor(context, request),
    representation: request.representation,
    media,
  })
  if (!('ok' in sent)) return sent
  const encoded = materialize(context, sent.ok)
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
