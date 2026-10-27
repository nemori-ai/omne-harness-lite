// Derived from pi 1.0.0, commit a13d35a742c6ef8462812a28fbe1d8c8b7431c32 (buildParams; the source
// file is named in provenance.json). Copyright (c) 2025 Mario Zechner. MIT: ../../LICENSE.pi.
// See provenance.json.
//
// Request planning and encoding of the gateway engine. Plan and encode share one projection and
// one body writer, so the representation of the plan is the one that encode produces.
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

/** What plan and encode of one binding share. */
export type RequestContext = Readonly<{
  record: ChatCompletionsRecord
  hooks: VendorHooks
  meter: FamilyMeter
  supplier: Supplier
  /** The adoption of the record, equal to `supplier.adoption`. */
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

/**
 * Checks that the profile names this supplier, and gives its replay declaration with every
 * default applied: the declaration that the request of this profile fixes for the supplier.
 */
function profileDeclaration(
  context: RequestContext,
  profile: ModelProfile,
  supplier: Supplier,
): Outcome<ReplayDeclaration, TransportFailure> {
  if (
    !sameAdoption(supplier.adoption, context.adapter) ||
    supplier.recipient !== context.supplier.recipient ||
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

/** The diagnostics of one encoding: a `replay-omitted` for each message whose reasoning state parts stay out. */
function diagnosticsOf(projection: Projection): readonly ProviderDiagnostic[] {
  return projection.diagnostics.map(item => ({
    kind: 'replay-omitted',
    message: item.message,
    scope: item.scope,
    format: item.format,
    omittedParts: item.omittedParts,
  }))
}

/**
 * The gateway parameters of the applied values, then the fixed values of the record. Two applied
 * values for one gateway field are `invalid` (`parameterAdoptions`, `repeated`): a request whose
 * suppliers share one adoption, for example a factory and a tenant credential, gives this binding
 * the planned parameters of each, and the body can hold only one.
 */
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

/** The request body. Sorted keys; never a URL, a header or a credential. */
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

/** The projection as the meter reads it. */
function viewOf(
  projection: Projection,
  request: Readonly<{
    tools: ProjectedRequest['tools']
    toolChoice: ProjectedRequest['toolChoice']
  }>,
  applied: readonly Parameter[],
): ProjectedRequest {
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
    tools: request.tools,
    toolChoice: request.toolChoice,
    applied,
  }
}

/** Builds the body and its representation, and checks the representation adoption. */
function represent(
  context: RequestContext,
  input: Readonly<{
    projection: Projection
    applied: readonly Parameter[]
    tools: ProjectedRequest['tools']
    toolChoice: ProjectedRequest['toolChoice']
    representation: Adoption
  }>,
): Outcome<Readonly<{ body: JsonValue; representation: Materialized }>, TransportFailure> {
  const params = gatewayParams(context, input.applied)
  if (!('ok' in params)) return params
  const body = bodyOf(context, input.projection, params.ok)
  if (!('ok' in body)) return body
  const shown = context.meter.represent(viewOf(input.projection, input, input.applied))
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

/**
 * `rules.plan`: the supplier and its replay declaration, parameter planning, the projection,
 * the family check and the representation, in this order. The projection uses the declaration of
 * the profile, which the request of this profile fixes, and no re-dispatch.
 */
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
    tools: assembled.tools,
    toolChoice: assembled.toolChoice,
    representation: assembled.representation,
  })
  if (!('ok' in encoded)) return encoded
  return { ok: { parameters, representation: encoded.ok.representation } }
}

/**
 * `encode`: the same projection over the fixed request, with the declaration that the request
 * fixes for this supplier and the messages that this dispatch leaves out, the planned parameters
 * of this supplier, then the body, its representation and the diagnostics of the encoding. Media
 * references are refused: inline media only.
 */
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
    tools: request.tools,
    toolChoice: request.toolChoice,
    representation: request.representation,
  })
  if (!('ok' in encoded)) return encoded
  return { ok: { ...encoded.ok, diagnostics: diagnosticsOf(projection.ok) } }
}
