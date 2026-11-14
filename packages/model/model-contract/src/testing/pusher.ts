import type { TenantId } from '@omne-harness/legal-identity'
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
import { misuse } from './error.ts'
import type { ScriptedModelProvider } from './provider.ts'
import { frozenCopy, laterDecimal, sameValue, tenantText } from './values.ts'

export type ScriptedResultPusherOptions<P> = Readonly<{
  scripted: ScriptedModelProvider<P>
  principal: P
  resolveReceiver: (owner: ConsumerRef['owner']) => ModelResultReceiver<P> | null
  maxRedeliveries?: number
}>

export type PushFailure =
  | Readonly<{ kind: 'no-receiver' }>
  | Readonly<{ kind: 'receipt-key-mismatch'; receipt: ModelSavedReceipt }>
  | Readonly<{
      kind: 'rejected'
      failure: Exclude<ModelDeliveryFailure, { kind: 'outcome-unknown' }>
    }>
  | Readonly<{ kind: 'not-frozen'; step: 'inspect' | 'dispatches' | 'read'; reason: string }>
  | Readonly<{ kind: 'threw'; error: unknown }>

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

export type AckRecord = Readonly<{
  call: ScriptedCall
  operation: ModelOperationId
  result: ResultVersion
  attempt: number
  reply: Outcome<AckReceipt, ModelFailure>
}>

export type ScriptedResultPusher<P> = Readonly<{
  provider: ModelProvider<P>
  controller: ScriptController<P>
  deliveries(): readonly PushRecord[]
  settled(call: ScriptedCall): Promise<PushRecord>
  redeliver(key: ModelDeliveryKey): Promise<PushRecord>
  acknowledgements(): readonly AckRecord[]
}>

type Standing =
  | Readonly<{ status: 'pending' }>
  | Readonly<{ status: 'saved'; receipt: ModelSavedReceipt }>
  | Readonly<{ status: 'failed'; failure: PushFailure }>
  | Readonly<{ status: 'unknown' }>
type Saved = Extract<Standing, { status: 'saved' }>

type StandingCell = Readonly<{
  current(): Standing
  conclude(attempt: Standing): Standing
}>

function replaces(standing: Standing, attempt: Standing): boolean {
  if (standing.status === 'saved') return false
  if (standing.status === 'unknown') return attempt.status === 'saved'
  return true
}

function standingCell(): StandingCell {
  let standing: Standing = { status: 'pending' }
  return {
    current: () => standing,
    conclude(attempt) {
      if (replaces(standing, attempt)) standing = attempt
      return attempt
    },
  }
}

type Record = {
  readonly slot: Slot
  readonly key: ModelDeliveryKey
  delivery: ModelDelivery | null
  attempts: number
  readonly standing: StandingCell
  inFlight: boolean
}

type ResultRecord = Record &
  Readonly<{
    key: Extract<ModelDeliveryKey, { kind: 'result' }>
    operations: Readonly<{ read: ModelOperationId; ack: ModelOperationId }>
  }>

type Slot = {
  readonly tenant: TenantId
  readonly call: ModelCallId
  admission: Readonly<{ operation: ModelOperationId; reference: ModelInvocationRef }> | null
  result: ResultRecord | null
  readonly accounted: Map<DispatchId, string | null>
  readonly lateAccounts: Readonly<{ dispatch: DispatchId; account: CallAccount }>[]
  acknowledged: boolean
  ackAttempts: number
  readonly terminal: PromiseWithResolvers<ResultRecord>
  chain: Promise<void>
  error: unknown
  failed: boolean
}

function mintOperation(kind: 'ack' | 'push-read', call: ModelCallId): ModelOperationId {
  const body = call.slice(MODEL_IDENTITY_PREFIXES.ModelCallId.length)
  const decoded = decodeModelOperationId(
    `${MODEL_IDENTITY_PREFIXES.ModelOperationId}${kind}-${body}`,
  )
  if ('failure' in decoded)
    throw misuse(`the call ${call} gives no ${kind} operation: ${decoded.failure.reason}`)
  return decoded.ok
}

