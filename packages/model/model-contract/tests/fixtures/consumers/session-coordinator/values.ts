// The values that the paths of this fixture send and read. Every identity comes from a decoder of
// a public package, so no value is made by an assertion.
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  type Admit,
  type Adoption,
  type CallState,
  type ConsumerRef,
  type FixedModelRequest,
  type ModelCallId,
  type ModelCalls,
  type ModelInstanceId,
  type ModelOperationId,
  type ResultCapacity,
  type Supplier,
} from '@omne-harness/model-contract'
import { createScriptedModelProvider } from '@omne-harness/model-contract/testing'
import type { Outcome } from '@omne-harness/operation-result'

/** The party that coordinates: it is not the owner of the calls and acts under its own identity. */
export type Principal = Readonly<{ name: string }>

export const coordinator: Principal = { name: 'coordinator' }

export function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function must<T>(outcome: Outcome<T, unknown>): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`expected success, got ${JSON.stringify(outcome.failure)}`)
}

export function failureOf<F>(outcome: Outcome<unknown, F>): F {
  if ('failure' in outcome) return outcome.failure
  throw new Error(`expected a failure, got ${JSON.stringify(outcome.ok)}`)
}

function tenantOf(account: string, organization: string): TenantId {
  const parsedAccount = accountCodec.parse(account)
  const parsedOrganization = organizationCodec.parse(organization)
  if (!parsedAccount.ok || !parsedOrganization.ok) throw new Error('the fixture tenant is invalid')
  return tenant(parsedOrganization.value, parsedAccount.value)
}

export const tenantA = tenantOf('acc_abcdefghjkmnpqrstvwxyz2345', 'org_abcdefghjkmnpqrstvwxyz2345')
export const tenantB = tenantOf('acc_abcdefghjkmnpqrstvwxyz2346', 'org_abcdefghjkmnpqrstvwxyz2346')

export const call = (name: string): ModelCallId => must(decodeModelCallId(`mcall_${name}`))
export const operation = (name: string): ModelOperationId =>
  must(decodeModelOperationId(`mop_${name}`))
export const instance = (name: string): ModelInstanceId =>
  must(decodeModelInstanceId(`minst_${name}`))

const adoption = (name: string): Adoption => ({
  owner: 'fixture',
  name,
  revision: '1',
  digest: `digest-${name}`,
})

const supplier: Supplier = {
  adoption: adoption('supplier'),
  recipient: 'recipient',
  model: 'model',
  credential: { kind: 'factory' },
}

/** The request that the owner fixed before the call was admitted; the coordinator does not read it. */
const request: FixedModelRequest = {
  profile: adoption('profile'),
  suppliers: [supplier],
  fallback: false,
  retryPolicy: adoption('retry'),
  parameters: [],
  system: [],
  messages: [],
  tools: [],
  toolChoice: 'none',
  representation: adoption('representation'),
  parameterAdoptions: [],
  source: adoption('source'),
}

const consumer: ConsumerRef = {
  owner: 'fixture',
  work: 'work-1',
  position: 'position-1',
  purpose: 'purpose',
}

const capacity: ResultCapacity = { bytes: '1000', blocks: '10', attachmentBytes: '0' }

/** The explicit identity of one request: who asks, for which tenant, about which call. */
export const access = (name: string, tenantId: TenantId = tenantA) => ({
  principal: coordinator,
  tenant: tenantId,
  call: call(name),
})

export const callRef = (name: string) => ({ tenant: tenantA, call: call(name) })

export const admission = (name: string): Admit<Principal> => ({
  ...access(name),
  operation: operation(`admit-${name}`),
  request,
  consumer,
  capacity,
})

/** One admission that the coordinator sent: for which call and operation, and whether it was accepted. */
export type SentAdmission = Readonly<{
  call: ModelCallId
  operation: ModelOperationId
  accepted: boolean
}>

/**
 * The scripted provider that stands for whatever serves the calls, with the helpers that read it.
 * Every admission leaves through `calls.admit` and is recorded, so `admissions()` lists all the
 * calls that the coordinator ever tried to bring into the tenant; a call appears nowhere else.
 */
export function newWorld() {
  const scripted = createScriptedModelProvider<Principal>({ instance: instance('one') })
  const { calls: provided, instances } = scripted.provider.runtime
  const sent: SentAdmission[] = []
  const calls: ModelCalls<Principal> = {
    async admit(input) {
      const reply = await provided.admit(input)
      sent.push({ call: input.call, operation: input.operation, accepted: 'ok' in reply })
      return reply
    },
    inspect: input => provided.inspect(input),
    dispatches: input => provided.dispatches(input),
    cancel: input => provided.cancel(input),
  }
  return {
    calls,
    instances,
    controller: scripted.controller,
    /** The admissions that the coordinator sent so far, in order. */
    admissions: (): readonly SentAdmission[] => sent,
    /** Admits the call `name` under the operation `admit-<name>`. */
    admit: async (name: string) => must(await calls.admit(admission(name))),
    /** The state of the call, looked up through its own admission operation. */
    async state(name: string): Promise<CallState> {
      const found = must(
        await calls.inspect({ ...access(name), admission: operation(`admit-${name}`) }),
      )
      expect(found.kind === 'found', `the provider does not know the call ${name}`)
      return found.state
    },
  }
}
