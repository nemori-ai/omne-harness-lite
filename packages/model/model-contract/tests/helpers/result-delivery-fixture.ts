import { tenantCodec, tenantEquals, type Access, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  judgeModelDelivery,
  resolveModelInvocationRef,
  type ConsumerRef,
  type DispatchId,
  type DurableEvidence,
  type ModelDelivery,
  type ModelDeliveryFailure,
  type ModelDeliveryKey,
  type ModelInvocationRef,
  type ModelResultReceiver,
  type ModelSavedReceipt,
} from '@omne-harness/model-contract'
import {
  attachmentIdentity,
  attachmentLocations,
  deliveryBytes,
  deliveryIdentity,
  frozenCopy,
  sameValue,
} from './result-delivery-values.ts'

export type AccessDecision = 'allow' | 'deny' | 'unavailable'
export type FixtureEvent = Readonly<{ sequence: number; action: string; key: string | null }>
export type Budget = Readonly<{
  records: number
  bytes: number
  attachments: number
  inFlight: number
}>
export type StepFact = Readonly<{ actual: 'committed' | 'absent'; observed: 'known' | 'unknown' }>
export type DeliveryStage = 'material' | 'responsibility' | 'reply'
export type DeliveryRecord = Readonly<{
  delivery: ModelDelivery
  material: StepFact
  responsibility: StepFact
  dedup: boolean
  protected: boolean
  receiptObserved: boolean
  evidence: DurableEvidence | null
  attempts: number
}>
type Dependency = 'original-call' | 'dispatches' | 'material' | 'responsibility'
type Reply = Outcome<ModelSavedReceipt, ModelDeliveryFailure>
export type DeliveryFixture<P> = Readonly<{
  receiver: ModelResultReceiver<P>
  establishOriginalCall(
    input: Readonly<{
      reference: ModelInvocationRef
      consumer: ConsumerRef
      dispatches: readonly DispatchId[]
    }>,
  ): void
  setAccess(access: Access<P>, decision: AccessDecision): void
  pauseAt(key: ModelDeliveryKey, stage: DeliveryStage): void
  reached(key: ModelDeliveryKey, stage: DeliveryStage): Promise<void>
  resume(key: ModelDeliveryKey, stage: 'material' | 'responsibility', fact: StepFact): void
  resume(key: ModelDeliveryKey, stage: 'reply'): void
  resolveUnknown(
    key: ModelDeliveryKey,
    stage: 'material' | 'responsibility',
    actual: 'committed' | 'absent',
  ): void
  dropReplyOnce(key: ModelDeliveryKey): void
  setDependency(name: Dependency, state: 'available' | 'unavailable'): void
  registerAttachment(
    location: Readonly<{ storage: string; key: string }>,
    content: Uint8Array,
  ): void
  readRecord(key: ModelDeliveryKey): DeliveryRecord | null
  resources(tenant: TenantId): Budget
  events(): readonly FixtureEvent[]
}>
type MutableBudget = { -readonly [K in keyof Budget]: Budget[K] }
type RecordState = { -readonly [K in keyof DeliveryRecord]: DeliveryRecord[K] } & {
  active: Promise<Reply> | null
  materialCopy: ModelDelivery | null
  attachmentCopies: readonly Uint8Array[]
  readonly evidenceIdentity: DurableEvidence
}
type Barrier = {
  reached: boolean
  arrived: PromiseWithResolvers<void>
  released: PromiseWithResolvers<StepFact | null>
}
type Original = {
  reference: ModelInvocationRef
  consumer: ConsumerRef
  dispatches: readonly DispatchId[]
}
const dimensions = ['records', 'bytes', 'attachments', 'inFlight'] as const
function zero(): MutableBudget {
  return { records: 0, bytes: 0, attachments: 0, inFlight: 0 }
}
function invalid(field: string, reason: string): Reply {
  return fail({ kind: 'invalid', field, reason })
}
function unavailable(dependency: string): Reply {
  return fail({ kind: 'unavailable', dependency })
}
function validateBudget(budget: Budget): void {
  if (
    dimensions.some(key => !Number.isSafeInteger(budget[key]) || budget[key] < 0) ||
    budget.bytes === 0 ||
    budget.inFlight === 0
  )
    throw new TypeError('Invalid fixture budget')
}
function hasUnknown(record: RecordState): boolean {
  return record.material.observed === 'unknown' || record.responsibility.observed === 'unknown'
}
function saved(record: RecordState): ModelSavedReceipt | null {
  if (
    hasUnknown(record) ||
    record.material.actual !== 'committed' ||
    record.responsibility.actual !== 'committed' ||
    !record.dedup ||
    !record.protected ||
    record.evidence === null
  )
    return null
  return { key: record.delivery.key, evidence: record.evidence }
}
function knownReply(record: RecordState): Reply {
  const receipt = saved(record)
  if (receipt !== null) return succeed(receipt)
  if (hasUnknown(record)) return fail({ kind: 'outcome-unknown' })
  return unavailable(record.material.actual === 'committed' ? 'responsibility' : 'material')
}

