import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import type { CallAccount } from '@omne-harness/call-account'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolDeliveryId,
  decodeToolResultVersion,
  type Access,
  type ConsumerRef,
  type ToolCallId,
} from './identity.ts'
import { encodeToolInvocationRef, resolveToolInvocationRef } from './reference.ts'
import type { ToolInvocationRef } from './reference.ts'
import {
  judgeToolDelivery,
  type ToolDelivery,
  type ToolDeliveryFailure,
  type ToolResultReceiver,
  type ToolSavedReceipt,
} from './result-delivery.ts'
import { conformanceCase, handle, otherAccessOf, type ConformanceCase } from './testing-case.ts'
import {
  callId,
  digestOf,
  evidence,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  tenantKey,
  textResult,
} from './testing-values.ts'

export interface ToolResultReceiverFixture<P> {
  readonly receiver: ToolResultReceiver<P, ContentBlock>
  readonly access: Access<P>
  readonly otherAccess?: Access<P>
  readonly consumer: ConsumerRef
  readonly otherConsumer?: ConsumerRef
  readonly strangerAccess?: Access<P>
  readonly tenantCapacity?: number
}

type Fixture<P> = ToolResultReceiverFixture<P>
type Push = Outcome<ToolSavedReceipt, ToolDeliveryFailure>

function minted<T>(decoded: { ok: T } | { failure: unknown }, text: string): T {
  if ('failure' in decoded) throw new Error(`conformance value is not legal: ${text}`)
  return decoded.ok
}

function referenceOf(access: Access<unknown>, call: ToolCallId): ToolInvocationRef {
  const encoded = encodeToolInvocationRef({
    tenant: access.tenant,
    call,
    admission: operationId(`${call}/admission`),
  })
  return minted(encoded, `reference of ${call}`)
}

function accountOf(call: string, revision: string): CallAccount {
  return {
    subject: { kind: 'tool_execution', id: call },
    usage: [],
    cost: [{ state: 'unknown', unit: 'USD', source: 'observation' }],
    trimmed: { state: 'known', lexeme: '0', unit: 'token' },
    place: 'conformance',
    duration: 'PT1S',
    receipt: 'received',
    revision,
  }
}

function resultDelivery(
  access: Access<unknown>,
  consumer: ConsumerRef,
  name: string,
  version = 'result-1',
  text = 'done',
): Extract<ToolDelivery<ContentBlock>, { kind: 'result' }> {
  const call = callId(name)
  return {
    kind: 'result',
    key: {
      kind: 'result',
      producer: 'tool',
      reference: referenceOf(access, call),
      result: minted(decodeToolResultVersion(version), version),
    },
    consumer,
    delivery: minted(decodeToolDeliveryId(`${name}/${version}`), version),
    relation: 'original',
    terminal: { kind: 'completed' },
    actualTerminal: null,
    effect: { kind: 'occurred', evidence: evidence('effect') },
    source: evidence(`result-source/${name}/${version}`),
    value: textResult(text),
    account: accountOf(call, '1'),
  }
}

function accountDelivery(
  access: Access<unknown>,
  consumer: ConsumerRef,
  name: string,
  revision: string,
): Extract<ToolDelivery<ContentBlock>, { kind: 'account' }> {
  const call = callId(name)
  return {
    kind: 'account',
    key: {
      kind: 'account',
      producer: 'tool',
      reference: referenceOf(access, call),
      event: 'meter-1',
      revision,
    },
    consumer,
    account: accountOf(call, revision),
  }
}

function scene<P>(fixture: Fixture<P>, access: Access<P> = fixture.access) {
  const push = (delivery: ToolDelivery<ContentBlock>, signal = new AbortController().signal) =>
    fixture.receiver.push({ access, delivery, signal })
  return {
    result: (name: string, version?: string, text?: string) =>
      resultDelivery(access, fixture.consumer, name, version, text),
    account: (name: string, revision: string) =>
      accountDelivery(access, fixture.consumer, name, revision),
    push,
    saved: async (delivery: ToolDelivery<ContentBlock>, what: string): Promise<ToolSavedReceipt> =>
      savedOf(await push(delivery), what),
  }
}

