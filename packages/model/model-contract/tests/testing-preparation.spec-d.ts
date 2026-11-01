import { expectTypeOf, it } from 'vitest'
import type { Access } from '@omne-harness/legal-identity'
import type {
  DurableEvidence,
  ModalityRequirement,
  ModelProfile,
  Reply,
} from '@omne-harness/model-contract'
import type { ModelRequestPreparation, ModelTransport } from '@omne-harness/model-contract/provider'
import {
  createScriptedModelRequestPreparation,
  type ScriptedModelPreparationCall,
  type ScriptedModelPreparationMatch,
  type ScriptedModelPreparationPlan,
  type ScriptedModelRequestPreparation,
  type ScriptedModelRequestPreparationOptions,
} from '@omne-harness/model-contract/testing'
import {
  adoption,
  credential,
  evidence,
  parameterAdoption,
  profileSupplier,
  supplier,
  tenant,
} from './values.ts'

class Agent {
  readonly name = 'agent'
  greet(): string {
    return this.name
  }
}
type Other = Readonly<{ id: number }>

declare const transport: ModelTransport
declare const profile: ModelProfile

/**
 * The shape of the Agent request preparation port. This package does not depend on the Agent
 * contract, so the probe states the port by its shape: other inputs, other replies, more methods.
 */
interface AgentRequestPreparation<P> {
  prepare(
    input: Access<P> & Readonly<{ action: string; history: DurableEvidence }>,
  ): Reply<Readonly<{ kind: 'ready' }>>
  derive(input: Access<P> & Readonly<{ action: string }>): Reply<Readonly<{ kind: 'derived' }>>
  resume(
    input: Access<P> & Readonly<{ transition: DurableEvidence }>,
  ): Reply<Readonly<{ kind: 'ready' }>>
}
declare const agentPort: AgentRequestPreparation<Agent>

const access: Access<Agent> = { tenant, principal: new Agent() }
const required: ModalityRequirement = { modalities: ['text', 'video'], source: evidence }

it('the preparation double takes only a transport and offers the Model port of its principal', () => {
  const options: ScriptedModelRequestPreparationOptions = { transport }
  const scripted: ScriptedModelRequestPreparation<Agent> =
    createScriptedModelRequestPreparation<Agent>(options)
  expectTypeOf(scripted.preparation).toEqualTypeOf<ModelRequestPreparation<Agent>>()
  // @ts-expect-error a double of one principal is not the port of another principal
  const other: ModelRequestPreparation<Other> = scripted.preparation
  // @ts-expect-error the Agent port is not the Model port
  const fromAgent: ModelRequestPreparation<Agent> = agentPort
  // @ts-expect-error the Model port is not the Agent port
  const toAgent: AgentRequestPreparation<Agent> = scripted.preparation
  // @ts-expect-error the double has no meter
  createScriptedModelRequestPreparation<Agent>({ transport, meter: null })
  // @ts-expect-error the double holds no secret
  createScriptedModelRequestPreparation<Agent>({ transport, secret: 'key' })
  // @ts-expect-error the principal comes with each call, never with the double
  createScriptedModelRequestPreparation<Agent>({ transport, principal: new Agent() })
  // @ts-expect-error the transport is required
  createScriptedModelRequestPreparation<Agent>({})
  // @ts-expect-error the business port carries no control
  const setPlan = scripted.preparation.setPlan
  // @ts-expect-error the business port carries no control
  scripted.preparation.setAccess(access, 'allow')
  // @ts-expect-error the business port carries no control
  scripted.preparation.calls()
  void [other, fromAgent, toAgent, setPlan]
})

it('a plan binds suppliers with tenant credentials and adopted parameters, matched with video', () => {
  const scripted = createScriptedModelRequestPreparation<Agent>({ transport })
  const match: ScriptedModelPreparationMatch<Agent> = {
    ...access,
    profile,
    required,
    parameters: [{ kind: 'temperature', value: 0.2 }],
  }
  const plan: ScriptedModelPreparationPlan = {
    suppliers: [{ ...supplier, credential: { kind: 'tenant', id: credential } }],
    parameterAdoptions: [parameterAdoption],
  }
  scripted.setAccess(access, 'deny')
  scripted.setPlan(match, { ok: plan })
  scripted.setPlan(match, { failure: { kind: 'invalid', field: 'credential', reason: 'missing' } })
  // @ts-expect-error a decision outside allow, deny and unavailable
  scripted.setAccess(access, 'maybe')
  // @ts-expect-error a plan binds at least one supplier
  const empty: ScriptedModelPreparationPlan = { suppliers: [], parameterAdoptions: [] }
  const bare: ScriptedModelPreparationPlan = {
    // @ts-expect-error a planned supplier needs its credential
    suppliers: [profileSupplier],
    parameterAdoptions: [],
  }
  const badCredential: ScriptedModelPreparationPlan = {
    // @ts-expect-error a credential is a tenant binding or the factory
    suppliers: [{ ...supplier, credential: { kind: 'organization' } }],
    parameterAdoptions: [],
  }
  const { required: _required, ...withoutRequired } = match
  // @ts-expect-error a match needs the requirement
  const noRequired: ScriptedModelPreparationMatch<Agent> = withoutRequired
  // @ts-expect-error a match of another principal
  scripted.setPlan({ ...match, principal: { id: 1 } }, { ok: plan })
  // @ts-expect-error a failure reply is a model failure
  scripted.setPlan(match, { failure: { kind: 'lost' } })
  void [empty, bare, badCredential, noRequired, adoption]
})

it('a recorded call holds the input of the port and cannot be changed', () => {
  const calls: readonly ScriptedModelPreparationCall<Agent>[] =
    createScriptedModelRequestPreparation<Agent>({ transport }).calls()
  const call = calls[0]
  if (call === undefined) return
  expectTypeOf(call.sequence).toEqualTypeOf<number>()
  expectTypeOf(call.input).toEqualTypeOf<Parameters<ModelRequestPreparation<Agent>['prepare']>[0]>()
  expectTypeOf(call.input.principal).toEqualTypeOf<Agent>()
  // @ts-expect-error the recorded calls cannot be changed
  calls.push(call)
})
