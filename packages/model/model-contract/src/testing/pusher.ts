// The push-producer double: it wraps a scripted provider and, when the script settles a call,
// freezes the result through the public face and pushes it to the receiver that the test
// resolves for the consumer owner. It keeps the delivery keys and the frozen payload, redelivers
// on an unknown outcome, takes the ACK through the retained handoff after `saved`, and pushes
// late accounts only after the result is saved. It reads no internal state of the provider.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { CallAccount } from '@omne-harness/call-account'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  AckReceipt,
  ConsumerRef,
  DispatchId,
  ModelCallId,
  ModelDelivery,
  ModelDeliveryFailure,
  ModelDeliveryKey,
  ModelFailure,
  ModelInvocationRef,
  ModelOperationId,
  ModelResultReceiver,
  ModelSavedReceipt,
  ResultPart,
  ResultVersion,
} from '../index.ts'
import type { ModelProvider } from '../provider/index.ts'
import { decodeModelOperationId, MODEL_IDENTITY_PREFIXES } from '../identity-values.ts'
import type { ScriptController, ScriptedCall } from './controller.ts'
import { ScriptedModelError } from './error.ts'
import type { ScriptedModelProvider } from './provider.ts'
import { frozenCopy, laterDecimal, sameValue } from './values.ts'

export type ScriptedResultPusherOptions<P> = Readonly<{
  /** The scripted provider the double wraps. */
  scripted: ScriptedModelProvider<P>
  /** The principal the double acts as when it reads the call, pushes and acknowledges. */
  principal: P
  /** The receiver of a consumer owner, or null when the owner has none. */
  resolveReceiver: (owner: ConsumerRef['owner']) => ModelResultReceiver<P> | null
  /** How often a delivery is pushed again on `outcome-unknown` before it stays unknown: 3. */
  maxRedeliveries?: number
}>

/** Why a delivery failed; `rejected` carries the receiver's own failure, which is never unknown. */
export type PushFailure =
  | Readonly<{ kind: 'no-receiver' }>
  | Readonly<{ kind: 'receipt-key-mismatch'; receipt: ModelSavedReceipt }>
  | Readonly<{
      kind: 'rejected'
      failure: Exclude<ModelDeliveryFailure, { kind: 'outcome-unknown' }>
    }>
  | Readonly<{ kind: 'not-frozen'; step: 'inspect' | 'dispatches' | 'read'; reason: string }>
  | Readonly<{ kind: 'threw'; error: unknown }>

/** One delivery by key. `delivery` is null only while the payload has not been frozen yet. */
export type PushRecord = Readonly<{
  key: ModelDeliveryKey
  delivery: ModelDelivery | null
  attempts: number
}> &
  (
    | Readonly<{ status: 'pending' }>
    | Readonly<{ status: 'saved'; receipt: ModelSavedReceipt }>
    | Readonly<{ status: 'failed'; failure: PushFailure }>
    | Readonly<{ status: 'unknown' }>
  )

/** One acknowledgement attempt; `attempt` counts the attempts of the same call from 1. */
export type AckRecord = Readonly<{
  call: ScriptedCall
  operation: ModelOperationId
  result: ResultVersion
  attempt: number
  reply: Outcome<AckReceipt, ModelFailure>
}>

export type ScriptedResultPusher<P> = Readonly<{
  /** The wrapped provider: admit through it, so the double learns the admission of each call. */
  provider: ModelProvider<P>
  /** The wrapped controller: `settle` pushes the result, `recordDispatch` pushes a late account. */
  controller: ScriptController<P>
  deliveries(): readonly PushRecord[]
  /** Resolves with the result delivery of the call once it, its ACK and its queued accounts are done. */
  settled(call: ScriptedCall): Promise<PushRecord>
  /** Pushes the delivery with this key again, with the original key and frozen payload. */
  redeliver(key: ModelDeliveryKey): Promise<PushRecord>
  acknowledgements(): readonly AckRecord[]
}>

type Record = {
  readonly slot: Slot
  readonly key: ModelDeliveryKey
  delivery: ModelDelivery | null
  attempts: number
  status: PushRecord['status']
  receipt: ModelSavedReceipt | null
  failure: PushFailure | null
}

type Slot = {
  readonly tenant: TenantId
  readonly call: ModelCallId
  admission: Readonly<{ operation: ModelOperationId; reference: ModelInvocationRef }> | null
  operations: Readonly<{ read: ModelOperationId; ack: ModelOperationId }> | null
  result: Record | null
  consumer: ConsumerRef | null
  /** The account revision frozen or pushed for each dispatch; null for a dispatch without one. */
  readonly accounted: Map<DispatchId, string | null>
  readonly lateAccounts: Readonly<{ dispatch: DispatchId; account: CallAccount }>[]
  acknowledged: boolean
  ackAttempts: number
  /** Resolves when the result delivery first reaches a terminal state. */
  readonly terminal: PromiseWithResolvers<void>
  /** The delivery work of the call, one task after the other; it never rejects. */
  chain: Promise<void>
  error: unknown
  failed: boolean
}

