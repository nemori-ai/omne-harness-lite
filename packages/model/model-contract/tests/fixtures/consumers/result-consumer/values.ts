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
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  decodeResultVersion,
  type Admit,
  type Adoption,
  type CallState,
  type ConsumerRef,
  type DurableEvidence,
  type FixedModelRequest,
  type ModelBlock,
  type ModelCallId,
  type ModelOperationId,
  type ResultCapacity,
  type ResultVersion,
  type Supplier,
} from '@omne-harness/model-contract'
import { createScriptedModelProvider } from '@omne-harness/model-contract/testing'
import type { Outcome } from '@omne-harness/operation-result'

export type Principal = Readonly<{ name: string }>

export const owner: Principal = { name: 'consumer' }

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
export const version = (name: string): ResultVersion => must(decodeResultVersion(`mrver_${name}`))

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

/** The request that the owner fixed before admitting; the fixture does not look inside it. */
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
export function textsOf(blocks: readonly ModelBlock[]): string[] {
  return blocks.flatMap(block => (block.kind === 'text' ? [block.text] : []))
}

export const access = (name: string, principal: Principal = owner) => ({
  principal,
  tenant: tenantA,
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

/** The scripted provider that stands for whatever serves the calls, with the helpers that read it. */
export function newWorld() {
  const scripted = createScriptedModelProvider<Principal>({
    instance: must(decodeModelInstanceId('minst_one')),
  })
  const { calls, consumption, instances } = scripted.provider.runtime
  return {
    calls,
    consumption,
    instances,
    controller: scripted.controller,
    /** Admits the call `name` under the operation `admit-<name>`. */
    admit: async (name: string) => must(await calls.admit(admission(name))),
    /** The state of the call, looked up through its own admission operation. */
    async state(name: string, principal: Principal = owner): Promise<CallState> {
      const found = must(
        await calls.inspect({ ...access(name, principal), admission: operation(`admit-${name}`) }),
      )
      expect(found.kind === 'found', `the provider does not know the call ${name}`)
      return found.state
    },
  }
}

export type World = ReturnType<typeof newWorld>
