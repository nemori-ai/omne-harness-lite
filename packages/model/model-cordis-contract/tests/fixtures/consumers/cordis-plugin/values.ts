import { encodeModelInvocationRef } from '@omne-harness/model-contract'
// The values that the paths of this fixture send and read. Every identity comes from a decoder of
// a public package, so no value is made by an assertion.
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
  type ResultCapacity,
  type Revision,
  type Supplier,
} from '@omne-harness/model-contract'
import { createScriptedModelProvider } from '@omne-harness/model-contract/testing'
import type { Outcome } from '@omne-harness/operation-result'

/** The party that the plugin acts for, named by the assembly in the plugin configuration. */
export type Principal = Readonly<{ name: string }>

export const follower: Principal = { name: 'follower' }

/** The principal that admits the calls and reads them for the test, apart from the plugin's own. */
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
  recipient: 'recipient',
  model: 'model',
  credential: { kind: 'factory' },
}

/** The request that the owner fixed before the call was admitted; the plugin never reads it. */
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

const capacity: ResultCapacity = { bytes: '1000', blocks: '10', attachmentBytes: '0' }

/** The operation under which the call `name` is admitted; the plugin looks the call up by it. */
export const admissionOf = (name: string): ModelOperationId => operation(`admit-${name}`)

export const admission = (name: string): Admit<Principal> => ({
  principal: reader,
  tenant: tenantA,
  call: call(name),
  operation: admissionOf(name),
  request,
  consumer,
  capacity,
})

/**
 * The scripted provider that stands for whatever serves the calls. The principals are the same
 * one when their names are, because Cordis hands the plugin its configuration, not the object
 * that the test built.
 */
export function newProvider() {
  const scripted = createScriptedModelProvider<Principal>({
    instance: instance('one'),
    samePrincipal: (left, right) => left.name === right.name,
  })
  const { runtime } = scripted.provider
  /** The state that the provider holds for the call, read under the principal of the test. */
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
    /** Admits the call `name` and returns the revision of the admission. */
    async admit(name: string): Promise<Revision> {
      return must(await runtime.calls.admit(admission(name))).revision
    },
    /** The call shows a new block list, which commits one more revision; returns that revision. */
    async change(name: string): Promise<Revision> {
      scripted.controller.emit({ tenant: tenantA, call: call(name), blocks: [] })
      return (await state(name)).revision
    },
  }
}

/** This installed consumer uses only the package codec for ordinary locators. */
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
/** A raw reserved locator is used only for an intentionally invalid boundary request. */
export function reservedReference(parts: Parameters<typeof encodeModelInvocationRef>[0]): string {
  const tenant = tenantCodec.encode(parts.tenant)
  if (!tenant.ok) throw new Error('fixture tenant')
  return JSON.stringify(['model-invocation', 1, tenant.value, parts.call, parts.admission])
}