function snapshotOf(record: Record, standing: Standing = record.standing.current()): PushRecord {
  const base = frozenCopy({ key: record.key, delivery: record.delivery, attempts: record.attempts })
  if (standing.status === 'failed' && standing.failure.kind === 'threw') {
    const failure: PushFailure = Object.freeze({ kind: 'threw', error: standing.failure.error })
    return Object.freeze({ ...base, status: 'failed', failure })
  }
  return Object.freeze({ ...base, ...frozenCopy(standing) })
}

function savedOf(record: Record): Saved | null {
  const standing = record.standing.current()
  return standing.status === 'saved' ? standing : null
}

const RESERVED_OPERATION_PREFIXES = ['ack', 'push-read'].map(
  kind => `${MODEL_IDENTITY_PREFIXES.ModelOperationId}${kind}-`,
)

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
      result: null,
      accounted: new Map(),
      lateAccounts: [],
      acknowledged: false,
      ackAttempts: 0,
      terminal: Promise.withResolvers<ResultRecord>(),
      chain: Promise.resolve(),
      error: null,
      failed: false,
    }
    slots.set(key, slot)
    return slot
  }

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

  function accessOf(slot: Slot) {
    return { tenant: slot.tenant, principal }
  }

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

  async function freeze(slot: Slot, record: ResultRecord): Promise<ModelDelivery | null> {
    const { reference } = record.key
    const access = accessOf(slot)
    const notFrozen = (step: 'inspect' | 'dispatches' | 'read', reason: string): null => {
      record.standing.conclude({ status: 'failed', failure: { kind: 'not-frozen', step, reason } })
      return null
    }
    const lookup = await calls.inspect({ ...access, reference })
    if ('failure' in lookup) return notFrozen('inspect', JSON.stringify(lookup.failure))
    if (lookup.ok.kind !== 'found' || lookup.ok.state.phase !== 'settled')
      return notFrozen('inspect', 'the call is not settled')
    const state = lookup.ok.state
    const dispatches = await calls.dispatches({ ...access, call: slot.call })
    if ('failure' in dispatches) return notFrozen('dispatches', JSON.stringify(dispatches.failure))
    const parts = await readParts(slot, reference, record.operations.read, record.key.result)
    if ('failure' in parts) return notFrozen('read', parts.failure)
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
    record.delivery = delivery
    return delivery
  }

  async function deliver(record: Record, delivery: ModelDelivery): Promise<Standing> {
    record.inFlight = true
    record.standing.conclude({ status: 'pending' })
    try {
      return record.standing.conclude(await push(record, delivery))
    } finally {
      record.inFlight = false
    }
  }

  async function push(record: Record, delivery: ModelDelivery): Promise<Standing> {
    let receiver: ModelResultReceiver<P> | null
    try {
      receiver = resolveReceiver(delivery.consumer.owner)
    } catch (error) {
      return { status: 'failed', failure: { kind: 'threw', error } }
    }
    if (receiver === null) return { status: 'failed', failure: { kind: 'no-receiver' } }
    for (let redeliveries = 0; ; redeliveries += 1) {
      record.attempts += 1
      let outcome: Outcome<ModelSavedReceipt, ModelDeliveryFailure>
      try {
        outcome = await receiver.push({
          access: accessOf(record.slot),
          delivery,
          signal: new AbortController().signal,
        })
      } catch (error) {
        return { status: 'failed', failure: { kind: 'threw', error } }
      }
      if ('ok' in outcome) {
        const receipt = frozenCopy(outcome.ok)
        return sameValue(receipt.key, record.key)
          ? { status: 'saved', receipt }
          : { status: 'failed', failure: { kind: 'receipt-key-mismatch', receipt } }
      }
      if (outcome.failure.kind !== 'outcome-unknown')
        return { status: 'failed', failure: { kind: 'rejected', failure: outcome.failure } }
      if (redeliveries >= maxRedeliveries) return { status: 'unknown' }
    }
  }

  async function acknowledge(slot: Slot, record: ResultRecord, saved: Saved): Promise<void> {
    if (slot.acknowledged) return
    const operation = record.operations.ack
    const result = record.key.result
    for (let resends = 0; ; resends += 1) {
      const reply = await consumption.acknowledge({
        ...accessOf(slot),
        call: slot.call,
        operation,
        result,
        evidence: { kind: 'retained', custody: saved.receipt.evidence },
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

  async function flushAccounts(slot: Slot, result: ResultRecord): Promise<void> {
    const frozen = result.delivery
    if (savedOf(result) === null || frozen === null) return
    const { reference } = result.key
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
      const delivery = frozenCopy<ModelDelivery>({
        kind: 'account',
        key,
        consumer: frozen.consumer,
        account: late.account,
      })
      const record: Record = {
        slot,
        key,
        delivery,
        attempts: 0,
        standing: standingCell(),
        inFlight: false,
      }
      records.push(record)
      await deliver(record, delivery)
    }
  }

  async function afterResult(slot: Slot, record: ResultRecord): Promise<void> {
    const saved = savedOf(record)
    if (saved === null) return
    await acknowledge(slot, record, saved)
    await flushAccounts(slot, record)
  }

  const controller: ScriptController<P> = {
    start: input => inner.start(input),
    emit: input => inner.emit(input),
    settle(input) {
      const slot = slotOf(input)
      if (slot.admission === null)
        throw misuse(`the call ${input.call} was not admitted through the pusher`)
      const operations = {
        read: mintOperation('push-read', input.call),
        ack: mintOperation('ack', input.call),
      }
      inner.settle(input)
      const record: ResultRecord = {
        slot,
        key: { kind: 'result', reference: slot.admission.reference, result: input.version },
        operations,
        delivery: null,
        attempts: 0,
        standing: standingCell(),
        inFlight: false,
      }
      slot.result = record
      records.push(record)
      void run(slot, async () => {
        try {
          const delivery = await freeze(slot, record)
          if (delivery !== null) {
            await deliver(record, delivery)
            await afterResult(slot, record)
          }
        } finally {
          slot.terminal.resolve(record)
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
      const result = slot.result
      if (result !== null) void run(slot, () => flushAccounts(slot, result)).catch(() => undefined)
    },
    advanceControl: input => inner.advanceControl(input),
    setCleanup: input => inner.setCleanup(input),
    setContact: input => inner.setContact(input),
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
        ...calls,
        async admit(input) {
          const operation: unknown = input.operation
          if (
            typeof operation === 'string' &&
            RESERVED_OPERATION_PREFIXES.some(prefix => operation.startsWith(prefix))
          )
            throw misuse(`the operation ${operation} uses a prefix the pusher reserves`)
          const reply = await calls.admit(input)
          if ('ok' in reply)
            slotOf({ tenant: input.tenant, call: reply.ok.call }).admission = {
              operation: input.operation,
              reference: reply.ok.reference,
            }
          return reply
        },
      },
      consumption,
      instances,
    },
    quiesce: () => scripted.provider.quiesce(),
  }

  return {
    provider,
    controller,
    deliveries() {
      return Object.freeze(records.map(record => snapshotOf(record)))
    },
    async settled(call) {
      const slot = slotOf(call)
      const record = await slot.terminal.promise
      await slot.chain
      if (slot.failed) throw slot.error
      return snapshotOf(record)
    },
    redeliver(key) {
      const record = records.find(item => sameValue(item.key, key))
      if (record === undefined) throw misuse('no delivery has this key')
      const { delivery } = record
      if (delivery === null) throw misuse('the delivery was never frozen')
      if (record.inFlight) throw misuse('the delivery is in flight')
      return run(record.slot, async () => {
        const attempt = await deliver(record, delivery)
        const result = record.slot.result
        if (record === result) await afterResult(record.slot, result)
        return snapshotOf(record, attempt)
      })
    },
    acknowledgements() {
      return Object.freeze([...acks])
    },
  }
}