function savedOf(answer: Push, what: string): ToolSavedReceipt {
  if ('failure' in answer)
    assert.fail(`${what}: expected saved, got ${JSON.stringify(answer.failure)}`)
  return answer.ok
}

function failureOf(answer: Push, what: string): ToolDeliveryFailure {
  if ('ok' in answer) assert.fail(`${what}: expected a failure, got saved`)
  return answer.failure
}

async function savedReceipt<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const delivery = s.result('call-1')
  const receipt = await s.saved(delivery, 'push')
  assert.deepEqual(receipt.key, delivery.key, 'the receipt names the key of the push')
  assert.equal(
    receipt.evidence.owner,
    fixture.consumer.owner,
    'the consumer owner owns the evidence',
  )
}

async function sameKeyRecalls<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const first = await s.saved(s.result('call-1'), 'push')
  assert.deepEqual(await s.saved(s.result('call-1'), 'push again'), first, 'the resend recalls')
}

async function sameKeyConflicts<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const first = await s.saved(s.result('call-1', 'result-1', 'one'), 'push')
  const other = failureOf(await s.push(s.result('call-1', 'result-1', 'two')), 'other content')
  assert.equal(other.kind, 'conflict')
  assert.deepEqual(await s.saved(s.result('call-1', 'result-1', 'one'), 'push again'), first)
}

async function keptOwnCopy<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const source = { owner: 'conformance', record: 'source-1', revision: '1', digest: 'sha256:1' }
  const first = await s.saved({ ...s.result('call-1'), source }, 'push')
  source.record = 'changed'
  const original = { ...source, record: 'source-1' }
  assert.deepEqual(
    await s.saved({ ...s.result('call-1'), source: original }, 'push of the original'),
    first,
    'the receiver kept a copy',
  )
}

async function foreignReference<P>(fixture: Fixture<P>): Promise<void> {
  const own = scene(fixture)
  const other = scene(fixture, otherAccessOf(fixture))
  const theirs = await other.saved(
    other.result('call-1', 'result-1', 'one'),
    'push of the other tenant',
  )
  const mine = await own.saved(
    own.result('call-1', 'result-1', 'two'),
    'push of other content under the same key by the own tenant',
  )
  assert.notDeepEqual(mine, theirs, 'the pusher recalled the receipt of another tenant')
}

async function tenantInKey<P>(fixture: Fixture<P>): Promise<void> {
  const own = scene(fixture)
  const other = scene(fixture, otherAccessOf(fixture))
  const first = await own.saved(own.result('call-1', 'result-1', 'one'), 'push of the tenant')
  const second = await other.saved(
    other.result('call-1', 'result-1', 'two'),
    'push of another tenant',
  )
  assert.notDeepEqual(second, first, 'the other tenant recalled the receipt of a tenant')
}

async function malformedReference<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const delivery = s.result('call-1')
  const broken = {
    ...delivery,
    key: { ...delivery.key, reference: '["tool-invocation",9]' as ToolInvocationRef },
  }
  const invalid = failureOf(await s.push(broken), 'push of a malformed reference')
  assert.deepEqual(invalid, {
    kind: 'invalid',
    field: 'key.reference',
    reason: 'reference-malformed',
  })
}

async function relationTable<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const account = s.account('call-1', '2')
  const revision = failureOf(
    await s.push({ ...account, key: { ...account.key, revision: '3' } }),
    'push of an account whose key names another revision',
  )
  assert.deepEqual(revision, {
    kind: 'invalid',
    field: 'key.revision',
    reason: 'revision-mismatch',
  })
  const result = s.result('call-1')
  const subject = failureOf(
    await s.push({ ...result, account: accountOf('call-other', '1') }),
    'push of a result whose account belongs to another call',
  )
  assert.deepEqual(subject, { kind: 'invalid', field: 'account.subject', reason: 'call-mismatch' })
  await s.saved(result, 'push of the legal result')
}

