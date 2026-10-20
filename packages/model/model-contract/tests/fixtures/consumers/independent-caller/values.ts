import { encodeModelInvocationRef } from '@omne-harness/model-contract'
// The values that the paths of this fixture send and read. Every identity comes from a decoder of
// a public package, and every block from the content-block judge, so no value is made by an assertion.
import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  decodeResultVersion,
  type Admit,
  type Adoption,
  type CallState,
  type ConsumerRef,
  type DispatchId,
  type DispatchRecord,
  type DurableEvidence,
  type FixedModelRequest,
  type ResultPart,
  type ModelCallId,
  type ModelCalls,
  type ModelOperationId,
  type ResultCapacity,
  type ResultVersion,
  type Supplier,
} from '@omne-harness/model-contract'
import { createScriptedModelProvider } from '@omne-harness/model-contract/testing'
import type { Outcome } from '@omne-harness/operation-result'

export type Principal = Readonly<{ name: string }>

export const alice: Principal = { name: 'alice' }
export const bob: Principal = { name: 'bob' }

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

export const call = (name: string): ModelCallId => must(decodeModelCallId(`mcall_${name}`))
export const operation = (name: string): ModelOperationId =>
  must(decodeModelOperationId(`mop_${name}`))
export const dispatch = (name: string): DispatchId => must(decodeDispatchId(`mdisp_${name}`))
export const version = (name: string): ResultVersion => must(decodeResultVersion(`mrver_${name}`))

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

/** The request that the caller fixed before admitting; the fixture does not look inside it. */
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

export const evidence = (label: string): DurableEvidence => ({
  owner: 'fixture',
  record: label,
  revision: '1',
  digest: `digest-${label}`,
})

export function textBlock(id: string, text: string): ContentBlock {
  const judged = judgeContentBlock({
    kind: 'text',
    id,
    visibility: { toHuman: true, toModel: true },
    text,
  })
  if (!('ok' in judged)) throw new Error('the fixture block is invalid')
  return judged.ok
}

/** The text of the text blocks, in order; a tool suggestion has no text. */
export function textsOf(parts: readonly ResultPart[]): string[] {
  return parts.flatMap(part =>
    part.kind === 'sealed' && part.block.kind === 'text' ? [part.block.text] : [],
  )
}

export const access = (name: string, principal: Principal = alice) => ({
  principal,
  tenant: tenantA,
  reference: must(
    encodeModelInvocationRef({
      tenant: tenantA,
      call: call(name),
      admission: operation(`admit-${name}`),
    }),
  ),
  call: call(name),
})

export const callRef = (name: string) => ({ tenant: tenantA, call: call(name) })

export const admission = (name: string): Admit<Principal> => ({
  principal: alice,
  tenant: tenantA,
  call: call(name),
  operation: operation(`admit-${name}`),
  request,
  consumer,
  capacity,
})

/** A dispatch that the provider has started and that has produced nothing yet. */
export const startedDispatch: DispatchRecord = {
  dispatch: dispatch('first'),
  supplier,
  intent: operation('dispatch-intent'),
  send: 'started',
  firstContent: 'none-proven',
  terminal: null,
  account: null,
  materialization: null,
}

/** One admission that the caller sent: for which call and operation, and whether it was accepted. */
export type SentAdmission = Readonly<{
  call: ModelCallId
  operation: ModelOperationId
  accepted: boolean
}>

/**
 * The scripted provider that stands for whatever serves the calls, with the helpers that read it.
 * Every admission leaves through `calls.admit` and is recorded, so `admissions()` lists all the
 * calls that the caller ever tried to bring into the tenant; a call appears nowhere else.
 */
export function newWorld() {
  const scripted = createScriptedModelProvider<Principal>({
    instance: must(decodeModelInstanceId('minst_one')),
  })
  const { calls: provided, consumption, instances } = scripted.provider.runtime
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
    consumption,
    instances,
    controller: scripted.controller,
    /** The admissions that the caller sent so far, in order. */
    admissions: (): readonly SentAdmission[] => sent,
    /** Admits the call `name` under the operation `admit-<name>`. */
    admit: async (name: string) => must(await calls.admit(admission(name))),
    /** The state of the call, looked up through its own admission operation. */
    async state(name: string, principal: Principal = alice): Promise<CallState> {
      const found = must(
        await calls.inspect({
          ...access(name, principal),
          reference: invocationReference({
            ...access(name, principal),
            admission: operation(`admit-${name}`),
          }),
        }),
      )
      expect(found.kind === 'found', `the provider does not know the call ${name}`)
      return found.state
    },
  }
}

export type World = ReturnType<typeof newWorld>

/** This fixture constructs its own locator through the installed public codec. */
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
