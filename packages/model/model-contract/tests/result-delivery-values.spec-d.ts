import { expectTypeOf, it } from 'vitest'
import type { CallAccount } from '@omne-harness/call-account'
import type {
  ConsumerRef,
  DispatchId,
  ModelAccountSnapshot,
  ModelDelivery,
  ModelDeliveryKey,
  ModelInvocationRef,
  ModelOperationRef,
  ResultPart,
  ResultVersion,
  Settlement,
} from '@omne-harness/model-contract'
import { account, call, consumer, cursor, dispatch, evidence, result, revision } from './values.ts'

declare const reference: ModelInvocationRef
declare const operationReference: ModelOperationRef
declare const delivery: ModelDelivery

const resultKey: Extract<ModelDeliveryKey, { kind: 'result' }> = {
  kind: 'result',
  reference,
  result,
}
const accountKey: Extract<ModelDeliveryKey, { kind: 'account' }> = {
  kind: 'account',
  reference,
  dispatch,
  revision: account.revision,
}
const snapshot: ModelAccountSnapshot = { dispatch, account: null }
const settlement: Settlement = {
  version: result,
  termination: { kind: 'completed', reason: 'stop' },
  cursor,
  source: evidence,
}
const part: ResultPart = { kind: 'partial', content: 'text', value: 'answer', trims: [] }
const resultDelivery: Extract<ModelDelivery, { kind: 'result' }> = {
  kind: 'result',
  key: resultKey,
  consumer,
  settlement,
  parts: [part],
  accounts: [snapshot, { dispatch, account }],
}
const accountDelivery: Extract<ModelDelivery, { kind: 'account' }> = {
  kind: 'account',
  key: accountKey,
  consumer,
  account,
}

it('accepts complete result and account deliveries with the owning contract types', () => {
  expectTypeOf(resultDelivery).toExtend<ModelDelivery>()
  expectTypeOf(accountDelivery).toExtend<ModelDelivery>()
  expectTypeOf(resultDelivery.consumer).toEqualTypeOf<ConsumerRef>()
  expectTypeOf(resultDelivery.settlement).toEqualTypeOf<Settlement>()
  expectTypeOf(resultDelivery.parts).toEqualTypeOf<readonly ResultPart[]>()
  expectTypeOf(resultDelivery.accounts).toEqualTypeOf<readonly ModelAccountSnapshot[]>()
  expectTypeOf(accountDelivery.account).toEqualTypeOf<CallAccount>()
  expectTypeOf(accountKey.revision).toEqualTypeOf<CallAccount['revision']>()
  expectTypeOf(snapshot.account).toEqualTypeOf<CallAccount | null>()
})

it('keeps producer references, result versions and dispatch identities distinct', () => {
  expectTypeOf(resultKey.reference).toEqualTypeOf<ModelInvocationRef>()
  expectTypeOf(resultKey.result).toEqualTypeOf<ResultVersion>()
  expectTypeOf(accountKey.dispatch).toEqualTypeOf<DispatchId>()
  // @ts-expect-error a bare string has not been admitted as an invocation reference
  const raw: ModelDeliveryKey = { ...resultKey, reference: 'invocation' }
  // @ts-expect-error an operation reference does not identify the invocation
  const operation: ModelDeliveryKey = { ...resultKey, reference: operationReference }
  // @ts-expect-error a call identity does not replace the complete invocation reference
  const callOnly: ModelDeliveryKey = { ...resultKey, reference: call }
  // @ts-expect-error a dispatch identity is not a result version
  const dispatchResult: ModelDeliveryKey = { ...resultKey, result: dispatch }
  // @ts-expect-error a model revision is not a result version
  const revisionResult: ModelDeliveryKey = { ...resultKey, result: revision }
  // @ts-expect-error a call identity is not a dispatch identity
  const callDispatch: ModelDeliveryKey = { ...accountKey, dispatch: call }
  // @ts-expect-error a bare string is not a dispatch identity
  const rawDispatch: ModelAccountSnapshot = { dispatch: 'dispatch', account }
  void [raw, operation, callOnly, dispatchResult, revisionResult, callDispatch, rawDispatch]
})

it('pairs each delivery branch with its own key and payload', () => {
  // @ts-expect-error result deliveries cannot carry account keys
  const resultWithAccountKey: ModelDelivery = { ...resultDelivery, key: accountKey }
  // @ts-expect-error account deliveries cannot carry result keys
  const accountWithResultKey: ModelDelivery = { ...accountDelivery, key: resultKey }
  // @ts-expect-error result keys do not contain account revision fields
  const mixedKey: ModelDeliveryKey = { ...resultKey, revision: account.revision }
  // @ts-expect-error account deliveries do not carry result settlement fields
  const mixedPayload: ModelDelivery = { ...accountDelivery, settlement }
  // @ts-expect-error only result and account are delivery kinds
  const otherKind: ModelDelivery = { ...accountDelivery, kind: 'receipt' }
  // @ts-expect-error an account delivery needs a report, never the missing-report marker
  const missingReport: ModelDelivery = { ...accountDelivery, account: null }
  void [
    resultWithAccountKey,
    accountWithResultKey,
    mixedKey,
    mixedPayload,
    otherKind,
    missingReport,
  ]
})