async function unqualifiedReceiver<P>(fixture: Fixture<P>): Promise<void> {
  const stranger = handle(fixture.strangerAccess, 'strangerAccess')
  const own = scene(fixture)
  const denied = failureOf(
    await scene(fixture, stranger).push(own.result('call-1', 'result-1', 'one')),
    'push by a principal of the tenant without receiving qualification',
  )
  assert.equal(denied.kind, 'denied')
  await own.saved(own.result('call-1', 'result-1', 'two'), 'push by the qualified principal')
}

async function cancelledBeforeAccept<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const aborted = new AbortController()
  aborted.abort()
  const cancelled = failureOf(await s.push(s.result('call-1'), aborted.signal), 'aborted new key')
  assert.equal(cancelled.kind, 'cancelled-before-accept')
  const receipt = await s.saved(s.result('call-1'), 'push after the cancellation')
  assert.deepEqual(
    savedOf(await s.push(s.result('call-1'), aborted.signal), 'aborted resend'),
    receipt,
  )
}

async function tenantCapacity<P>(fixture: Fixture<P>): Promise<void> {
  const capacity = handle(fixture.tenantCapacity, 'tenantCapacity')
  const own = scene(fixture)
  const other = scene(fixture, otherAccessOf(fixture))
  const receipts: ToolSavedReceipt[] = []
  for (let index = 0; index < capacity; index += 1)
    receipts.push(await own.saved(own.result(`call-${index}`), `push ${index}`))
  const full = failureOf(await own.push(own.result('call-over')), 'push over the capacity')
  assert.equal(full.kind, 'backpressured')
  await other.saved(other.result('call-over'), 'push of another tenant')
  assert.deepEqual(await own.saved(own.result('call-0'), 'resend at capacity'), receipts[0])
}

async function notAccepted<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const stranger = {
    ...fixture.consumer,
    position: `${fixture.consumer.position}-never-registered`,
  }
  const invalid = failureOf(
    await s.push({ ...s.result('call-1'), consumer: stranger }),
    'push to a position without the original association',
  )
  assert.deepEqual(invalid, { kind: 'invalid', field: 'key.reference', reason: 'not-accepted' })
  await s.saved(s.result('call-1'), 'push to the registered position')
}

async function notOriginal<P>(fixture: Fixture<P>): Promise<void> {
  const other = handle(fixture.otherConsumer, 'otherConsumer')
  const s = scene(fixture)
  await s.saved(s.result('call-1'), 'push of the result')
  const invalid = failureOf(
    await s.push({ ...s.account('call-1', '2'), consumer: other }),
    'push of the same call to another position',
  )
  assert.deepEqual(invalid, { kind: 'invalid', field: 'consumer', reason: 'not-original' })
  await s.saved(s.account('call-1', '2'), 'push of the account to the original position')
}

export function toolResultReceiverConformance<P>(): readonly ConformanceCase<Fixture<P>>[] {
  const named = (name: string, run: (fixture: Fixture<P>) => Promise<void>) =>
    conformanceCase('结果推送与保存', name, run)
  return [
    named(
      'a legal push returns saved with its key and the consumer owner as evidence owner',
      savedReceipt,
    ),
    named('a push of the same key and content recalls the original receipt', sameKeyRecalls),
    named(
      'a push of the same key with other content is a conflict that keeps the original',
      sameKeyConflicts,
    ),
    named('the receiver keeps its own copy of the payload', keptOwnCopy),
    named('a key saved by another tenant is unknown to the pusher', foreignReference),
    named('the tenant of the reference is part of the key', tenantInKey),
    named('a malformed reference is invalid', malformedReference),
    named('the relation table rejects another revision and another call', relationTable),
    named(
      'an aborted signal cancels a new key and still recalls a saved one',
      cancelledBeforeAccept,
    ),
    named('one tenant at its capacity is backpressured without blocking another', tenantCapacity),
    named('a push to a position without the original association is invalid', notAccepted),
    named('a push of a call to another position than its original is invalid', notOriginal),
    named(
      'a principal without receiving qualification is denied and saves nothing',
      unqualifiedReceiver,
    ),
  ]
}

export interface MemoryToolResultReceiver<P> extends ToolResultReceiver<P, ContentBlock> {
  readonly durability: 'none'
}

type Stored = Readonly<{ delivery: ToolDelivery<ContentBlock>; receipt: ToolSavedReceipt }>

