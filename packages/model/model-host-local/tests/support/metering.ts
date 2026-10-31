// Test support: metering a request with a real preparation lease, and reading the known numbers of
// a call's account. The representation comes from the lease's own `rules.plan`, never from a hand
// written shape.
import type {
  AssembledModelInput,
  FixedModelRequest,
  ModelInputMeter,
  ModelPreparationLease,
  ModelProfile,
  RequestBudget,
} from '@omne-harness/model-contract'
import { decoded } from './local-host.ts'

export function assembledOf(request: FixedModelRequest): AssembledModelInput {
  return {
    system: request.system,
    messages: request.messages,
    tools: request.tools,
    toolChoice: request.toolChoice,
    parameters: request.parameters,
    representation: request.representation,
    source: request.source,
  }
}

/** Plans the request with the lease's rules and measures it with the lease's meter. */
export function measureOn(
  lease: ModelPreparationLease,
  profile: ModelProfile,
  request: FixedModelRequest,
): ReturnType<ModelInputMeter['measure']> {
  const [binding] = lease.bindings
  const assembled = assembledOf(request)
  const planned = decoded(binding.rules.plan({ profile, supplier: binding.supplier, assembled }))
  return binding.meter.measure({
    profile: profile.adoption,
    supplier: profile.definition.suppliers[0],
    context: profile.definition.context,
    limits: profile.definition.limits,
    assembled,
    parameters: planned.parameters,
    representation: planned.representation,
  })
}

/** The estimate that the budget holds for the input tokens. Throws when it is another kind. */
export function inputEstimate(budget: RequestBudget) {
  const check = budget.checks.find(item => item.metric === 'input-tokens')
  if (check?.measurement.kind !== 'estimate') throw new Error('no estimated input check')
  return check.measurement
}

/** The known amount of the named usage entry of an account. Throws when it is not known. */
export function known(account: { usage: readonly unknown[] } | null, name: string): bigint {
  const item = account?.usage.find(entry => Reflect.get(Object(entry), 'name') === name)
  const lexeme: unknown = Reflect.get(Object(item), 'lexeme')
  if (Reflect.get(Object(item), 'state') !== 'known' || typeof lexeme !== 'string')
    throw new Error(`usage ${name} is not known`)
  return BigInt(lexeme)
}