export function createDeliveryFixture<P>(
  input: Readonly<{
    limits: Budget
    tenants: readonly Readonly<{ tenant: TenantId; reserved: Budget }>[]
  }>,
): DeliveryFixture<P> {
  validateBudget(input.limits)
  const limits = frozenCopy(input.limits)
  const tenants = input.tenants.map(item => ({
    tenant: item.tenant,
    reserved: frozenCopy(item.reserved),
    used: zero(),
  }))
  const total = zero()
  for (const item of tenants) {
    if (!tenantCodec.encode(item.tenant).ok) throw new TypeError('Unminted fixture tenant')
    validateBudget(item.reserved)
    for (const dimension of dimensions) total[dimension] += item.reserved[dimension]
  }
  if (dimensions.some(key => !Number.isSafeInteger(total[key]) || total[key] > limits[key]))
    throw new TypeError('Reservations exceed global limits')
  if (
    tenants.some((item, index) =>
      tenants.slice(0, index).some(other => tenantEquals(item.tenant, other.tenant)),
    )
  )
    throw new TypeError('Duplicate fixture tenant')
  const globalUsed = zero()
  const accessRules: { tenant: TenantId; principal: P; decision: AccessDecision }[] = []
  const originals = new Map<string, Original>()
  const records = new Map<string, RecordState>()
  const barriers = new Map<string, Barrier>()
  const droppedReplies = new Set<string>()
  const dependencies = new Map<Dependency, 'available' | 'unavailable'>()
  const attachments = new Map<string, Uint8Array>()
  const events: FixtureEvent[] = []
  let nextRecord = 0
  function event(action: string, key: string | null = null): void {
    events.push({ sequence: events.length + 1, action, key })
  }
  function accessDecision(access: Access<P>): AccessDecision {
    return (
      accessRules.find(
        item =>
          tenantEquals(item.tenant, access.tenant) && Object.is(item.principal, access.principal),
      )?.decision ?? 'deny'
    )
  }
  function dependency(name: Dependency): boolean {
    return dependencies.get(name) !== 'unavailable'
  }
  function tenantState(tenant: TenantId) {
    const state = tenants.find(item => tenantEquals(item.tenant, tenant))
    if (!state) throw new TypeError('Unconfigured fixture tenant')
    return state
  }
  function reserve(tenant: TenantId, cost: Budget): ModelDeliveryFailure | null {
    const state = tenantState(tenant)
    const exceeded = dimensions.find(
      key =>
        cost[key] > state.reserved[key] - state.used[key] ||
        cost[key] > limits[key] - globalUsed[key],
    )
    if (exceeded)
      return { kind: 'backpressured', resource: exceeded === 'inFlight' ? 'in-flight' : exceeded }
    for (const key of dimensions) {
      state.used[key] += cost[key]
      globalUsed[key] += cost[key]
    }
    return null
  }
  function releaseFlight(tenant: TenantId): void {
    tenantState(tenant).used.inFlight--
    globalUsed.inFlight--
    event('inFlight.release')
  }
  function barrierKey(key: ModelDeliveryKey, stage: DeliveryStage): string {
    return JSON.stringify([deliveryIdentity(key), stage])
  }
  function getBarrier(key: ModelDeliveryKey, stage: DeliveryStage): Barrier {
    const barrier = barriers.get(barrierKey(key, stage))
    if (!barrier) throw new TypeError('Unregistered fixture barrier')
    return barrier
  }
  async function step(
    record: RecordState,
    stage: 'material' | 'responsibility',
    signal: AbortSignal,
  ): Promise<void> {
    const key = deliveryIdentity(record.delivery.key)
    const barrier = barriers.get(barrierKey(record.delivery.key, stage))
    event(stage + '.start', key)
    let fact: StepFact = { actual: 'committed', observed: 'known' }
    if (barrier) {
      record[stage] = { actual: 'absent', observed: 'unknown' }
      barrier.reached = true
      barrier.arrived.resolve()
      const result = await barrier.released.promise
      if (result === null) throw new TypeError('Missing fixture stage fact')
      fact = signal.aborted ? { ...result, observed: 'unknown' } : result
    }
    applyFact(record, stage, fact)
    event(stage + '.end', key)
  }
  function applyFact(
    record: RecordState,
    stage: 'material' | 'responsibility',
    fact: StepFact,
  ): void {
    if (record[stage].actual === 'committed' && fact.actual === 'absent')
      throw new TypeError('Cannot erase a committed fixture fact')
    if (
      stage === 'responsibility' &&
      fact.actual === 'committed' &&
      record.material.actual !== 'committed'
    )
      throw new TypeError('Responsibility requires material')
    if (fact.actual === 'committed' && record[stage].actual !== 'committed') {
      if (stage === 'material') record.materialCopy = frozenCopy(record.delivery)
      else {
        record.dedup = true
        record.protected = true
        record.evidence = record.evidenceIdentity
      }
      event(stage + '.commit', deliveryIdentity(record.delivery.key))
    }
    record[stage] = frozenCopy(fact)
  }
  async function deliverReply(record: RecordState): Promise<Reply> {
    const receipt = saved(record)
    if (!receipt) return knownReply(record)
    const key = deliveryIdentity(record.delivery.key)
    const barrier = barriers.get(barrierKey(record.delivery.key, 'reply'))
    if (barrier) {
      barrier.reached = true
      barrier.arrived.resolve()
      await barrier.released.promise
    }
    if (droppedReplies.delete(key)) {
      record.receiptObserved = false
      event('reply.lost', key)
      return fail({ kind: 'outcome-unknown' })
    }
    record.receiptObserved = true
    event('reply.saved', key)
    return succeed(receipt)
  }
  async function execute(record: RecordState, signal: AbortSignal): Promise<Reply> {
    if (hasUnknown(record)) return knownReply(record)
    if (record.material.actual === 'absent') {
      if (!dependency('material')) return unavailable('material')
      await step(record, 'material', signal)
    }
    if (record.material.actual !== 'committed' || hasUnknown(record)) return knownReply(record)
    if (record.responsibility.actual === 'absent') {
      if (signal.aborted || !dependency('responsibility')) return unavailable('responsibility')
      await step(record, 'responsibility', signal)
    }
    return deliverReply(record)
  }
  function waitFor(
    pending: Promise<Reply>,
    record: RecordState,
    signal: AbortSignal,
  ): Promise<Reply> {
    function stopped(): Reply {
      const key = deliveryIdentity(record.delivery.key)
      if (saved(record) && droppedReplies.has(key)) return fail({ kind: 'outcome-unknown' })
      const reply = knownReply(record)
      if ('ok' in reply) {
        record.receiptObserved = true
        event('reply.saved', key)
      }
      return reply
    }
    if (signal.aborted) return Promise.resolve(stopped())
    return new Promise((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener('abort', abort)
        resolve(stopped())
      }
      signal.addEventListener('abort', abort, { once: true })
      pending.then(
        value => {
          signal.removeEventListener('abort', abort)
          resolve(value)
        },
        error => {
          signal.removeEventListener('abort', abort)
          reject(error)
        },
      )
    })
  }
  function ownerCheck(
    delivery: ModelDelivery,
    tenant: TenantId,
    callKey: string,
    admission: string,
  ): Reply | null {
    event('owner.read')
    if (!dependency('original-call')) return unavailable('original-call')
    const original = originals.get(callKey)
    if (!original) return invalid('key.reference', 'not-accepted')
    const resolved = resolveModelInvocationRef(original.reference, tenant)
    if ('failure' in resolved) throw new TypeError('Invalid original fixture record')
    if (resolved.ok.admission !== admission) return invalid('key.reference', 'not-original')
    if (!sameValue(original.consumer, delivery.consumer)) return invalid('consumer', 'not-original')
    const judged = judgeModelDelivery({ tenant, delivery })
    if ('failure' in judged) return invalid(judged.failure.field, judged.failure.reason)
    event('dispatches.read')
    if (!dependency('dispatches')) return unavailable('dispatches')
    if (delivery.kind === 'account')
      return original.dispatches.includes(delivery.key.dispatch)
        ? null
        : invalid('key.dispatch', 'not-original')
    const actual = new Set(delivery.accounts.map(item => item.dispatch))
    return actual.size === original.dispatches.length &&
      original.dispatches.every(item => actual.has(item))
      ? null
      : invalid('accounts', 'dispatch-set-mismatch')
  }
  function createRecord(delivery: ModelDelivery, copies: readonly Uint8Array[]): RecordState {
    nextRecord++
    return {
      delivery,
      material: { actual: 'absent', observed: 'known' },
      responsibility: { actual: 'absent', observed: 'known' },
      dedup: false,
      protected: false,
      receiptObserved: false,
      evidence: null,
      attempts: 0,
      active: null,
      materialCopy: null,
      attachmentCopies: copies,
      evidenceIdentity: Object.freeze({
        owner: delivery.consumer.owner,
        record: String(nextRecord),
        revision: 'fixture-1',
        digest: 'fixture-only-not-a-content-digest',
      }),
    }
  }
  function callIdentity(tenant: TenantId, call: string): string {
    const encoded = tenantCodec.encode(tenant)
    if (!encoded.ok) throw new TypeError('Unminted fixture tenant')
    return JSON.stringify([encoded.value, call])
  }
  async function push(input: Parameters<ModelResultReceiver<P>['push']>[0]): Promise<Reply> {
    const delivery = frozenCopy(input.delivery)
    const access = { tenant: input.access.tenant, principal: input.access.principal }
    const signal = input.signal
    const resolved = resolveModelInvocationRef(delivery.key.reference, access.tenant)
    if ('failure' in resolved)
      return resolved.failure.kind === 'malformed'
        ? invalid('key.reference', 'reference-malformed')
        : fail({ kind: 'denied' })
    const qualified = accessDecision(access)
    event('qualification')
    if (qualified === 'deny') return fail({ kind: 'denied' })
    if (qualified === 'unavailable') return unavailable('qualification')
    const flight = reserve(access.tenant, { ...zero(), inFlight: 1 })
    if (flight) return fail(flight)
    event('inFlight.acquire')
    let executionOwnsFlight = false
    try {
      const ownerFailure = ownerCheck(
        delivery,
        access.tenant,
        callIdentity(access.tenant, resolved.ok.call),
        resolved.ok.admission,
      )
      if (ownerFailure) return ownerFailure
      const key = deliveryIdentity(delivery.key)
      event('key.read', key)
      let record = records.get(key)
      if (record && !sameValue(record.delivery, delivery)) return fail({ kind: 'conflict' })
      if (record?.active) return await waitFor(record.active, record, signal)
      if (record && saved(record)) return await deliverReply(record)
      if (record && hasUnknown(record)) return knownReply(record)
      if (signal.aborted)
        return record ? knownReply(record) : fail({ kind: 'cancelled-before-accept' })
      if (!record) {
        const copies: Uint8Array[] = []
        for (const location of attachmentLocations(delivery)) {
          const bytes = attachments.get(location)
          if (!bytes) return unavailable('material')
          copies.push(bytes.slice())
        }
        const cost = {
          records: 1,
          bytes: deliveryBytes(delivery),
          attachments: copies.reduce((sum, bytes) => sum + bytes.byteLength, 0),
          inFlight: 0,
        }
        const failure = reserve(access.tenant, cost)
        if (failure) return fail(failure)
        record = createRecord(delivery, copies)
        records.set(key, record)
        event('record.create', key)
      }
      record.attempts++
      const activeRecord = record
      executionOwnsFlight = true
      const execution = execute(record, signal).finally(() => {
        activeRecord.active = null
        releaseFlight(access.tenant)
      })
      record.active = execution
      return await waitFor(execution, record, signal)
    } finally {
      if (!executionOwnsFlight) releaseFlight(access.tenant)
    }
  }
  return {
    receiver: { push },
    establishOriginalCall(original) {
      const owner = tenants
        .map(item => resolveModelInvocationRef(original.reference, item.tenant))
        .find(item => 'ok' in item)
      if (!owner || 'failure' in owner) throw new TypeError('Invalid original invocation')
      if (new Set(original.dispatches).size !== original.dispatches.length)
        throw new TypeError('Duplicate original dispatch')
      const key = callIdentity(owner.ok.tenant, owner.ok.call)
      const previous = originals.get(key)
      if (previous && !sameValue(previous, original))
        throw new TypeError('Conflicting original call')
      originals.set(key, frozenCopy(original))
    },
    setAccess(access, decision) {
      if (!tenantCodec.encode(access.tenant).ok) throw new TypeError('Unminted access tenant')
      tenantState(access.tenant)
      const rule = accessRules.find(
        item =>
          tenantEquals(item.tenant, access.tenant) && Object.is(item.principal, access.principal),
      )
      if (rule) rule.decision = decision
      else accessRules.push({ tenant: access.tenant, principal: access.principal, decision })
    },
    pauseAt(key, stage) {
      const id = barrierKey(key, stage)
      if (barriers.has(id)) throw new TypeError('Duplicate fixture barrier')
      barriers.set(id, {
        reached: false,
        arrived: Promise.withResolvers<void>(),
        released: Promise.withResolvers<StepFact | null>(),
      })
    },
    reached(key, stage) {
      return getBarrier(key, stage).arrived.promise
    },
    resume(key: ModelDeliveryKey, stage: DeliveryStage, fact?: StepFact) {
      const barrier = getBarrier(key, stage)
      if (!barrier.reached || (stage === 'reply') !== (fact === undefined))
        throw new TypeError('Invalid fixture resume')
      barriers.delete(barrierKey(key, stage))
      barrier.released.resolve(fact ? frozenCopy(fact) : null)
    },
    resolveUnknown(key, stage, actual) {
      const record = records.get(deliveryIdentity(key))
      if (
        !record ||
        record.active ||
        record[stage].observed !== 'unknown' ||
        record[stage].actual !== actual
      )
        throw new TypeError('Unproven fixture resolution')
      applyFact(record, stage, { actual, observed: 'known' })
      event(stage + '.resolved', deliveryIdentity(key))
    },
    dropReplyOnce(key) {
      droppedReplies.add(deliveryIdentity(key))
    },
    setDependency(name, state) {
      dependencies.set(name, state)
    },
    registerAttachment(location, content) {
      attachments.set(attachmentIdentity(location), content.slice())
    },
    readRecord(key) {
      const record = records.get(deliveryIdentity(key))
      if (!record) return null
      const {
        delivery,
        material,
        responsibility,
        dedup,
        protected: protection,
        receiptObserved,
        evidence,
        attempts,
      } = record
      return frozenCopy({
        delivery,
        material,
        responsibility,
        dedup,
        protected: protection,
        receiptObserved,
        evidence,
        attempts,
      })
    },
    resources(tenant) {
      return Object.freeze({ ...tenantState(tenant).used })
    },
    events() {
      return frozenCopy(events)
    },
  }
}
