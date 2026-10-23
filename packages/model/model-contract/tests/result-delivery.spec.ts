import { describe, expect, it } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { CallAccount } from '@omne-harness/call-account'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelOperationId,
  decodeOutputCursor,
  decodeResultVersion,
  encodeModelInvocationRef,
  judgeModelDelivery,
  type ModelDelivery,
  type ModelInvocationRef,
  type ResultPart,
} from '@omne-harness/model-contract'
import { sameValue } from './helpers/result-delivery-values.ts'

function must<T, F>(value: Outcome<T, F>): T {
  if ('failure' in value) throw new Error('Invalid fixture input')
  return value.ok
}
function minted(account: string): TenantId {
  const value = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_' + '0'.repeat(26),
      account: 'acc_' + account.padStart(26, '0'),
    }),
  )
  if (!value.ok) throw new Error('Invalid fixture tenant')
  return value.value
}
const tenant = minted('0')
const foreign = minted('1')
const call = must(decodeModelCallId('mcall_a'))
const otherCall = must(decodeModelCallId('mcall_b'))
const admission = must(decodeModelOperationId('mop_a'))
const otherAdmission = must(decodeModelOperationId('mop_b'))
const dispatch = must(decodeDispatchId('mdisp_a'))
const otherDispatch = must(decodeDispatchId('mdisp_b'))
const thirdDispatch = must(decodeDispatchId('mdisp_c'))
const consumer = { owner: 'owner', work: 'w', position: 'p', purpose: 'u' }
const evidence = { owner: 'source', record: 'r', revision: '1', digest: 'source-only' }
function reference(target = tenant, targetCall = call, operation = admission): ModelInvocationRef {
  return must(encodeModelInvocationRef({ tenant: target, call: targetCall, admission: operation }))
}
function account(): CallAccount {
  return {
    subject: { kind: 'model_call', id: call },
    usage: [],
    cost: [],
    trimmed: { state: 'unknown', unit: 'token' },
    place: 'test',
    duration: { state: 'unknown' },
    receipt: 'received',
    revision: '1',
  }
}
function resultDelivery(
  target = tenant,
  revision = '1',
): Extract<ModelDelivery, { kind: 'result' }> {
  const result = must(decodeResultVersion('mrver_' + revision))
  return {
    kind: 'result',
    key: { kind: 'result', reference: reference(target), result },
    consumer: { ...consumer },
    settlement: {
      version: result,
      cursor: must(decodeOutputCursor('1')),
      termination: { kind: 'completed', reason: 'stop' },
      source: { ...evidence },
    },
    parts: [{ kind: 'partial', content: 'text', value: 'answer', trims: [] }],
    accounts: [
      { dispatch, account: account() },
      { dispatch: otherDispatch, account: null },
    ],
  }
}
function accountDelivery(): Extract<ModelDelivery, { kind: 'account' }> {
  return {
    kind: 'account',
    key: { kind: 'account', reference: reference(), dispatch, revision: '1' },
    consumer: { ...consumer },
    account: account(),
  }
}
function judge(delivery: ModelDelivery) {
  return judgeModelDelivery({ tenant, delivery })
}

