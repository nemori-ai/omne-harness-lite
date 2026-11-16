import { decodeProviderName, encodeModelInvocationRef } from '@omne-harness/model-contract'
import {
  tenantCodec,
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
  type ModelInstanceId,
  type ModelOperationId,
  type Revision,
  type Supplier,
} from '@omne-harness/model-contract'
import { createScriptedModelProvider } from '@omne-harness/model-contract/testing'
import type { Outcome } from '@omne-harness/operation-result'

export type Principal = Readonly<{ name: string }>

export const follower: Principal = { name: 'follower' }

const reader: Principal = { name: 'reader' }

export function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function must<T>(outcome: Outcome<T, unknown>): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`expected success, got ${JSON.stringify(outcome.failure)}`)
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
const instance = (name: string): ModelInstanceId => must(decodeModelInstanceId(`minst_${name}`))

const adoption = (name: string): Adoption => ({
  owner: 'fixture',
  name,
  revision: '1',
  digest: '0'.repeat(64),
})

const supplier: Supplier = {
  adoption: adoption('supplier'),
  provider: must(decodeProviderName('recipient')),
  model: 'model',
  credential: { layer: 'official' },
}

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
  declarations: [
    { produces: 'recipient/model', accepts: ['recipient/model'], foreignThinking: 'omit' },
  ],
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

export const admissionOf = (name: string): ModelOperationId => operation(`admit-${name}`)

export const admission = (name: string): Admit<Principal> => ({
  principal: reader,
  tenant: tenantA,
  call: call(name),
  operation: admissionOf(name),
  request,
  consumer,
})

export function newProvider() {
  const scripted = createScriptedModelProvider<Principal>({
    instance: instance('one'),
    samePrincipal: (left, right) => left.name === right.name,
  })
  const { runtime } = scripted.provider
  async function state(name: string): Promise<CallState> {
    const found = must(
      await runtime.calls.inspect({
        principal: reader,
        tenant: tenantA,
        reference: invocationReference({
          principal: reader,
          tenant: tenantA,
          call: call(name),
          admission: admissionOf(name),
        }),
      }),
    )
    expect(found.kind === 'found', `the provider does not know the call ${name}`)
    return found.state
  }
  return {
    runtime,
    controller: scripted.controller,
    state,
    async admit(name: string): Promise<Revision> {
      return must(await runtime.calls.admit(admission(name))).revision
    },
    async change(name: string): Promise<Revision> {
      scripted.controller.emit({ tenant: tenantA, call: call(name), blocks: [] })
      return (await state(name)).revision
    },
  }
}

export function invocationReference<T extends Parameters<typeof encodeModelInvocationRef>[0]>(
  parts: T,
) {
  return must(
    encodeModelInvocationRef({
      tenant: parts.tenant,
      call: parts.call,
      admission: parts.admission,
    }),
  )
}
export function reservedReference(parts: Parameters<typeof encodeModelInvocationRef>[0]): string {
  if (!tenantCodec.encode(parts.tenant).ok) throw new Error('fixture tenant')
  return JSON.stringify(['model-invocation', 2, parts.call, parts.admission])
}
