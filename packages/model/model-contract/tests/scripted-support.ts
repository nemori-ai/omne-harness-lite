import { encodeModelInvocationRef } from '@omne-harness/model-contract'
// Builders for the tests of the `./testing` entry. Every identity goes through the package
// decoders, every block through the content-block judge, so no value here is made by an assertion.
import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  decodeResultVersion,
  type Adoption,
  type Admit,
  type ConsumerRef,
  type DispatchId,
  type DispatchRecord,
  type DurableEvidence,
  type FixedModelRequest,
  type ModelCallId,
  type ModelHandle,
  type ModelInstanceId,
  type ModelOperationId,
  type Observation,
  type ResultCapacity,
  type ResultVersion,
  type Supplier,
} from '@omne-harness/model-contract'
import {
  createScriptedModelProvider,
  type ScriptedModelProvider,
} from '@omne-harness/model-contract/testing'

export type Principal = Readonly<{ name: string }>

export const alice: Principal = { name: 'alice' }
export const bob: Principal = { name: 'bob' }

export function must<T>(outcome: Outcome<T, unknown>): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`expected success, got ${JSON.stringify(outcome.failure)}`)
}

export function failureOf(outcome: Outcome<unknown, unknown>): unknown {
  if ('failure' in outcome) return outcome.failure
  throw new Error(`expected a failure, got ${JSON.stringify(outcome.ok)}`)
}

function tenantOf(account: string, organization: string): TenantId {
  const parsedAccount = accountCodec.parse(account)
  const parsedOrganization = organizationCodec.parse(organization)
  if (!parsedAccount.ok || !parsedOrganization.ok) throw new Error('fixture tenant')
  return tenant(parsedOrganization.value, parsedAccount.value)
}

export const tenantA = tenantOf('acc_abcdefghjkmnpqrstvwxyz2345', 'org_abcdefghjkmnpqrstvwxyz2345')
export const tenantB = tenantOf('acc_abcdefghjkmnpqrstvwxyz2346', 'org_abcdefghjkmnpqrstvwxyz2346')

export const call = (name: string): ModelCallId => must(decodeModelCallId(`mcall_${name}`))
export const operation = (name: string): ModelOperationId =>
  must(decodeModelOperationId(`mop_${name}`))
export const instance = (name: string): ModelInstanceId =>
  must(decodeModelInstanceId(`minst_${name}`))
export const dispatch = (name: string): DispatchId => must(decodeDispatchId(`mdisp_${name}`))
export const version = (name: string): ResultVersion => must(decodeResultVersion(`mrver_${name}`))

const adoption = (name: string): Adoption => ({
  owner: 'test',
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

export const request: FixedModelRequest = {
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

export const consumer: ConsumerRef = {
  owner: 'test',
  work: 'work-1',
  position: 'position-1',
  purpose: 'purpose',
}

export const capacity: ResultCapacity = { bytes: '1000', blocks: '10', attachmentBytes: '0' }

export const evidence = (label: string): DurableEvidence => ({
  owner: 'test',
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
  if (!('ok' in judged)) throw new Error('fixture block')
  return judged.ok
}

export function admission(name: string, over: Partial<Admit<Principal>> = {}): Admit<Principal> {
  return {
    principal: alice,
    tenant: tenantA,
    call: call(name),
    operation: operation(`admit-${name}`),
    request,
    consumer,
    capacity,
    ...over,
  }
}

export const startedDispatch: DispatchRecord = {
  dispatch: dispatch('first'),
  supplier,
  intent: operation('dispatch-intent'),
  send: 'started',
  firstContent: 'observed',
  terminal: null,
  account: null,
  materialization: null,
}

/** A scripted provider with the one live instance `minst_one`. */
export function scriptedProvider(): ScriptedModelProvider<Principal> {
  return createScriptedModelProvider<Principal>({ instance: instance('one') })
}

/** Reads one observation at a time from a handle, and closes it through the signal. */
export function watch(
  handle: ModelHandle<Principal>,
  principal: Principal = alice,
  tenantId: TenantId = tenantA,
) {
  const abort = new AbortController()
  const iterator = handle
    .observe({ principal, tenant: tenantId, signal: abort.signal })
    [Symbol.asyncIterator]()
  return {
    close: () => abort.abort(),
    /** Stops reading, as a consumer does that leaves its loop early. */
    stop: async () => {
      await iterator.return?.()
    },
    next: async (): Promise<Observation | 'finished'> => {
      const step = await iterator.next()
      return step.done === true ? 'finished' : step.value
    },
  }
}

export const callRef = (name: string, tenantId: TenantId = tenantA) => ({
  tenant: tenantId,
  call: call(name),
})

/** The access that `alice` of tenant A has to a call. */
export const access = (name: string) => ({
  principal: alice,
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

export async function admitCall(scripted: ScriptedModelProvider<Principal>, name: string) {
  return must(await scripted.provider.runtime.calls.admit(admission(name)))
}

export async function liveHandle(
  scripted: ScriptedModelProvider<Principal>,
  name: string,
): Promise<ModelHandle<Principal>> {
  const route = must(await scripted.provider.runtime.instances.connect(access(name)))
  if (route.kind !== 'live') throw new Error('expected a live route')
  return route.handle
}

/** Ends the call as completed, with three blocks cut into pages of two. */
export function settleCall(scripted: ScriptedModelProvider<Principal>, name: string): void {
  scripted.controller.settle({
    ...callRef(name),
    version: version(name),
    termination: { kind: 'completed', reason: 'stop' },
    parts: [textBlock('b1', 'one'), textBlock('b2', 'two'), textBlock('b3', 'three')].map(
      block => ({ kind: 'sealed' as const, block, trims: [] }),
    ),
    source: evidence(`settlement-${name}`),
    pageSize: 2,
    pageTargetBytes: 1024,
  })
}

export const ackInput = (name: string, label = 'processed') => ({
  ...access(name),
  operation: operation(`ack-${name}`),
  result: version(name),
  evidence: { kind: 'processed' as const, completion: evidence(label) },
})

/** Settles a call whose result has `count` blocks, cut into pages of `pageSize`. */
export function settleWithBlocks(
  scripted: ScriptedModelProvider<Principal>,
  name: string,
  count: number,
  pageSize: number,
): void {
  scripted.controller.settle({
    ...callRef(name),
    version: version(name),
    termination: { kind: 'completed', reason: 'stop' },
    parts: Array.from({ length: count }, (_, at) => textBlock(`b${at}`, `block ${at}`)).map(
      block => ({ kind: 'sealed' as const, block, trims: [] }),
    ),
    source: evidence(`settlement-${name}`),
    pageSize,
    pageTargetBytes: 1024,
  })
}

export function deniedAs(outcome: Outcome<unknown, unknown>, action: string): boolean {
  return (
    'failure' in outcome &&
    JSON.stringify(outcome.failure) === JSON.stringify({ kind: 'denied', action })
  )
}

export function endedAs(outcome: Outcome<unknown, unknown>, reason: string): boolean {
  return 'ok' in outcome && JSON.stringify(outcome.ok) === JSON.stringify({ kind: 'ended', reason })
}
