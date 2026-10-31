import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { CallAccount } from '@omne-harness/call-account'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelOperationId,
  decodeResultVersion,
  encodeModelInvocationRef,
  type ModelDeliveryKey,
} from '@omne-harness/model-contract'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
} from '@omne-harness/tool-contract'
import { decodeConsumptionId, type DurableEvidence } from './identity.ts'
import type { ReceivedEntry, StartFenceEntry } from './receiving.ts'

function identity<T>(decoded: Outcome<T, unknown>, what: string): T {
  if (!('ok' in decoded)) throw new TypeError(`the suite value ${what} is invalid`)
  return decoded.ok
}
const evidence = (record: string): DurableEvidence => ({
  owner: 'suite',
  record,
  revision: '1',
  digest: 'd',
})

/** A start-fence entry of the suite. */
export function sampleStartFence(name: string): StartFenceEntry {
  return {
    kind: 'start-fence',
    operation: identity(decodeToolOperationId(`top_${name}`), name),
    guard: {
      owner: 'agent',
      resource: `attachment-${name}`,
      revision: '1',
      evidence: evidence(name),
    },
    fence: evidence(`fence-${name}`),
  }
}

function account(
  call: string,
  revision: string,
  kind: CallAccount['subject']['kind'] = 'model_call',
): CallAccount {
  return {
    subject: { kind, id: call },
    usage: [{ name: 'input', state: 'known', lexeme: '12', unit: 'token' }],
    cost: [],
    trimmed: { state: 'unknown', unit: 'token' },
    place: 'suite',
    duration: { state: 'unknown' },
    receipt: 'received',
    revision,
  }
}

/** A received Model result of the suite, with its call reference minted for `tenant`. */
export function sampleReceivedModelResult(
  tenant: TenantId,
  name: string,
  dispatchRevision = '0',
): ReceivedEntry {
  const call = identity(decodeModelCallId(`mcall_${name}`), name)
  const reference = identity(
    encodeModelInvocationRef({
      tenant,
      call,
      admission: identity(decodeModelOperationId(`mop_${name}`), name),
    }),
    name,
  )
  const key: ModelDeliveryKey = {
    kind: 'result',
    reference,
    result: identity(decodeResultVersion(`mrver_${name}`), name),
  }
  return {
    kind: 'received',
    delivery: {
      producer: 'model',
      key,
      accounts: [
        {
          dispatch: identity(decodeDispatchId(`mdisp_${name}`), name),
          account: account(call, dispatchRevision),
        },
      ],
    },
    consumer: { owner: 'agent', work: `exec-${name}`, position: `pos-${name}`, purpose: 'main' },
    consumption: identity(decodeConsumptionId(`cons-${name}`), name),
    material: evidence(`material-${name}`),
  }
}

function modelReference(tenant: TenantId, name: string) {
  const call = identity(decodeModelCallId(`mcall_${name}`), name)
  const reference = identity(
    encodeModelInvocationRef({
      tenant,
      call,
      admission: identity(decodeModelOperationId(`mop_${name}`), name),
    }),
    name,
  )
  return { call, reference }
}

const consumerOf = (name: string) => ({
  consumer: { owner: 'agent', work: `exec-${name}`, position: `pos-${name}`, purpose: 'main' },
  consumption: identity(decodeConsumptionId(`cons-${name}`), name),
  material: evidence(`material-${name}`),
})

/** A received Model account delivery of the suite, with its call reference minted for `tenant`. */
export function sampleReceivedModelAccount(
  tenant: TenantId,
  name: string,
  revision = '0',
): ReceivedEntry {
  const { call, reference } = modelReference(tenant, name)
  return {
    kind: 'received',
    delivery: {
      producer: 'model',
      key: {
        kind: 'account',
        reference,
        dispatch: identity(decodeDispatchId(`mdisp_${name}`), name),
        revision,
      },
      account: account(call, revision),
    },
    ...consumerOf(name),
  }
}

/** A received Tool account delivery of the suite, with its call reference minted for `tenant`. */
export function sampleReceivedToolAccount(
  tenant: TenantId,
  name: string,
  lexeme = '12',
): ReceivedEntry {
  const call = identity(decodeToolCallId(`tcall_${name}`), name)
  const reference = identity(
    encodeToolInvocationRef({
      tenant,
      call,
      admission: identity(decodeToolOperationId(`top_${name}`), name),
    }),
    name,
  )
  const kept = account(call, '0', 'tool_execution')
  return {
    kind: 'received',
    delivery: {
      producer: 'tool',
      key: { kind: 'account', producer: 'tool', reference, event: `event-${name}`, revision: '0' },
      account: { ...kept, usage: [{ name: 'input', state: 'known', lexeme, unit: 'token' }] },
    },
    ...consumerOf(name),
  }
}