function misuse(message: string): ScriptedModelError {
  return new ScriptedModelError('invalid-script', message)
}

function tenantText(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw misuse('the tenant is not a legal identity')
  return encoded.value
}

/** The operation `mop_<kind>-<call body>`: the same call always gets the same operation. */
function mintOperation(kind: 'ack' | 'push-read', call: ModelCallId): ModelOperationId {
  const body = call.slice(MODEL_IDENTITY_PREFIXES.ModelCallId.length)
  const decoded = decodeModelOperationId(
    `${MODEL_IDENTITY_PREFIXES.ModelOperationId}${kind}-${body}`,
  )
  if ('failure' in decoded)
    throw misuse(`the call ${call} gives no ${kind} operation: ${decoded.failure.reason}`)
  return decoded.ok
}

function snapshotOf(record: Record): PushRecord {
  const base = { key: record.key, delivery: record.delivery, attempts: record.attempts }
  switch (record.status) {
    case 'pending':
    case 'unknown':
      return frozenCopy({ ...base, status: record.status })
    case 'saved':
      if (record.receipt === null) throw new Error('a saved delivery has no receipt')
      return frozenCopy({ ...base, status: 'saved', receipt: record.receipt })
    case 'failed':
      if (record.failure === null) throw new Error('a failed delivery has no failure')
      return frozenCopy({ ...base, status: 'failed', failure: record.failure })
  }
}

