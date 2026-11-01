import { expectTypeOf, it } from 'vitest'
import type { Access } from '@omne-harness/legal-identity'
import type { ModalityRequirement, ProfileResolution } from '@omne-harness/model-contract'
import type { ModelChoices, ModelProfiles } from '@omne-harness/model-contract/provider'
import {
  createScriptedModelProfiles,
  type ScriptedModelProfileCall,
  type ScriptedModelProfiles,
} from '@omne-harness/model-contract/testing'
import { evidence, tenant } from './values.ts'

class Agent {
  readonly name = 'agent'
  greet(): string {
    return this.name
  }
}
type Other = Readonly<{ id: number }>

const access: Access<Agent> = { tenant, principal: new Agent() }
const required: ModalityRequirement = { modalities: ['text', 'video'], source: evidence }
const absent: ProfileResolution = { kind: 'absent', reason: 'unknown-name' }

it('the profile double offers the business port of its own principal and keeps the controls apart', () => {
  const scripted: ScriptedModelProfiles<Agent> = createScriptedModelProfiles<Agent>()
  expectTypeOf(scripted.profiles).toEqualTypeOf<ModelProfiles<Agent>>()
  expectTypeOf(scripted.profiles).toExtend<ModelProfiles<Agent>>()
  // @ts-expect-error a double of one principal is not the port of another principal
  const other: ModelProfiles<Other> = scripted.profiles
  // @ts-expect-error the business port carries no control
  scripted.profiles.setAccess(access, 'allow')
  // @ts-expect-error the business port carries no control
  const setResolution = scripted.profiles.setResolution
  // @ts-expect-error the business port carries no control
  scripted.profiles.calls()
  void [other, setResolution]
})

it('the controls take the inputs and replies of the port, a requirement with video included', () => {
  const scripted = createScriptedModelProfiles<Agent>()
  scripted.setAccess(access, 'allow')
  scripted.setAccess(access, 'unavailable')
  // @ts-expect-error a decision outside allow, deny and unavailable
  scripted.setAccess(access, 'maybe')
  scripted.setResolution({ ...access, route: 'default', required }, { ok: absent })
  scripted.setResolution(
    { ...access, route: 'down', required },
    { failure: { kind: 'unavailable', dependency: 'source', diagnostic: 'down' } },
  )
  scripted.setResolution(
    { ...access, route: 'x', required },
    // @ts-expect-error an absent reason outside the three
    { ok: { kind: 'absent', reason: 'gone' } },
  )
  // @ts-expect-error a resolution needs its requirement
  scripted.setResolution({ ...access, route: 'default' }, { ok: absent })
  // @ts-expect-error the principal of another type
  scripted.setResolution({ tenant, principal: { id: 1 }, route: 'r', required }, { ok: absent })
  const choices: ModelChoices = { choices: [], selected: null, source: evidence }
  scripted.setList({ ...access, selected: null, required }, { ok: choices })
  // @ts-expect-error a list needs its selection, even when it is null
  scripted.setList({ ...access, required }, { ok: choices })
})

it('a recorded call says which method it was and carries that method input', () => {
  const calls: readonly ScriptedModelProfileCall<Agent>[] =
    createScriptedModelProfiles<Agent>().calls()
  const call = calls[0]
  if (call === undefined) return
  expectTypeOf(call.sequence).toEqualTypeOf<number>()
  expectTypeOf(call.input.principal).toEqualTypeOf<Agent>()
  if (call.kind === 'list') expectTypeOf(call.input.selected).toEqualTypeOf<string | null>()
  else expectTypeOf(call.input.route).toEqualTypeOf<string>()
  // @ts-expect-error the route belongs to resolve only
  void call.input.route
  // @ts-expect-error the recorded calls cannot be changed
  calls.push(call)
})