describe('typed delivery relations through the public entry', () => {
  it('R01/R24 checks minted tenant and foreign invocation before other failures', () => {
    // @ts-expect-error exercise the runtime identity guard without minting a brand
    expect(judgeModelDelivery({ tenant: {}, delivery: resultDelivery() })).toEqual({
      failure: { field: 'tenant', reason: 'identity' },
    })
    expect(judge(resultDelivery(foreign))).toEqual({
      failure: { field: 'key.reference', reason: 'foreign-tenant' },
    })
  })
  it('R02 gives malformed reference priority over a result version mismatch', () => {
    const delivery = resultDelivery()
    // @ts-expect-error malformed references exercise the runtime codec guard
    delivery.key.reference = 'broken'
    expect(
      judge({
        ...delivery,
        settlement: { ...delivery.settlement, version: must(decodeResultVersion('mrver_2')) },
      }),
    ).toEqual({ failure: { field: 'key.reference', reason: 'reference-malformed' } })
  })
  it('R03 checks result version and account revision', () => {
    const result = resultDelivery()
    expect(
      judge({
        ...result,
        settlement: { ...result.settlement, version: must(decodeResultVersion('mrver_2')) },
      }),
    ).toEqual({ failure: { field: 'key.result', reason: 'version-mismatch' } })
    const delivery = accountDelivery()
    expect(judge({ ...delivery, account: { ...delivery.account, revision: '2' } })).toEqual({
      failure: { field: 'key.revision', reason: 'revision-mismatch' },
    })
  })
  it.each([
    { kind: 'tool_execution', id: call },
    { kind: 'model_call', id: otherCall },
  ] satisfies CallAccount['subject'][])('R04 rejects a foreign account subject %j', subject => {
    const delivery = accountDelivery()
    expect(judge({ ...delivery, account: { ...delivery.account, subject } })).toEqual({
      failure: { field: 'account.subject', reason: 'call-mismatch' },
    })
  })
  it('R05 checks all duplicate dispatches before any bad account subject', () => {
    const delivery = resultDelivery()
    const bad = {
      ...account(),
      subject: { kind: 'model_call', id: otherCall },
    } satisfies CallAccount
    expect(
      judge({
        ...delivery,
        accounts: [
          { dispatch, account: bad },
          { dispatch, account: null },
        ],
      }),
    ).toEqual({ failure: { field: 'accounts', reason: 'duplicate-dispatch' } })
    expect(judge({ ...delivery, accounts: [{ dispatch, account: bad }] })).toEqual({
      failure: { field: 'accounts', reason: 'call-mismatch' },
    })
  })
  it('R06 returns each original reference without freezing or creating evidence', () => {
    for (const delivery of [resultDelivery(), accountDelivery()]) {
      expect(must(judge(delivery))).toBe(delivery)
      expect(Object.isFrozen(delivery)).toBe(false)
      expect(Object.isFrozen(delivery.consumer)).toBe(false)
      expect(delivery).not.toHaveProperty('evidence')
    }
  })
  it('R13 compares field presence and full consumer independently of owner admission', () => {
    expect(sameValue({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(sameValue({}, { a: undefined })).toBe(false)
    expect(sameValue([1, 2], [2, 1])).toBe(false)
    for (const field of ['owner', 'work', 'position', 'purpose']) {
      expect(sameValue(consumer, { ...consumer, [field]: 'other' })).toBe(false)
    }
  })
})

import { judgeContentBlock } from '@omne-harness/content-block'
import {
  createDeliveryFixture,
  type Budget,
  type DeliveryFixture,
  type StepFact,
} from './helpers/result-delivery-fixture.ts'
import { deliveryBytes } from './helpers/result-delivery-values.ts'
const principal = Object.freeze({ subject: 'receiver' })
const access = { tenant, principal }
const limits: Budget = { records: 20, bytes: 100000, attachments: 10000, inFlight: 10 }
const committed: StepFact = { actual: 'committed', observed: 'known' }
const absent: StepFact = { actual: 'absent', observed: 'known' }
function fixture(budget: Budget = limits) {
  const store = createDeliveryFixture<typeof principal>({
    limits: budget,
    tenants: [{ tenant, reserved: budget }],
  })
  store.establishOriginalCall({
    reference: reference(),
    consumer,
    dispatches: [dispatch, otherDispatch],
  })
  store.setAccess(access, 'allow')
  return store
}
function push(
  store: DeliveryFixture<typeof principal>,
  delivery: ModelDelivery = resultDelivery(),
  signal = new AbortController().signal,
) {
  return store.receiver.push({ access, delivery, signal })
}
function commits(store: DeliveryFixture<typeof principal>, stage: 'material' | 'responsibility') {
  return store.events().filter(item => item.action === stage + '.commit').length
}
function queries(store: DeliveryFixture<typeof principal>) {
  return store
    .events()
    .filter(item => ['owner.read', 'dispatches.read', 'key.read'].includes(item.action))
}
async function partial(store: DeliveryFixture<typeof principal>, delivery = resultDelivery()) {
  store.pauseAt(delivery.key, 'responsibility')
  const response = push(store, delivery)
  await store.reached(delivery.key, 'responsibility')
  store.resume(delivery.key, 'responsibility', absent)
  expect(await response).toEqual({ failure: { kind: 'unavailable', dependency: 'responsibility' } })
}
async function unknown(
  store: DeliveryFixture<typeof principal>,
  delivery: ModelDelivery = resultDelivery(),
  stage: 'material' | 'responsibility' = 'material',
  actual: StepFact['actual'] = 'committed',
) {
  store.pauseAt(delivery.key, stage)
  const response = push(store, delivery)
  await store.reached(delivery.key, stage)
  store.resume(delivery.key, stage, { actual, observed: 'unknown' })
  expect(await response).toEqual({ failure: { kind: 'outcome-unknown' } })
}
function aborted(): AbortSignal {
  const controller = new AbortController()
  controller.abort()
  return controller.signal
}

describe('receiver qualification and original ownership', () => {
  it('R01 denies unminted and foreign tenants before querying owner or key', async () => {
    const store = fixture()
    expect(
      await store.receiver.push({
        // @ts-expect-error deliberate runtime identity rejection
        access: { tenant: {}, principal },
        delivery: resultDelivery(),
        signal: aborted(),
      }),
    ).toEqual({ failure: { kind: 'denied' } })
    expect(await push(store, resultDelivery(foreign))).toEqual({ failure: { kind: 'denied' } })
    expect(queries(store)).toEqual([])
  })
  it('R07 defaults to deny and keys permission by tenant and principal identity without traversing principal', async () => {
    const store = fixture()
    const copy = { subject: principal.subject }
    expect(
      await store.receiver.push({
        access: { tenant, principal: copy },
        delivery: resultDelivery(),
        signal: aborted(),
      }),
    ).toEqual({ failure: { kind: 'denied' } })
    expect(queries(store)).toEqual([])
    const opaque = Object.defineProperty({}, 'subject', {
      get() {
        throw new Error('Principal was traversed')
      },
    })
    const other = createDeliveryFixture<object>({ limits, tenants: [{ tenant, reserved: limits }] })
    other.establishOriginalCall({
      reference: reference(),
      consumer,
      dispatches: [dispatch, otherDispatch],
    })
    other.setAccess({ tenant, principal: opaque }, 'allow')
    expect(
      await other.receiver.push({
        access: { tenant, principal: opaque },
        delivery: resultDelivery(),
        signal: new AbortController().signal,
      }),
    ).toHaveProperty('ok')
  })
  it.each(['deny', 'unavailable'] as const)(
    'R07/R24 %s takes priority over bad admission and saved conflict',
    async decision => {
      const store = fixture()
      const delivery = resultDelivery()
      await push(store, delivery)
      const before = queries(store).length
      store.setAccess(access, decision)
      const expected =
        decision === 'deny'
          ? { kind: 'denied' }
          : { kind: 'unavailable', dependency: 'qualification' }
      for (const candidate of [
        delivery,
        {
          ...delivery,
          key: { ...delivery.key, reference: reference(tenant, call, otherAdmission) },
        },
        { ...delivery, parts: [] },
      ]) {
        expect(await push(store, candidate)).toEqual({ failure: expected })
      }
      expect(queries(store)).toHaveLength(before)
    },
  )
  it('R08 checks admission and complete consumer before typed relations', async () => {
    const store = fixture()
    const delivery = resultDelivery()
    expect(
      await push(store, {
        ...delivery,
        key: { ...delivery.key, reference: reference(tenant, otherCall) },
      }),
    ).toEqual({ failure: { kind: 'invalid', field: 'key.reference', reason: 'not-accepted' } })
    expect(
      await push(store, {
        ...delivery,
        key: { ...delivery.key, reference: reference(tenant, call, otherAdmission) },
      }),
    ).toEqual({ failure: { kind: 'invalid', field: 'key.reference', reason: 'not-original' } })
    for (const field of ['owner', 'work', 'position', 'purpose']) {
      expect(
        await push(store, {
          ...delivery,
          consumer: { ...consumer, [field]: 'changed' },
          settlement: { ...delivery.settlement, version: must(decodeResultVersion('mrver_bad')) },
        }),
      ).toEqual({ failure: { kind: 'invalid', field: 'consumer', reason: 'not-original' } })
    }
    expect(store.events().filter(item => item.action === 'key.read')).toEqual([])
  })
  it('R09 checks complete result dispatches, with duplicates before set membership', async () => {
    const store = fixture()
    const delivery = resultDelivery()
    for (const dispatches of [[dispatch], [dispatch, otherDispatch, thirdDispatch]]) {
      expect(
        await push(store, {
          ...delivery,
          accounts: dispatches.map(item => ({ dispatch: item, account: null })),
        }),
      ).toEqual({
        failure: { kind: 'invalid', field: 'accounts', reason: 'dispatch-set-mismatch' },
      })
    }
    expect(
      await push(store, {
        ...delivery,
        accounts: [
          { dispatch, account: null },
          { dispatch, account: null },
        ],
      }),
    ).toEqual({ failure: { kind: 'invalid', field: 'accounts', reason: 'duplicate-dispatch' } })
    expect(store.events().filter(item => item.action === 'key.read')).toEqual([])
  })
  it('R09a/R09b account subject alone cannot authorize another call dispatch', async () => {
    const store = fixture()
    store.establishOriginalCall({
      reference: reference(tenant, otherCall),
      consumer,
      dispatches: [thirdDispatch],
    })
    const delivery = accountDelivery()
    const foreignDispatch = { ...delivery, key: { ...delivery.key, dispatch: thirdDispatch } }
    expect(must(judge(foreignDispatch))).toBe(foreignDispatch)
    expect(await push(store, foreignDispatch)).toEqual({
      failure: { kind: 'invalid', field: 'key.dispatch', reason: 'not-original' },
    })
    expect(store.events().filter(item => item.action === 'key.read')).toEqual([])
    const before = store.events().filter(item => item.action === 'dispatches.read').length
    expect(
      await push(store, {
        ...foreignDispatch,
        key: { ...foreignDispatch.key, reference: reference(tenant, call, otherAdmission) },
      }),
    ).toEqual({ failure: { kind: 'invalid', field: 'key.reference', reason: 'not-original' } })
    store.setAccess(access, 'deny')
    expect(await push(store, foreignDispatch)).toEqual({ failure: { kind: 'denied' } })
    expect(store.events().filter(item => item.action === 'dispatches.read')).toHaveLength(before)
  })
  it.each(['result', 'account'] as const)(
    'R10 preserves old %s unknown when dispatch source becomes unreadable',
    async kind => {
      const store = fixture()
      const delivery = kind === 'result' ? resultDelivery() : accountDelivery()
      await unknown(store, delivery)
      const record = store.readRecord(delivery.key)
      const before = store.events().filter(item => item.action === 'key.read').length
      store.setDependency('dispatches', 'unavailable')
      expect(await push(store, delivery)).toEqual({
        failure: { kind: 'unavailable', dependency: 'dispatches' },
      })
      expect(store.readRecord(delivery.key)).toEqual(record)
      expect(store.events().filter(item => item.action === 'key.read')).toHaveLength(before)
    },
  )
  it('R08 distinguishes unavailable original source from absent call', async () => {
    const store = fixture()
    store.setDependency('original-call', 'unavailable')
    expect(await push(store)).toEqual({
      failure: { kind: 'unavailable', dependency: 'original-call' },
    })
    expect(store.events().filter(item => item.action === 'key.read')).toEqual([])
  })
})

describe('receiver independent custody and retry facts', () => {
  it('R11/R13 returns the same receipt for full content with reordered object keys', async () => {
    const store = fixture()
    const delivery = resultDelivery()
    const receipt = must(await push(store, delivery))
    const resources = store.resources(tenant)
    expect(
      await push(store, {
        ...delivery,
        consumer: { purpose: 'u', position: 'p', work: 'w', owner: 'owner' },
      }),
    ).toEqual({ ok: receipt })
    expect(receipt.evidence.owner).toBe(consumer.owner)
    expect(store.resources(tenant)).toEqual(resources)
    expect(commits(store, 'material')).toBe(1)
    expect(commits(store, 'responsibility')).toBe(1)
    expect(store.readRecord(delivery.key)).toMatchObject({
      dedup: true,
      protected: true,
      receiptObserved: true,
      material: committed,
      responsibility: committed,
    })
  })
  it('R12 compares result text, array order and complete nested account contents', async () => {
    const store = fixture()
    const delivery = resultDelivery()
    await push(store, delivery)
    const original = store.readRecord(delivery.key)
    const changed: ModelDelivery[] = [
      { ...delivery, parts: [{ kind: 'partial', content: 'text', value: 'changed', trims: [] }] },
      { ...delivery, accounts: [...delivery.accounts].reverse() },
      {
        ...delivery,
        accounts: [
          {
            dispatch,
            account: {
              ...account(),
              cost: [{ state: 'known', lexeme: '1.00', source: 'billable', unit: 'USD' }],
            },
          },
          { dispatch: otherDispatch, account: null },
        ],
      },
      {
        ...delivery,
        settlement: { ...delivery.settlement, source: { ...evidence, digest: 'different' } },
      },
    ]
    for (const value of changed)
      expect(await push(store, value)).toEqual({ failure: { kind: 'conflict' } })
    expect(store.readRecord(delivery.key)).toEqual(original)
  })
  it('R14 captures a deep frozen copy synchronously before any stage waits', async () => {
    const store = fixture()
    const body = {
      kind: 'partial',
      content: 'text',
      value: 'original',
      trims: [{ removed: '2', reason: 'limit' }],
    } satisfies ResultPart
    const delivery = { ...resultDelivery(), parts: [body], consumer: { ...consumer } }
    store.pauseAt(delivery.key, 'material')
    const originalKey = { ...delivery.key }
    const response = push(store, delivery)
    body.value = 'caller changed'
    for (const trim of body.trims) trim.reason = 'caller changed'
    delivery.consumer.position = 'caller changed'
    delivery.key = { ...delivery.key, result: must(decodeResultVersion('mrver_changed')) }
    await store.reached(originalKey, 'material')
    store.resume(originalKey, 'material', committed)
    expect(must(await response).key).toEqual(originalKey)
    const record = store.readRecord(originalKey)
    expect(record?.delivery).toMatchObject({
      consumer,
      parts: [{ value: 'original', trims: [{ reason: 'limit' }] }],
    })
    expect(Object.isFrozen(record?.delivery)).toBe(true)
    expect(Object.isFrozen(record?.delivery.consumer)).toBe(true)
    expect(Object.isFrozen(body)).toBe(false)
  })
  it('R15 keeps known partial material and stable operation while retry fills only responsibility', async () => {
    const store = fixture()
    const delivery = resultDelivery()
    await partial(store, delivery)
    const resources = store.resources(tenant)
    expect(resources).toMatchObject({ records: 1, inFlight: 0 })
    expect(store.readRecord(delivery.key)).toMatchObject({
      material: committed,
      responsibility: absent,
      evidence: null,
      dedup: false,
      protected: false,
    })
    const receipt = must(await push(store, delivery))
    expect(receipt.evidence.record).toBe('1')
    expect(store.resources(tenant)).toEqual(resources)
    expect(commits(store, 'material')).toBe(1)
    expect(commits(store, 'responsibility')).toBe(1)
    expect(store.readRecord(delivery.key)?.attempts).toBe(2)
  })
  it('R15b/R19b retained definite material failures stay charged and preserve conflicts', async () => {
    const store = fixture({ ...limits, records: 2 })
    const delivery = resultDelivery()
    store.pauseAt(delivery.key, 'material')
    const response = push(store, delivery)
    await store.reached(delivery.key, 'material')
    store.resume(delivery.key, 'material', absent)
    expect(await response).toEqual({ failure: { kind: 'unavailable', dependency: 'material' } })
    expect(store.resources(tenant)).toMatchObject({
      records: 1,
      bytes: deliveryBytes(delivery),
      inFlight: 0,
    })
    expect(await push(store, { ...delivery, parts: [] })).toEqual({ failure: { kind: 'conflict' } })
    store.setDependency('material', 'unavailable')
    expect(await push(store, resultDelivery(tenant, '2'))).toEqual({
      failure: { kind: 'unavailable', dependency: 'material' },
    })
    expect(await push(store, resultDelivery(tenant, '3'))).toEqual({
      failure: { kind: 'backpressured', resource: 'records' },
    })
    expect(store.resources(tenant).records).toBe(2)
    store.setDependency('material', 'available')
    expect(await push(store, delivery)).toHaveProperty('ok')
    expect(commits(store, 'material')).toBe(1)
  })
  it.each([
    ['material', 'committed'],
    ['material', 'absent'],
    ['responsibility', 'committed'],
    ['responsibility', 'absent'],
  ] as const)('R16 resolves %s actual %s only along the original record', async (stage, actual) => {
    const store = fixture()
    const delivery = resultDelivery()
    await unknown(store, delivery, stage, actual)
    const before = store.readRecord(delivery.key)
    const resources = store.resources(tenant)
    expect(await push(store, delivery)).toEqual({ failure: { kind: 'outcome-unknown' } })
    expect(store.readRecord(delivery.key)).toEqual(before)
    expect(() =>
      store.resolveUnknown(delivery.key, stage, actual === 'absent' ? 'committed' : 'absent'),
    ).toThrow('Unproven')
    store.resolveUnknown(delivery.key, stage, actual)
    expect(await push(store, delivery)).toHaveProperty('ok')
    expect(commits(store, 'material')).toBe(1)
    expect(commits(store, 'responsibility')).toBe(1)
    expect(store.resources(tenant)).toEqual(resources)
  })
  it('R17 preserves original receipt and responsibility after losing a saved response', async () => {
    const store = fixture()
    const delivery = resultDelivery()
    store.dropReplyOnce(delivery.key)
    expect(await push(store, delivery)).toEqual({ failure: { kind: 'outcome-unknown' } })
    const before = store.readRecord(delivery.key)
    expect(before).toMatchObject({
      material: committed,
      responsibility: committed,
      dedup: true,
      protected: true,
      receiptObserved: false,
    })
    const recovered = must(await push(store, delivery))
    expect(recovered.evidence).toEqual(before?.evidence)
    expect(commits(store, 'material')).toBe(1)
    expect(commits(store, 'responsibility')).toBe(1)
  })
  it('R18/R24 maps pre-abort to new, saved, known partial and unknown facts', async () => {
    const store = fixture()
    const delivery = resultDelivery()
    expect(await push(store, delivery, aborted())).toEqual({
      failure: { kind: 'cancelled-before-accept' },
    })
    expect(store.readRecord(delivery.key)).toBe(null)
    await partial(store, delivery)
    expect(await push(store, delivery, aborted())).toEqual({
      failure: { kind: 'unavailable', dependency: 'responsibility' },
    })
    const receipt = must(await push(store, delivery))
    expect(await push(store, delivery, aborted())).toEqual({ ok: receipt })
    const second = resultDelivery(tenant, '2')
    await unknown(store, second)
    const before = store.readRecord(second.key)
    expect(await push(store, second, aborted())).toEqual({ failure: { kind: 'outcome-unknown' } })
    store.setAccess(access, 'deny')
    expect(await push(store, second)).toEqual({ failure: { kind: 'denied' } })
    store.setAccess(access, 'unavailable')
    expect(await push(store, second)).toEqual({
      failure: { kind: 'unavailable', dependency: 'qualification' },
    })
    expect(store.readRecord(second.key)).toEqual(before)
  })
  it('R18 abort stops waiting while a late material write retains its real in-flight slot', async () => {
    const store = fixture({ ...limits, inFlight: 2 })
    const delivery = resultDelivery()
    const controller = new AbortController()
    store.pauseAt(delivery.key, 'material')
    const response = push(store, delivery, controller.signal)
    await store.reached(delivery.key, 'material')
    controller.abort()
    expect(await response).toEqual({ failure: { kind: 'outcome-unknown' } })
    expect(store.resources(tenant).inFlight).toBe(1)
    const recoveryWait = push(store, delivery)
    expect(await push(store, delivery)).toEqual({
      failure: { kind: 'backpressured', resource: 'in-flight' },
    })
    store.resume(delivery.key, 'material', committed)
    expect(await recoveryWait).toEqual({ failure: { kind: 'outcome-unknown' } })
    expect(store.resources(tenant).inFlight).toBe(0)
    expect(store.readRecord(delivery.key)?.material).toEqual({
      actual: 'committed',
      observed: 'unknown',
    })
    store.resolveUnknown(delivery.key, 'material', 'committed')
    expect(await push(store, delivery)).toHaveProperty('ok')
    expect(commits(store, 'material')).toBe(1)
  })
  it('R22 serializes same key requests and rejects divergent content during responsibility', async () => {
    const store = fixture()
    const delivery = resultDelivery()
    store.pauseAt(delivery.key, 'responsibility')
    const first = push(store, delivery)
    await store.reached(delivery.key, 'responsibility')
    const second = push(store, delivery)
    expect(store.resources(tenant)).toMatchObject({ records: 1, inFlight: 2 })
    expect(await push(store, { ...delivery, parts: [] })).toEqual({ failure: { kind: 'conflict' } })
    store.resume(delivery.key, 'responsibility', committed)
    expect(await second).toEqual(await first)
    expect(commits(store, 'responsibility')).toBe(1)
    expect(store.resources(tenant).inFlight).toBe(0)
  })
  it('R23 keeps account receipts separate from result receipts', async () => {
    const store = fixture()
    const result = must(await push(store))
    const report = must(await push(store, accountDelivery()))
    expect(result.key.kind).toBe('result')
    expect(report.key.kind).toBe('account')
    expect(report.evidence).not.toEqual(result.evidence)
    expect(store.events().some(event => /ack|cleanup/.test(event.action))).toBe(false)
  })
})

function block(value: unknown) {
  const judged = judgeContentBlock(value)
  if ('rejected' in judged) throw new Error('Invalid content fixture')
  return judged.ok
}
function withAttachment(target = resultDelivery(), ref = true) {
  const media = block(
    ref
      ? {
          kind: 'image',
          id: 'b1',
          visibility: { toHuman: true, toModel: true },
          transcript: null,
          ref: {
            storage: 'store',
            key: 'blob',
            mediaType: 'image/png',
            bytes: '1',
            digest: 'untrusted-size',
          },
        }
      : {
          kind: 'file',
          id: 'b2',
          visibility: { toHuman: true, toModel: true },
          storage: 'store',
          key: 'blob',
          mediaType: 'text/plain',
        },
  )
  return { ...target, parts: [{ kind: 'sealed', block: media, trims: [] }] } satisfies ModelDelivery
}
function independentBytes(value: unknown): number {
  // This oracle uses a normalized tree; the adapter writes its canonical string directly.
  function normalize(tree: unknown): unknown {
    if (Array.isArray(tree)) return tree.map(normalize)
    if (tree !== null && typeof tree === 'object')
      return Object.fromEntries(
        Object.entries(tree)
          .sort(([a], [b]) => a.localeCompare(b, 'en'))
          .map(([key, item]) => [key, normalize(item)]),
      )
    return tree
  }
  return Buffer.byteLength(JSON.stringify(normalize(value)), 'utf8')
}

describe('bounded custody resources', () => {
  it('R19 charges complete canonical UTF8 delivery bytes and keeps retries within the same allocation', async () => {
    const delivery = {
      ...resultDelivery(),
      parts: [{ kind: 'partial', content: 'text', value: '汉字 \n "quoted" 🦊', trims: [] }],
    } satisfies ModelDelivery
    const bytes = independentBytes(delivery)
    expect(deliveryBytes(delivery)).toBe(bytes)
    for (const remaining of [-1, 0, 1]) {
      const store = fixture({ ...limits, bytes: bytes + remaining })
      const response = await push(store, delivery)
      if (remaining < 0) {
        expect(response).toEqual({ failure: { kind: 'backpressured', resource: 'bytes' } })
        expect(store.resources(tenant)).toEqual({
          records: 0,
          bytes: 0,
          attachments: 0,
          inFlight: 0,
        })
      } else {
        expect(response).toHaveProperty('ok')
        expect(store.resources(tenant).bytes).toBe(bytes)
        expect(await push(store, delivery)).toEqual(response)
      }
    }
  })
  it('R19 returns record backpressure without evicting the existing saved key', async () => {
    const store = fixture({ ...limits, records: 1 })
    const response = await push(store)
    expect(await push(store, resultDelivery(tenant, '2'))).toEqual({
      failure: { kind: 'backpressured', resource: 'records' },
    })
    expect(await push(store)).toEqual(response)
    expect(store.resources(tenant).records).toBe(1)
  })
  it('R19 bounds actual in-flight work even for a saved key and releases every slot', async () => {
    const store = fixture({ ...limits, inFlight: 1 })
    const first = resultDelivery()
    const saved = await push(store, first)
    const second = resultDelivery(tenant, '2')
    store.pauseAt(second.key, 'material')
    const pending = push(store, second)
    await store.reached(second.key, 'material')
    expect(await push(store, first)).toEqual({
      failure: { kind: 'backpressured', resource: 'in-flight' },
    })
    expect(store.resources(tenant).inFlight).toBe(1)
    store.resume(second.key, 'material', committed)
    await pending
    expect(await push(store, first)).toEqual(saved)
    expect(store.resources(tenant).inFlight).toBe(0)
  })
  it('R20 tenant reservations cannot be consumed by another tenant', async () => {
    const reserved = { records: 1, bytes: 3000, attachments: 10, inFlight: 1 }
    const store = createDeliveryFixture<typeof principal>({
      limits: { records: 2, bytes: 6000, attachments: 20, inFlight: 2 },
      tenants: [
        { tenant, reserved },
        { tenant: foreign, reserved },
      ],
    })
    for (const target of [tenant, foreign]) {
      store.establishOriginalCall({
        reference: reference(target),
        consumer,
        dispatches: [dispatch, otherDispatch],
      })
      store.setAccess({ tenant: target, principal }, 'allow')
    }
    expect(await push(store)).toHaveProperty('ok')
    expect(await push(store, resultDelivery(tenant, '2'))).toEqual({
      failure: { kind: 'backpressured', resource: 'records' },
    })
    expect(
      await store.receiver.push({
        access: { tenant: foreign, principal },
        delivery: resultDelivery(foreign),
        signal: new AbortController().signal,
      }),
    ).toHaveProperty('ok')
    for (const target of [tenant, foreign])
      expect(store.resources(target)).toMatchObject({ records: 1, inFlight: 0 })
    expect(store.resources(tenant).bytes + store.resources(foreign).bytes).toBeLessThanOrEqual(6000)
    store.setAccess({ tenant, principal }, 'deny')
    expect(
      await store.receiver.push({
        access: { tenant: foreign, principal },
        delivery: resultDelivery(foreign),
        signal: aborted(),
      }),
    ).toHaveProperty('ok')
  })
  it.each([true, false])(
    'R21 measures actual attachment copies for ref=%s and rejects absent material',
    async ref => {
      const delivery = withAttachment(resultDelivery(), ref)
      const store = fixture()
      expect(await push(store, delivery)).toEqual({
        failure: { kind: 'unavailable', dependency: 'material' },
      })
      expect(store.resources(tenant).records).toBe(0)
      const bytes = new Uint8Array([1, 2, 3, 4])
      store.registerAttachment({ storage: 'store', key: 'blob' }, bytes)
      structuredClone(bytes, { transfer: [bytes.buffer] })
      expect(bytes.byteLength).toBe(0)
      expect(await push(store, delivery)).toHaveProperty('ok')
      expect(store.resources(tenant).attachments).toBe(4)
      for (const allowance of [3, 4, 5]) {
        const limited = fixture({ ...limits, attachments: allowance })
        limited.registerAttachment({ storage: 'store', key: 'blob' }, new Uint8Array(4))
        const response = await push(limited, delivery)
        if (allowance < 4)
          expect(response).toEqual({ failure: { kind: 'backpressured', resource: 'attachments' } })
        else expect(response).toHaveProperty('ok')
      }
    },
  )
  it('R21 deduplicates identical external locations within one envelope and charges inline media as envelope bytes', async () => {
    const store = fixture()
    const external = withAttachment()
    store.registerAttachment({ storage: 'store', key: 'blob' }, new Uint8Array(7))
    const duplicate = { ...external, parts: [...external.parts, ...external.parts] }
    await push(store, duplicate)
    expect(store.resources(tenant).attachments).toBe(7)
    const inline = {
      ...resultDelivery(tenant, '2'),
      parts: [
        {
          kind: 'sealed',
          trims: [],
          block: block({
            kind: 'image',
            id: 'b',
            visibility: { toHuman: true, toModel: true },
            mediaType: 'image/png',
            inline: 'abcdef',
          }),
        },
      ],
    } satisfies ModelDelivery
    await push(store, inline)
    expect(store.resources(tenant).attachments).toBe(7)
    expect(store.resources(tenant).bytes).toBe(
      independentBytes(duplicate) + independentBytes(inline),
    )
  })
  it('rejects invalid budget and control-plane contradictions', async () => {
    for (const invalid of [
      { ...limits, records: -1 },
      { ...limits, bytes: 0 },
      { ...limits, inFlight: 0 },
      { ...limits, attachments: 1.1 },
    ]) {
      expect(() => fixture(invalid)).toThrow('budget')
    }
    expect(() =>
      createDeliveryFixture({
        limits,
        tenants: [
          { tenant, reserved: limits },
          { tenant: foreign, reserved: limits },
        ],
      }),
    ).toThrow('Reservations')
    const store = fixture()
    expect(() =>
      store.establishOriginalCall({
        reference: reference(),
        consumer: { ...consumer, purpose: 'other' },
        dispatches: [dispatch],
      }),
    ).toThrow('Conflicting')
    const delivery = resultDelivery()
    store.pauseAt(delivery.key, 'material')
    expect(() => store.resume(delivery.key, 'material', committed)).toThrow(
      'Invalid fixture resume',
    )
    const pending = push(store, delivery)
    await store.reached(delivery.key, 'material')
    expect(() => store.resolveUnknown(delivery.key, 'material', 'absent')).toThrow('Unproven')
    store.resume(delivery.key, 'material', committed)
    await pending
  })
})

import type { JsonValue } from '@omne-harness/json-text'
it('R12 preserves JsonValue numeric lexemes and object entry order in public push conflicts', async () => {
  const id = block({
    kind: 'text',
    id: 'json',
    text: '',
    visibility: { toHuman: true, toModel: true },
  }).id
  const entries: Extract<JsonValue, { kind: 'object' }>['entries'] = [
    { key: 'a', value: { kind: 'number', lexeme: '1.0' } },
    { key: 'b', value: { kind: 'number', lexeme: '2' } },
  ]
  function jsonDelivery(argumentsValue: JsonValue): ModelDelivery {
    return {
      ...resultDelivery(),
      parts: [
        {
          kind: 'sealed',
          trims: [],
          block: {
            kind: 'tool_call',
            id,
            visibility: { toHuman: true, toModel: true },
            callId: 'tc',
            name: 'tool',
            arguments: argumentsValue,
          },
        },
      ],
    }
  }
  const store = fixture()
  const delivery = jsonDelivery({ kind: 'object', entries })
  await push(store, delivery)
  for (const value of [
    { kind: 'object', entries: [...entries].reverse() },
    {
      kind: 'object',
      entries: [
        { key: 'a', value: { kind: 'number', lexeme: '1' } },
        { key: 'b', value: { kind: 'number', lexeme: '2' } },
      ],
    },
  ] satisfies JsonValue[])
    expect(await push(store, jsonDelivery(value))).toEqual({ failure: { kind: 'conflict' } })
  expect(deliveryBytes(delivery)).toBe(independentBytes(delivery))
})

it('R18 keeps a lost response unknown on abort, then a new authorized request recovers saved before its pre-abort', async () => {
  const store = fixture()
  const delivery = resultDelivery()
  const controller = new AbortController()
  store.dropReplyOnce(delivery.key)
  store.pauseAt(delivery.key, 'reply')
  const original = push(store, delivery, controller.signal)
  await store.reached(delivery.key, 'reply')
  const resources = store.resources(tenant)
  const receipt = store.readRecord(delivery.key)?.evidence
  controller.abort()
  expect(await original).toEqual({ failure: { kind: 'outcome-unknown' } })
  expect(store.resources(tenant)).toEqual(resources)
  expect(store.readRecord(delivery.key)).toMatchObject({
    receiptObserved: false,
    evidence: receipt,
    material: committed,
    responsibility: committed,
  })
  const waiting = push(store, delivery)
  store.resume(delivery.key, 'reply')
  expect(await waiting).toEqual({ failure: { kind: 'outcome-unknown' } })
  expect(store.resources(tenant).inFlight).toBe(0)
  const before = store.events().length
  expect(await push(store, delivery, aborted())).toEqual({
    ok: { key: delivery.key, evidence: receipt },
  })
  expect(
    store
      .events()
      .slice(before)
      .map(item => item.action),
  ).toEqual([
    'qualification',
    'inFlight.acquire',
    'owner.read',
    'dispatches.read',
    'key.read',
    'reply.saved',
    'inFlight.release',
  ])
  expect(commits(store, 'material')).toBe(1)
  expect(commits(store, 'responsibility')).toBe(1)
  expect(store.resources(tenant)).toEqual({ ...resources, inFlight: 0 })
})

it('R24 gives unminted tenant priority in a composite malformed reference and version failure', async () => {
  const delivery = resultDelivery()
  // @ts-expect-error exercise codec precedence with a malformed typed reference
  delivery.key.reference = 'broken'
  const mismatch = {
    ...delivery,
    settlement: { ...delivery.settlement, version: must(decodeResultVersion('mrver_other')) },
  }
  // @ts-expect-error deliberate identity guard probe
  expect(judgeModelDelivery({ tenant: {}, delivery: mismatch })).toEqual({
    failure: { field: 'tenant', reason: 'identity' },
  })
  const store = fixture()
  expect(
    await store.receiver.push({
      // @ts-expect-error deliberate runtime identity rejection
      access: { tenant: {}, principal },
      delivery: mismatch,
      signal: aborted(),
    }),
  ).toEqual({ failure: { kind: 'denied' } })
  expect(queries(store)).toEqual([])
})

it('R02/R07 rejects malformed text before qualification while wrong admission remains hidden', async () => {
  const store = fixture()
  store.setAccess(access, 'deny')
  const malformed = resultDelivery()
  // @ts-expect-error exercise the public invocation codec with malformed typed text
  malformed.key.reference = 'broken'
  expect(await push(store, malformed)).toEqual({
    failure: { kind: 'invalid', field: 'key.reference', reason: 'reference-malformed' },
  })
  const wrongAdmission = resultDelivery()
  expect(
    await push(store, {
      ...wrongAdmission,
      key: { ...wrongAdmission.key, reference: reference(tenant, call, otherAdmission) },
    }),
  ).toEqual({ failure: { kind: 'denied' } })
  expect(queries(store)).toEqual([])
})

it('R12/R16 preserves unknown custody when another body uses its original key', async () => {
  const store = fixture()
  const delivery = resultDelivery()
  await unknown(store, delivery, 'responsibility')
  const before = store.readRecord(delivery.key)
  expect(await push(store, { ...delivery, parts: [] })).toEqual({ failure: { kind: 'conflict' } })
  expect(store.readRecord(delivery.key)).toEqual(before)
})

it('R15 reports known responsibility dependency failure and resumes only that operation', async () => {
  const store = fixture()
  const delivery = resultDelivery()
  store.setDependency('responsibility', 'unavailable')
  expect(await push(store, delivery)).toEqual({
    failure: { kind: 'unavailable', dependency: 'responsibility' },
  })
  expect(store.readRecord(delivery.key)).toMatchObject({
    material: committed,
    responsibility: absent,
  })
  const resources = store.resources(tenant)
  store.setDependency('responsibility', 'available')
  expect(await push(store, delivery)).toHaveProperty('ok')
  expect(commits(store, 'material')).toBe(1)
  expect(commits(store, 'responsibility')).toBe(1)
  expect(store.resources(tenant)).toEqual(resources)
})

it('R18 late responsibility completion remains unknown after abort until its original operation is queried', async () => {
  const store = fixture()
  const delivery = resultDelivery()
  const controller = new AbortController()
  store.pauseAt(delivery.key, 'responsibility')
  const response = push(store, delivery, controller.signal)
  await store.reached(delivery.key, 'responsibility')
  controller.abort()
  expect(await response).toEqual({ failure: { kind: 'outcome-unknown' } })
  expect(store.resources(tenant).inFlight).toBe(1)
  const waiting = push(store, delivery)
  store.resume(delivery.key, 'responsibility', committed)
  expect(await waiting).toEqual({ failure: { kind: 'outcome-unknown' } })
  expect(store.resources(tenant).inFlight).toBe(0)
  expect(store.readRecord(delivery.key)).toMatchObject({
    material: committed,
    responsibility: { actual: 'committed', observed: 'unknown' },
    dedup: true,
    protected: true,
  })
  store.resolveUnknown(delivery.key, 'responsibility', 'committed')
  expect(await push(store, delivery)).toHaveProperty('ok')
  expect(commits(store, 'responsibility')).toBe(1)
})

it('R18 a fully confirmed receipt remains saved when abort interrupts only its output wait', async () => {
  const store = fixture()
  const delivery = resultDelivery()
  const controller = new AbortController()
  store.pauseAt(delivery.key, 'reply')
  const response = push(store, delivery, controller.signal)
  await store.reached(delivery.key, 'reply')
  controller.abort()
  const receipt = must(await response)
  expect(receipt.key).toEqual(delivery.key)
  expect(store.readRecord(delivery.key)?.receiptObserved).toBe(true)
  expect(store.resources(tenant).inFlight).toBe(1)
  const waiting = push(store, delivery)
  store.resume(delivery.key, 'reply')
  expect(await waiting).toEqual({ ok: receipt })
  expect(store.resources(tenant).inFlight).toBe(0)
})
