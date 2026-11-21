import type { MediaView } from './media.ts'
import type { JsonValue } from '@omne-harness/json-text'
import type {
  Adoption,
  FixedModelRequest,
  MeterRepresentation,
  ModelProfile,
  Parameter,
  ReplayDeclaration,
  Supplier,
  TransportFailure,
} from '@omne-harness/model-contract'
import { judgeReplayDeclaration, type ReplayTreatment } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import { wireParameter } from './chat-completions/parameters.ts'
import type {
  ChatCompletionsRecord,
  FamilyMeter,
  GatewayParam,
  ProjectedRequest,
} from './chat-completions/vocabulary.ts'
import { serializeBody } from './payload.ts'

// What every engine does around its own body: which binding a request is for, which parameters
// it applies, and the representation the meter makes of the request.

export type Materialized = Extract<MeterRepresentation, { kind: 'materialized' }>

export function carriesReplay(treatments: readonly ReplayTreatment[]): boolean {
  return treatments.some(treatment => treatment.continuable && treatment.carry.length > 0)
}

export type EngineBinding = Readonly<{
  record: Pick<ChatCompletionsRecord, 'parameters' | 'extensions'>
  meter: FamilyMeter
  supplier: Supplier
  adapter: Adoption
}>

export function sameAdoption(left: Adoption, right: Adoption): boolean {
  return (
    left.owner === right.owner &&
    left.name === right.name &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

/** The replay declaration of this binding's entry in the profile, or why there is none. */
export function profileDeclaration(
  binding: EngineBinding,
  profile: ModelProfile,
  supplier: Supplier,
): Outcome<ReplayDeclaration, TransportFailure> {
  if (
    !sameAdoption(supplier.adoption, binding.adapter) ||
    supplier.provider !== binding.supplier.provider ||
    supplier.model !== binding.supplier.model
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

/** The parameters a fixed request applies through this binding. */
export function appliedFor(
  binding: EngineBinding,
  request: FixedModelRequest,
): readonly Parameter[] {
  return request.parameterAdoptions
    .filter(adoption => sameAdoption(adoption.supplier, binding.adapter))
    .map(adoption => adoption.applied)
}

/** The wire parameters of the applied parameters; a field written twice is refused. */
export function wiredParams(
  binding: EngineBinding,
  applied: readonly Parameter[],
): Outcome<readonly GatewayParam[], TransportFailure> {
  const params: GatewayParam[] = []
  for (const param of applied) {
    const wired = wireParameter(param, {
      record: binding.record,
      adapter: binding.adapter,
      outputLimit: null,
    })
    if (!('ok' in wired)) return wired
    if (params.some(item => item.field === wired.ok.field))
      return { failure: { kind: 'invalid', field: 'parameterAdoptions', reason: 'repeated' } }
    params.push(wired.ok)
  }
  return { ok: params }
}

type Represented<R> = Outcome<Readonly<{ body: JsonValue; representation: R }>, TransportFailure>
type RepresentInput = Readonly<{
  body: JsonValue
  view: ProjectedRequest
  representation: Adoption
  media: MediaView
}>

/** The body with the representation the meter makes of the same request; pending while media are unread. */
export function represented(
  binding: EngineBinding,
  input: RepresentInput,
): Represented<MeterRepresentation> {
  const shown = binding.meter.represent(input.view)
  if (!sameAdoption(shown.adoption, input.representation))
    return { failure: { kind: 'unsupported', field: 'representation', adapter: binding.adapter } }
  const { adoption, tokenInput, units } = shown
  const common = { adoption, tokenInput, units, media: [...input.media.facts] }
  const [first, ...rest] = input.media.pending
  const representation: MeterRepresentation =
    first === undefined
      ? {
          ...common,
          kind: 'materialized',
          requestBytes: String(serializeBody(input.body).byteLength),
        }
      : { ...common, kind: 'pending-media', references: [first, ...rest] }
  return { ok: { body: input.body, representation } }
}

export function materialize(
  binding: EngineBinding,
  input: RepresentInput,
): Represented<Materialized> {
  const outcome = represented(binding, input)
  if (!('ok' in outcome)) return outcome
  const { body, representation } = outcome.ok
  if (representation.kind === 'materialized') return { ok: { body, representation } }
  return { failure: { kind: 'unsupported', field: 'media', adapter: binding.adapter } }
}