export function createScriptedResultPusher<P>(
  options: ScriptedResultPusherOptions<P>,
): ScriptedResultPusher<P> {
  const { scripted, principal, resolveReceiver } = options
  const maxRedeliveries = options.maxRedeliveries ?? 3
  if (!Number.isSafeInteger(maxRedeliveries) || maxRedeliveries < 0)
    throw misuse('maxRedeliveries must be a non-negative integer')
  const inner = scripted.controller
  const { calls, consumption, instances } = scripted.provider.runtime
  const slots = new Map<string, Slot>()
  const records: Record[] = []
  const acks: AckRecord[] = []

  function slotOf({ tenant, call }: ScriptedCall): Slot {
    const key = JSON.stringify([tenantText(tenant), call])
    const known = slots.get(key)
    if (known !== undefined) return known
    const slot: Slot = {
      tenant,
      call,
      admission: null,
      operations: null,
      result: null,
      consumer: null,
      accounted: new Map(),
      lateAccounts: [],
      acknowledged: false,
      ackAttempts: 0,
      terminal: Promise.withResolvers<void>(),
      chain: Promise.resolve(),
      error: null,
      failed: false,
    }
    slots.set(key, slot)
    return slot
  }

  /** Runs `task` after the earlier work of the call; the chain itself never rejects. */
  function run<T>(slot: Slot, task: () => Promise<T>): Promise<T> {
    const result = slot.chain.then(task)
    slot.chain = result.then(
      () => undefined,
      (error: unknown) => {
        slot.failed = true
        slot.error = error
      },
    )
    return result
  }

  function fail(record: Record, failure: PushFailure): void {
    record.status = 'failed'
    record.failure = failure
    record.receipt = null
  }

  function accessOf(slot: Slot) {
    return { tenant: slot.tenant, principal }
  }

  /** The ordered parts of the settled result, read page by page with the call's read operation. */
  async function readParts(
    slot: Slot,
    reference: ModelInvocationRef,
    operation: ModelOperationId,
    result: ResultVersion,
  ): Promise<Outcome<ResultPart[], string>> {
    const access = accessOf(slot)
    const start = await consumption.beginRead({ ...access, reference, operation, result })
    if ('failure' in start) return { failure: JSON.stringify(start.failure) }
    if (start.ok.kind === 'acknowledged') return { failure: 'the result was already acknowledged' }
    const read = start.ok.read
    const parts: ResultPart[] = []
    let state = start.ok.value
    for (;;) {
      if (state.kind === 'ended') return { failure: `the read ended as ${state.reason}` }
      parts.push(...state.page.parts)
      if (state.page.next === null) break
      const next = await consumption.readNext({
        ...access,
        call: slot.call,
        read,
        after: state.page.next,
      })
      if ('failure' in next) return { failure: JSON.stringify(next.failure) }
      state = next.ok
    }
    const closed = await consumption.closeRead({ ...access, call: slot.call, read })
    if ('failure' in closed) return { failure: JSON.stringify(closed.failure) }
    return { ok: parts }
  }

  /** Composes and freezes the result delivery through the public face; false when it cannot. */
  async function freeze(slot: Slot, record: Record): Promise<boolean> {
    if (slot.admission === null || slot.operations === null || record.key.kind !== 'result')
      throw new Error('a result record of a call without admission')
    const { reference } = slot.admission
    const access = accessOf(slot)
    const lookup = await calls.inspect({ ...access, reference })
    if ('failure' in lookup) {
      fail(record, { kind: 'not-frozen', step: 'inspect', reason: JSON.stringify(lookup.failure) })
      return false
    }
    if (lookup.ok.kind !== 'found' || lookup.ok.state.phase !== 'settled') {
      fail(record, { kind: 'not-frozen', step: 'inspect', reason: 'the call is not settled' })
      return false
    }
    const state = lookup.ok.state
    const dispatches = await calls.dispatches({ ...access, call: slot.call })
    if ('failure' in dispatches) {
      fail(record, {
        kind: 'not-frozen',
        step: 'dispatches',
        reason: JSON.stringify(dispatches.failure),
      })
      return false
    }
    const parts = await readParts(slot, reference, slot.operations.read, record.key.result)
    if ('failure' in parts) {
      fail(record, { kind: 'not-frozen', step: 'read', reason: parts.failure })
      return false
    }
    const delivery = frozenCopy<ModelDelivery>({
      kind: 'result',
      key: record.key,
      consumer: state.consumer,
      settlement: state.settlement,
      parts: parts.ok,
      accounts: dispatches.ok.map(item => ({ dispatch: item.dispatch, account: item.account })),
    })
    for (const item of dispatches.ok)
      slot.accounted.set(item.dispatch, item.account?.revision ?? null)
    slot.consumer = delivery.consumer
    record.delivery = delivery
    return true
  }

  /** Pushes the frozen delivery until it is saved, fails, or stays unknown after the redeliveries. */
  async function deliver(record: Record): Promise<void> {
    const { slot } = record
    const delivery = record.delivery
    if (delivery === null) throw new Error('a delivery is pushed before it was frozen')
    record.status = 'pending'
    let receiver: ModelResultReceiver<P> | null
    try {
      receiver = resolveReceiver(delivery.consumer.owner)
    } catch (error) {
      fail(record, { kind: 'threw', error })
      return
    }
    if (receiver === null) {
      fail(record, { kind: 'no-receiver' })
      return
    }
    for (let redeliveries = 0; ; redeliveries += 1) {
      record.attempts += 1
      let outcome: Outcome<ModelSavedReceipt, ModelDeliveryFailure>
      try {
        outcome = await receiver.push({
          access: accessOf(slot),
          delivery,
          signal: new AbortController().signal,
        })
      } catch (error) {
        fail(record, { kind: 'threw', error })
        return
      }
      if ('ok' in outcome) {
        const receipt = frozenCopy(outcome.ok)
        if (sameValue(receipt.key, record.key)) {
          record.status = 'saved'
          record.receipt = receipt
          record.failure = null
        } else fail(record, { kind: 'receipt-key-mismatch', receipt })
        return
      }
      if (outcome.failure.kind !== 'outcome-unknown') {
        fail(record, { kind: 'rejected', failure: outcome.failure })
        return
      }
      if (redeliveries >= maxRedeliveries) {
        record.status = 'unknown'
        record.receipt = null
        record.failure = null
        return
      }
    }
  }

  /** Takes the ACK of a saved result through the retained handoff, resending on `commit-unknown`. */
  async function acknowledge(slot: Slot, record: Record): Promise<void> {
    if (slot.acknowledged || record.receipt === null || record.key.kind !== 'result') return
    if (slot.operations === null) throw new Error('a saved result of a call without operations')
    const operation = slot.operations.ack
    const result = record.key.result
    for (let resends = 0; ; resends += 1) {
      const reply = await consumption.acknowledge({
        ...accessOf(slot),
        call: slot.call,
        operation,
        result,
        evidence: { kind: 'retained', custody: record.receipt.evidence },
      })
      slot.ackAttempts += 1
      acks.push(
        frozenCopy({
          call: { tenant: slot.tenant, call: slot.call },
          operation,
          result,
          attempt: slot.ackAttempts,
          reply,
        }),
      )
      if ('ok' in reply) {
        slot.acknowledged = true
        return
      }
      if (reply.failure.kind !== 'commit-unknown' || resends >= maxRedeliveries) return
    }
  }

  /** Pushes the queued late accounts of a call whose result is saved, in arrival order. */
  async function flushAccounts(slot: Slot): Promise<void> {
    if (slot.result?.status !== 'saved' || slot.admission === null || slot.consumer === null) return
    const { reference } = slot.admission
    for (;;) {
      const late = slot.lateAccounts.shift()
      if (late === undefined) return
      const known = slot.accounted.get(late.dispatch)
      if (known !== undefined && known !== null && !laterDecimal(late.account.revision, known))
        continue
      slot.accounted.set(late.dispatch, late.account.revision)
      const key: ModelDeliveryKey = {
        kind: 'account',
        reference,
        dispatch: late.dispatch,
        revision: late.account.revision,
      }
      const record: Record = {
        slot,
        key,
        delivery: frozenCopy<ModelDelivery>({
          kind: 'account',
          key,
          consumer: slot.consumer,
          account: late.account,
        }),
        attempts: 0,
        status: 'pending',
        receipt: null,
        failure: null,
      }
      records.push(record)
      await deliver(record)
    }
  }

  /** After a push of a result: the ACK when it is saved, then the accounts that waited for it. */
  async function afterResult(slot: Slot, record: Record): Promise<void> {
    if (record.status !== 'saved') return
    await acknowledge(slot, record)
    await flushAccounts(slot)
  }

  const controller: ScriptController<P> = {
    start: input => inner.start(input),
    emit: input => inner.emit(input),
    settle(input) {
      const slot = slotOf(input)
      if (slot.admission === null)
        throw misuse(`the call ${input.call} was not admitted through the pusher`)
      slot.operations ??= {
        read: mintOperation('push-read', input.call),
        ack: mintOperation('ack', input.call),
      }
      inner.settle(input)
      const record: Record = {
        slot,
        key: { kind: 'result', reference: slot.admission.reference, result: input.version },
        delivery: null,
        attempts: 0,
        status: 'pending',
        receipt: null,
        failure: null,
      }
      slot.result = record
      records.push(record)
      void run(slot, async () => {
        try {
          if (await freeze(slot, record)) {
            await deliver(record)
            await afterResult(slot, record)
          }
        } finally {
          slot.terminal.resolve()
        }
      }).catch(() => undefined)
    },
    play: input => inner.play(input),
    expectEvidence: input => inner.expectEvidence(input),
    failDirectory: () => inner.failDirectory(),
    recordDispatch(input) {
      inner.recordDispatch(input)
      const account = input.record.account
      if (account === null) return
      const slot = slotOf(input)
      slot.lateAccounts.push({ dispatch: input.record.dispatch, account: frozenCopy(account) })
      if (slot.result !== null) void run(slot, () => flushAccounts(slot)).catch(() => undefined)
    },
    advanceControl: input => inner.advanceControl(input),
    setCleanup: input => inner.setCleanup(input),
    withdrawInstance: input => inner.withdrawInstance(input),
    replaceInstance: input => inner.replaceInstance(input),
    disconnectObservers: input => inner.disconnectObservers(input),
    openObservations: input => inner.openObservations(input),
    revokeAccess: input => inner.revokeAccess(input),
    commitUnknown: input => inner.commitUnknown(input),
    queryCommit: input => inner.queryCommit(input),
  }

  const provider: ModelProvider<P> = {
    runtime: {
      calls: {
        async admit(input) {
          const reply = await calls.admit(input)
          if ('ok' in reply)
            slotOf({ tenant: input.tenant, call: reply.ok.call }).admission = {
              operation: input.operation,
              reference: reply.ok.reference,
            }
          return reply
        },
        inspect: input => calls.inspect(input),
        dispatches: input => calls.dispatches(input),
        cancel: input => calls.cancel(input),
      },
      consumption,
      instances,
    },
    recover: input => scripted.provider.recover(input),
    quiesce: () => scripted.provider.quiesce(),
  }

  return {
    provider,
    controller,
    deliveries() {
      return Object.freeze(records.map(snapshotOf))
    },
    async settled(call) {
      const slot = slotOf(call)
      await slot.terminal.promise
      await slot.chain
      if (slot.failed) throw slot.error
      if (slot.result === null) throw new Error('a terminal call has no result record')
      return snapshotOf(slot.result)
    },
    redeliver(key) {
      const record = records.find(item => sameValue(item.key, key))
      if (record === undefined) throw misuse('no delivery has this key')
      if (record.delivery === null) throw misuse('the delivery was never frozen')
      if (record.status === 'pending') throw misuse('the delivery is in flight')
      return run(record.slot, async () => {
        await deliver(record)
        if (record.key.kind === 'result') await afterResult(record.slot, record)
        return snapshotOf(record)
      })
    },
    acknowledgements() {
      return Object.freeze([...acks])
    },
  }
}
