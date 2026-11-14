// Derived from pi 1.0.0, commit a13d35a742c6ef8462812a28fbe1d8c8b7431c32 (buildParams; the source
// file is named in provenance.json). Copyright (c) 2025 Mario Zechner. MIT: ../../LICENSE.pi.
// See provenance.json.
import type { JsonValue } from '@omne-harness/json-text'
import {
  type Adoption,
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
import {
  judgeReplayDeclaration,
  type ProviderDiagnostic,
  type TransportDispatch,
} from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { PiMaterializedMedia } from '../family.ts'
import { serializeBody } from '../payload.ts'
import { gatewayMembers } from './gateway.ts'
import { bool, list, object, text } from './json.ts'
import { planParameters, wireParameter } from './parameters.ts'
import { cacheTarget, messagesJson, project, type Projection } from './projection.ts'
import type {
  ChatCompletionsRecord,
  FamilyMeter,
  GatewayParam,
  ProjectedRequest,
  VendorHooks,
} from './vocabulary.ts'

export type RequestContext = Readonly<{
  record: ChatCompletionsRecord
  hooks: VendorHooks
  meter: FamilyMeter
  supplier: Supplier
  adapter: Adoption
}>

type Materialized = Extract<MeterRepresentation, { kind: 'materialized' }>

function sameAdoption(left: Adoption, right: Adoption): boolean {
  return (
    left.owner === right.owner &&
    left.name === right.name &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

function profileDeclaration(
  context: RequestContext,
  profile: ModelProfile,
  supplier: Supplier,
): Outcome<ReplayDeclaration, TransportFailure> {
  if (
    !sameAdoption(supplier.adoption, context.adapter) ||
    supplier.provider !== context.supplier.provider ||
    supplier.model !== context.supplier.model
  )
    return { failure: { kind: 'invalid', field: 'supplier', reason: 'not-this-binding' } }
  const index = profile.definition.suppliers.findIndex(item =>
    sameAdoption(item.adoption, supplier.adoption),
  )
  const entry = profile.definition.suppliers[index]
  if (entry === undefined)
    return { failure: { kind: 'invalid', field: 'supplier', reason: 'not-in-profile' } }
  const declared = judgeReplayDeclaration(entry, index)
  return 'ok' in declared ? declared : { failure: declared.failure }
}

function diagnosticsOf(projection: Projection): readonly ProviderDiagnostic[] {
  return projection.diagnostics.map(item => ({
    kind: 'replay-omitted',
    message: item.message,
    scope: item.scope,
    format: item.format,
    omittedParts: item.omittedParts,
  }))
}

function gatewayParams(
  context: RequestContext,
  applied: readonly Parameter[],
): Outcome<readonly GatewayParam[], TransportFailure> {
  const params: GatewayParam[] = []
  const fields = new Set<GatewayParam['field']>()
  for (const param of applied) {
    const wired = wireParameter(param, {
      record: context.record,
      adapter: context.adapter,
      outputLimit: null,
    })
    if (!('ok' in wired)) return wired
    if (fields.has(wired.ok.field))
      return { failure: { kind: 'invalid', field: 'parameterAdoptions', reason: 'repeated' } }
    fields.add(wired.ok.field)
    params.push(wired.ok)
  }
  params.push(...context.record.wire.fixed)
  return { ok: params }
}

function bodyOf(
  context: RequestContext,
  projection: Projection,
  params: readonly GatewayParam[],
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

function represent(
  context: RequestContext,
  input: Readonly<{
    projection: Projection
    applied: readonly Parameter[]
    representation: Adoption
  }>,
): Outcome<Readonly<{ body: JsonValue; representation: Materialized }>, TransportFailure> {
  const params = gatewayParams(context, input.applied)
  if (!('ok' in params)) return params
  const body = bodyOf(context, input.projection, params.ok)
  if (!('ok' in body)) return body
  const shown = context.meter.represent(viewOf(input.projection, input.applied))
  if (!sameAdoption(shown.adoption, input.representation))
    return { failure: { kind: 'unsupported', field: 'representation', adapter: context.adapter } }
  return {
    ok: {
      body: body.ok,
      representation: {
        kind: 'materialized',
        adoption: shown.adoption,
        tokenInput: shown.tokenInput,
        units: shown.units,
        media: [],
        requestBytes: String(serializeBody(body.ok).byteLength),
      },
    },
  }
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
  const planned = planParameters({
    record: context.record,
    adapter: context.adapter,
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
  const encoded = represent(context, {
    projection: projection.ok,
    applied,
    representation: assembled.representation,
  })
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
  }>,
  TransportFailure
> {
  const { request } = input
  if (input.media.length > 0)
    return { failure: { kind: 'unsupported', field: 'media', adapter: context.adapter } }
  const projection = project({
    ...context,
    system: request.system,
    messages: request.messages,
    tools: request.tools,
    toolChoice: request.toolChoice,
    declaration: input.declaration,
    replayOff: request.replay === 'off',
    resent: new Set(input.resent),
  })
  if (!('ok' in projection)) return projection
  const applied = request.parameterAdoptions
    .filter(adoption => sameAdoption(adoption.supplier, context.adapter))
    .map(adoption => adoption.applied)
  const checked = context.hooks.check({
    applied,
    messages: request.messages,
    treatments: projection.ok.treatments,
  })
  if (!('ok' in checked)) return checked
  const encoded = represent(context, {
    projection: projection.ok,
    applied,
    representation: request.representation,
  })
  if (!('ok' in encoded)) return encoded
  return { ok: { ...encoded.ok, diagnostics: diagnosticsOf(projection.ok) } }
}