export function createMemoryToolResultReceiver<P>(
  input: Readonly<{
    consumers: readonly ConsumerRef[]
    tenantCapacity: number
    qualifies: (access: Access<P>) => boolean
  }>,
): MemoryToolResultReceiver<P> {
  const records = new Map<string, Stored>()
  const held = new Map<string, number>()
  const bound = new Map<string, ConsumerRef>()
  let minted = 0

  const push: ToolResultReceiver<P, ContentBlock>['push'] = request => {
    const delivery = structuredClone(request.delivery)
    const answer = (outcome: Push) => Promise.resolve(outcome)
    const resolved = resolveToolInvocationRef(delivery.key.reference, request.access.tenant)
    if ('failure' in resolved)
      return answer(
        resolved.failure.kind === 'malformed'
          ? fail({ kind: 'invalid', field: 'key.reference', reason: 'reference-malformed' })
          : fail({ kind: 'denied' }),
      )
    if (!input.qualifies(request.access)) return answer(fail({ kind: 'denied' }))
    if (!input.consumers.some(consumer => isDeepStrictEqual(consumer, delivery.consumer)))
      return answer(fail({ kind: 'invalid', field: 'key.reference', reason: 'not-accepted' }))
    const tenant = tenantKey(request.access.tenant)
    const call = JSON.stringify([tenant, resolved.ok.call])
    const original = bound.get(call)
    if (original !== undefined && !isDeepStrictEqual(original, delivery.consumer))
      return answer(fail({ kind: 'invalid', field: 'consumer', reason: 'not-original' }))
    const judged = judgeToolDelivery({ tenant: request.access.tenant, delivery })
    if ('failure' in judged)
      return answer(
        fail({ kind: 'invalid', field: judged.failure.field, reason: judged.failure.reason }),
      )
    const key = JSON.stringify(
      delivery.key.kind === 'result'
        ? [tenant, delivery.key.producer, 'result', resolved.ok.call, delivery.key.result]
        : [
            tenant,
            delivery.key.producer,
            'account',
            resolved.ok.call,
            delivery.key.event,
            delivery.key.revision,
          ],
    )
    const known = records.get(key)
    if (known !== undefined)
      return answer(
        isDeepStrictEqual(known.delivery, delivery)
          ? succeed(known.receipt)
          : fail({ kind: 'conflict' }),
      )
    if (request.signal.aborted) return answer(fail({ kind: 'cancelled-before-accept' }))
    const share = held.get(tenant) ?? 0
    if (share >= input.tenantCapacity)
      return answer(fail({ kind: 'backpressured', resource: 'records' }))
    minted += 1
    const receipt: ToolSavedReceipt = Object.freeze({
      key: delivery.key,
      evidence: Object.freeze({
        owner: delivery.consumer.owner,
        record: `receiver/${minted}`,
        revision: '1',
        digest: digestOf(delivery),
      }),
    })
    records.set(key, Object.freeze({ delivery, receipt }))
    if (original === undefined) bound.set(call, delivery.consumer)
    held.set(tenant, share + 1)
    return answer(succeed(receipt))
  }
  return Object.freeze({ push, durability: 'none' as const })
}

export function memoryToolResultReceiverFixture(): ToolResultReceiverFixture<string> {
  const owner = 'conformance-receiver'
  const consumer = { owner, work: 'work-1', position: 'position-1', purpose: 'result' }
  const otherConsumer = { ...consumer, position: 'position-2' }
  const access = memoryAccess('tester')
  const otherAccess = memoryOtherAccess('tester-other')
  const grants = new Set(
    [access, otherAccess].map(granted =>
      JSON.stringify([granted.principal, tenantKey(granted.tenant)]),
    ),
  )
  return {
    receiver: createMemoryToolResultReceiver<string>({
      consumers: [consumer, otherConsumer],
      tenantCapacity: 2,
      qualifies: presented =>
        grants.has(JSON.stringify([presented.principal, tenantKey(presented.tenant)])),
    }),
    access,
    otherAccess,
    strangerAccess: memoryAccess('tester-stranger'),
    consumer,
    otherConsumer,
    tenantCapacity: 2,
  }
}
