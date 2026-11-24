// Derived from pi 1.0.0, commit a13d35a742c6ef8462812a28fbe1d8c8b7431c32 (buildParams; the source
// file is named in provenance.json). Copyright (c) 2025 Mario Zechner. MIT: ../../LICENSE.pi.
// See provenance.json.
import { mediaPending, mediaRead, nativeParsing, type MediaView } from '../media.ts'
import type { JsonValue } from '@omne-harness/json-text'
import {
  type Adoption,
  type ReasoningEffortMapping,
  type AssembledModelInput,
  type FixedModelRequest,
  type MeterRepresentation,
  type ModelProfile,
  type Parameter,
  type ParameterAdoption,
  type ReplayDeclaration,
  type Supplier,
  type TransportFailure,
} from '@omne-harness/model-contract'
import type { ProviderDiagnostic, TransportDispatch } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { PiMaterializedMedia } from '../family.ts'
import { gatewayMembers } from './gateway.ts'
import { bool, list, object, text } from './json.ts'
import { planParameters } from './parameters.ts'
import {
  appliedFor,
  carriesReplay,
  materialize,
  represented,
  profileDeclaration,
  wiredParams,
  type Materialized,
} from '../engine-request.ts'
import { cacheTarget, messagesJson, project, type Projection } from './projection.ts'
import type {
  ChatCompletionsRecord,
  FamilyMeter,
  GatewayParam,
  ProjectedRequest,
  VendorHooks,
} from './vocabulary.ts'

export type RequestContext = Readonly<{
  bindingEfforts?: ReasoningEffortMapping | undefined
  record: ChatCompletionsRecord
  hooks: VendorHooks
  meter: FamilyMeter
  supplier: Supplier
  adapter: Adoption
}>

function diagnosticsOf(projection: Projection): readonly ProviderDiagnostic[] {
  return projection.diagnostics.map(item => ({
    kind: 'replay-omitted',
    message: item.message,
    scope: item.scope,
    format: item.format,
    omittedParts: item.omittedParts,
    reason: item.reason,
  }))
}

function gatewayParams(
  context: RequestContext,
  applied: readonly Parameter[],
): Outcome<readonly GatewayParam[], TransportFailure> {
  const params = wiredParams(context, applied)
  return 'ok' in params ? { ok: [...params.ok, ...context.record.wire.fixed] } : params
}

function bodyOf(
  context: RequestContext,
  projection: Projection,
  params: readonly GatewayParam[],
  plugins: JsonValue | undefined,
): Outcome<JsonValue, TransportFailure> {
  const { record } = context
  let target = null
  if (record.wire.cache.kind === 'last-message') {
    target = cacheTarget(projection.messages)
    if (target === null)
      return {
        failure: { kind: 'unsupported', field: 'no-cache-target', adapter: context.adapter },
      }
  }
  return {
    ok: object({
      ...gatewayMembers(params),
      model: text(record.route.model),
      provider: object({
        order: list(record.serving.order.map(text)),
        allow_fallbacks: bool(false),
        require_parameters: bool(true),
      }),
      stream: bool(true),
      messages: messagesJson(projection.messages, record.wire, target),
      tools: projection.tools.length > 0 ? list(projection.tools) : undefined,
      tool_choice: projection.toolChoice,
      plugins,
    }),
  }
}

function viewOf(projection: Projection, applied: readonly Parameter[]): ProjectedRequest {
  return {
    instruction: projection.instruction,
    turns: projection.messages.flatMap(message =>
      message.message === null
        ? []
        : [
            {
              message: message.message,
              role: message.role,
              blocks: message.blocks,
              replay: message.replay,
            },
          ],
    ),
    tools: projection.declared,
    toolChoice: projection.choice,
    applied,
  }
}

type RepresentInput = Readonly<{
  projection: Projection
  applied: readonly Parameter[]
  representation: Adoption
  media: MediaView
}>
function shown(context: RequestContext, input: RepresentInput) {
  const params = gatewayParams(context, input.applied)
  if (!('ok' in params)) return params
  const body = bodyOf(context, input.projection, params.ok, nativeParsing(input.media))
  if (!('ok' in body)) return body
  const { representation, media } = input
  const view = viewOf(input.projection, input.applied)
  return { ok: { body: body.ok, view, representation, media } }
}

export function planRequest(
  context: RequestContext,
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
    bindingEfforts: context.bindingEfforts,
    reasoningEfforts: profile.definition.reasoningEfforts,
    outputLimit: profile.definition.context.output.provided,
    requested: assembled.parameters,
    supplier: context.adapter,
    source: assembled.source,
  })
  if (!('ok' in planned)) return planned
  const projection = project({
    ...context,
    system: assembled.system,
    messages: assembled.messages,
    tools: assembled.tools,
    toolChoice: assembled.toolChoice,
    declaration: declaration.ok,
    replayOff: assembled.replay === 'off',
    resent: new Set(),
    media,
  })
  if (!('ok' in projection)) return projection
  const parameters = planned.ok
  const applied = parameters.map(adoption => adoption.applied)
  const checked = context.hooks.check({
    applied,
    messages: assembled.messages,
    treatments: projection.ok.treatments,
  })
  if (!('ok' in checked)) return checked
  const request = shown(context, {
    projection: projection.ok,
    applied,
    representation: assembled.representation,
    media,
  })
  if (!('ok' in request)) return request
  const encoded = represented(context, request.ok)
  if (!('ok' in encoded)) return encoded
  return { ok: { parameters, representation: encoded.ok.representation } }
}

export function encodeRequest(
  context: RequestContext,
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
  const projection = project({
    ...context,
    system: request.system,
    messages: request.messages,
    tools: request.tools,
    toolChoice: request.toolChoice,
    declaration: input.declaration,
    replayOff: request.replay === 'off',
    resent: new Set(input.resent),
    media,
  })
  if (!('ok' in projection)) return projection
  const applied = appliedFor(context, request)
  const checked = context.hooks.check({
    applied,
    messages: request.messages,
    treatments: projection.ok.treatments,
  })
  if (!('ok' in checked)) return checked
  const sent = shown(context, {
    projection: projection.ok,
    applied,
    representation: request.representation,
    media,
  })
  if (!('ok' in sent)) return sent
  const encoded = materialize(context, sent.ok)
  if (!('ok' in encoded)) return encoded
  return {
    ok: {
      ...encoded.ok,
      diagnostics: diagnosticsOf(projection.ok),
      replayPrefix: projection.ok.replayPrefix,
      replayCarried: carriesReplay(projection.ok.treatments),
    },
  }
}
