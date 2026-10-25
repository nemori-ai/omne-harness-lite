// The ToolResultReceiver conformance suite (SPEC「结果推送与保存」, J02) and a non-durable double
// that conforms to it. A receiver is implemented by a consumer owner; the suite checks recall,
// conflict, the tenant carried by the invocation reference, the relation table, cancellation and
// the per-tenant capacity. The double keeps its records in memory and declares
// `durability: 'none'`: a saved receipt of it proves nothing about durable custody.
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

/**
 * What the receiver suite needs. A fresh fixture serves one case. `consumer` is a consumer position
 * that the receiver registered, so a push to it is accepted when nothing else is wrong. The
 * receiver answers each push definitely in this suite: no fault is injected. `tenantCapacity` is
 * how many new keys one tenant may hold before a further new key is backpressured; the capacity
 * case is reported not applicable without it, and the cases that need a second tenant without
 * `otherAccess`.
 */
export interface ToolResultReceiverFixture<P> {
  readonly receiver: ToolResultReceiver<P, ContentBlock>
  readonly access: Access<P>
  readonly otherAccess?: Access<P>
  readonly consumer: ConsumerRef
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

/** A legal result push of `call` under `access`, version `version`, with text `text`. */
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
  // A field the caller keeps a mutable handle on, and changes after the push.
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
  // The push names a reference of the other tenant under the own access: the tenant comes from the
  // reference, never from the destination, so the push is denied and saves nothing.
  const foreign = other.result('call-1')
  const denied = failureOf(await own.push(foreign), 'push of a reference of another tenant')
  assert.equal(denied.kind, 'denied')
  await other.saved(foreign, 'push of the same delivery by its tenant')
}

async function tenantInKey<P>(fixture: Fixture<P>): Promise<void> {
  const own = scene(fixture)
  const other = scene(fixture, otherAccessOf(fixture))
  const first = await own.saved(own.result('call-1', 'result-1', 'one'), 'push of the tenant')
  // The same call and version of another tenant is another key: no conflict, no recall.
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
  await s.saved(account, 'push of the legal account')
}

async function cancelledBeforeAccept<P>(fixture: Fixture<P>): Promise<void> {
  const s = scene(fixture)
  const aborted = new AbortController()
  aborted.abort()
  const cancelled = failureOf(await s.push(s.result('call-1'), aborted.signal), 'aborted new key')
  assert.equal(cancelled.kind, 'cancelled-before-accept')
  const receipt = await s.saved(s.result('call-1'), 'push after the cancellation')
  // A key already saved is recalled even when the signal is aborted.
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
  // One tenant at its share does not block another, and a resend takes no new share.
  await other.saved(other.result('call-over'), 'push of another tenant')
  assert.deepEqual(await own.saved(own.result('call-0'), 'resend at capacity'), receipts[0])
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
    named('a reference of another tenant is denied and saves nothing', foreignReference),
    named('the tenant of the reference is part of the key', tenantInKey),
    named('a malformed reference is invalid', malformedReference),
    named('the relation table rejects another revision and another call', relationTable),
    named(
      'an aborted signal cancels a new key and still recalls a saved one',
      cancelledBeforeAccept,
    ),
    named('one tenant at its capacity is backpressured without blocking another', tenantCapacity),
  ]
}

// ---------------------------------------------------------------------------------------------
// The non-durable double
// ---------------------------------------------------------------------------------------------

export interface MemoryToolResultReceiver<P> extends ToolResultReceiver<P, ContentBlock> {
  readonly durability: 'none'
}

type Stored = Readonly<{ delivery: ToolDelivery<ContentBlock>; receipt: ToolSavedReceipt }>

/**
 * A receiver that keeps its records in memory, for the consumer positions of `owner`. Each tenant
 * holds at most `tenantCapacity` keys; a resend takes no new share. Every push runs to its end
 * before the next one, and the receiver copies the payload before it looks at it.
 */
export function createMemoryToolResultReceiver<P>(
  input: Readonly<{ owner: string; tenantCapacity: number }>,
): MemoryToolResultReceiver<P> {
  const records = new Map<string, Stored>()
  const held = new Map<string, number>()
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
    if (delivery.consumer.owner !== input.owner)
      return answer(fail({ kind: 'invalid', field: 'consumer', reason: 'not-original' }))
    const judged = judgeToolDelivery({ tenant: request.access.tenant, delivery })
    if ('failure' in judged)
      return answer(
        fail({ kind: 'invalid', field: judged.failure.field, reason: judged.failure.reason }),
      )
    const tenant = tenantKey(request.access.tenant)
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
    held.set(tenant, share + 1)
    return answer(succeed(receipt))
  }
  return Object.freeze({ push, durability: 'none' as const })
}

/** A fresh fixture over a fresh in-memory receiver with a capacity of two keys per tenant. */
export function memoryToolResultReceiverFixture(): ToolResultReceiverFixture<string> {
  const owner = 'conformance-receiver'
  return {
    receiver: createMemoryToolResultReceiver<string>({ owner, tenantCapacity: 2 }),
    access: memoryAccess('tester'),
    otherAccess: memoryOtherAccess('tester-other'),
    consumer: { owner, work: 'work-1', position: 'position-1', purpose: 'result' },
    tenantCapacity: 2,
  }
}