it('narrows the key and payload together from the delivery kind', () => {
  if (delivery.kind === 'result') {
    expectTypeOf(delivery.key).toEqualTypeOf<typeof resultKey>()
    expectTypeOf(delivery.parts).toEqualTypeOf<readonly ResultPart[]>()
    // @ts-expect-error account payloads belong to the account branch
    void delivery.account
  } else {
    expectTypeOf(delivery.key).toEqualTypeOf<typeof accountKey>()
    expectTypeOf(delivery.account).toEqualTypeOf<CallAccount>()
    // @ts-expect-error result payloads belong to the result branch
    void delivery.parts
  }
})

it('requires the complete key, result payload and original consumer', () => {
  const { reference: _reference, ...withoutReference } = resultKey
  const { result: _result, ...withoutResult } = resultKey
  const { dispatch: _dispatch, ...withoutDispatch } = accountKey
  const { revision: _revision, ...withoutRevision } = accountKey
  // @ts-expect-error every key includes the invocation reference
  const noReference: ModelDeliveryKey = withoutReference
  // @ts-expect-error result keys include their result version
  const noResult: ModelDeliveryKey = withoutResult
  // @ts-expect-error account keys include their dispatch
  const noDispatch: ModelDeliveryKey = withoutDispatch
  // @ts-expect-error account keys include their report revision
  const noRevision: ModelDeliveryKey = withoutRevision
  const { key: _key, ...withoutKey } = resultDelivery
  const { consumer: _consumer, ...withoutConsumer } = accountDelivery
  const { settlement: _settlement, ...withoutSettlement } = resultDelivery
  const { parts: _parts, ...withoutParts } = resultDelivery
  const { accounts: _accounts, ...withoutAccounts } = resultDelivery
  const { account: _account, ...withoutAccount } = accountDelivery
  // @ts-expect-error deliveries keep their stable key
  const noKey: ModelDelivery = withoutKey
  // @ts-expect-error account deliveries keep their original complete consumer
  const noConsumer: ModelDelivery = withoutConsumer
  // @ts-expect-error result deliveries include the settlement
  const noSettlement: ModelDelivery = withoutSettlement
  // @ts-expect-error empty result parts are explicit, never absent
  const noParts: ModelDelivery = withoutParts
  // @ts-expect-error the frozen account snapshots are explicit, never absent
  const noAccounts: ModelDelivery = withoutAccounts
  // @ts-expect-error account deliveries include their report
  const noAccount: ModelDelivery = withoutAccount
  // @ts-expect-error a snapshot without a report uses null, never an omitted field
  const incompleteSnapshot: ModelAccountSnapshot = { dispatch }
  // @ts-expect-error a snapshot identifies the dispatch even when its report is absent
  const unidentifiedSnapshot: ModelAccountSnapshot = { account: null }
  // @ts-expect-error a partial consumer cannot identify the original purpose and position
  const partialConsumer: ModelDelivery = { ...resultDelivery, consumer: { owner: 'owner' } }
  void [
    noReference,
    noResult,
    noDispatch,
    noRevision,
    noKey,
    noConsumer,
    noSettlement,
    noParts,
    noAccounts,
    noAccount,
    incompleteSnapshot,
    unidentifiedSnapshot,
    partialConsumer,
  ]
})

it('keeps keys, delivery fields, snapshot fields and ordered arrays readonly', () => {
  // @ts-expect-error the result key kind is frozen
  resultKey.kind = 'result'
  // @ts-expect-error the producer reference is frozen
  resultKey.reference = reference
  // @ts-expect-error the result version is frozen
  resultKey.result = result
  // @ts-expect-error the account dispatch is frozen
  accountKey.dispatch = dispatch
  // @ts-expect-error the account revision is frozen
  accountKey.revision = account.revision
  // @ts-expect-error the delivery kind is frozen
  resultDelivery.kind = 'result'
  // @ts-expect-error the delivery key is frozen
  resultDelivery.key = resultKey
  // @ts-expect-error the original consumer is frozen
  resultDelivery.consumer = consumer
  // @ts-expect-error the settlement field is frozen
  resultDelivery.settlement = settlement
  // @ts-expect-error the result parts field is frozen
  resultDelivery.parts = []
  // @ts-expect-error the result parts sequence is readonly
  resultDelivery.parts.push(part)
  // @ts-expect-error the result account snapshots field is frozen
  resultDelivery.accounts = []
  // @ts-expect-error the account snapshot sequence is readonly
  resultDelivery.accounts.push(snapshot)
  // @ts-expect-error snapshot dispatches are readonly
  snapshot.dispatch = dispatch
  // @ts-expect-error snapshot reports are readonly
  snapshot.account = account
  // @ts-expect-error account payloads are readonly
  accountDelivery.account = account
})
