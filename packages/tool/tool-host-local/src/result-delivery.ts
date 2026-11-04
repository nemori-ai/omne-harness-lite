import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  isTenantShape,
  type CallRecord,
  type ResultRecord,
  type ToolAccessGuard,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import {
  encodeToolInvocationRef,
  judgeToolDelivery,
  type ConsumerRef,
  type Reply,
  type ToolCallId,
  type ToolDelivery,
  type ToolResultReceiver,
} from '@omne-harness/tool-contract'
import {
  judgeHandoff,
  type CallAccess,
  type ToolCommands,
  type ToolOperationIdentities,
  type ToolReads,
  type ToolTask,
} from '@omne-harness/tool-contract/provider'
import {
  createDeliveryState,
  deliveryUnavailable,
  type DeliveryBase,
  type DeliveryRecord,
} from './delivery-state.ts'
import { processMonotonicMs } from './clock.ts'

export type DeliveryPosition<P, B extends ContentBlock> = Readonly<{
  access(input: Readonly<{ tenant: TenantId; call: ToolCallId }>): Reply<CallAccess<P>>
  receiver(consumer: ConsumerRef): Reply<ToolResultReceiver<P, B>>
}>
export type LocalDeliveryInput<P, B extends ContentBlock> = Readonly<{
  store: ToolLedgerStore<B>
  commands: ToolCommands<P, B>
  reads: ToolReads<P, B>
  identities: ToolOperationIdentities
  access: ToolAccessGuard<P>
  position: DeliveryPosition<P, B>
  accountAtFreeze(
    input: CallAccess<P>,
  ): Reply<Extract<ToolDelivery<B>, { kind: 'result' }>['account']>
  /**
   * The tenants with a run in flight, and for one tenant its running and queued runs. A call with
   * no place answers `delivery-capacity` and stays owed. It does not mean the tenant is busy:
   * a later call of the same tenant waits for its turn (R2-D164, R2-D186).
   */
  capacity: number
  /**
   * The pacing of a push whose receiver answers `unavailable`, or has none registered for the
   * consumer owner (R2-D273, R2-D282): the delivery stays owed, the first wait is `initialMs` and
   * every later one doubles up to `maxMs`. Absent: 1000 and 60000.
   */
  pacing?: Readonly<{ initialMs: number; maxMs: number }>
  /** Where the named warning of a paced push goes. Absent: nowhere. */
  warn?: (message: string) => void
  /** A monotonic reading in milliseconds for that pacing. Absent: the process monotonic timer of `clock.ts`. */
  now?: () => number
}>

/** The answer of `DeliveryPosition.receiver` when no receiver is registered for the owner. */
export const ABSENT_RECEIVER = 'tool-result-receiver'

type Pace = { until: number; delay: number; dependency: string }

/** One tenant's runs in flight: the last one started or queued, and how many wait behind it. */
type Turn = { last: Promise<unknown> | null; queued: number }

function tenantKey(tenant: TenantId): string | null {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? encoded.value : null
}

function restoreTenant(value: unknown): TenantId | null {
  if (!isTenantShape(value)) return null
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: value.organization.text, account: value.account.text }),
  )
  return parsed.ok ? parsed.value : null
}

function storedTenantKey(value: unknown): string | null {
  const tenant = restoreTenant(value)
  return tenant === null ? null : tenantKey(tenant)
}

function resultBase<B extends ContentBlock>(
  call: CallRecord,
  result: ResultRecord<B>,
): DeliveryBase<B> | null {
  const tenant = restoreTenant(call.tenant)
  if (tenant === null) return null
  const reference = encodeToolInvocationRef({ tenant, call: call.call, admission: call.admission })
  if (
    'failure' in reference ||
    canonicalDigest(call.request.consumer) !== canonicalDigest(result.delivery.consumer)
  )
    return null
  return {
    kind: 'result',
    key: { kind: 'result', producer: 'tool', reference: reference.ok, result: result.result },
    consumer: call.request.consumer,
    delivery: result.delivery.delivery,
    relation: result.relation,
    terminal: result.terminal,
    actualTerminal: result.actual,
    effect: result.effect,
    source: result.source,
    value: result.value,
  }
}

/** Stops this wait without inferring that the provider stopped or rolled back. */
function wait<T>(promise: Promise<T>, signal: AbortSignal): Promise<T | null> {
  if (signal.aborted) {
    void promise.catch(() => undefined)
    return Promise.resolve(null)
  }
  return new Promise((resolve, reject) => {
    const abort = () => resolve(null)
    signal.addEventListener('abort', abort, { once: true })
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

/** Internal worker. The assembly must use a durable store for production. */
export function createLocalToolResultDelivery<P, B extends ContentBlock>(
  input: LocalDeliveryInput<P, B>,
) {
  if (!Number.isSafeInteger(input.capacity) || input.capacity < 1)
    throw new TypeError('delivery capacity must be positive')
  if (
    input.pacing !== undefined &&
    (!Number.isSafeInteger(input.pacing.initialMs) ||
      input.pacing.initialMs < 1 ||
      !Number.isSafeInteger(input.pacing.maxMs) ||
      input.pacing.maxMs < input.pacing.initialMs)
  )
    throw new TypeError('pacing: expected 1 <= initialMs <= maxMs, safe integers')
  const state = createDeliveryState(input.store)
  const shutdown = new AbortController()
  const active = new Map<string, Reply<Readonly<{ pending: number }>>>()
  /**
   * The tenants with a run in flight: one running run each, and the runs queued behind it in
   * arrival order. The capacity counts tenants here; the queue of one tenant does not take the
   * place of another tenant (R2-D186).
   */
  const turns = new Map<string, Turn>()
  const pacing = input.pacing ?? { initialMs: 1000, maxMs: 60_000 }
  const now = input.now ?? processMonotonicMs
  /**
   * The deliveries whose receiver was absent or answered `unavailable` at the last push: when the
   * next push may look again, the wait that set it, and the dependency named then. A receiver that
   * answers without `unavailable` removes the entry, so the next trouble starts at the first wait.
   */
  const paced = new Map<string, Pace>()

  async function current(access: CallAccess<P>): Reply<CallAccess<P>> {
    const recovered = await input.position.access({ tenant: access.tenant, call: access.call })
    if ('failure' in recovered)
      return recovered.failure.kind === 'denied'
        ? fail({ kind: 'denied', action: 'recover' })
        : deliveryUnavailable('delivery-position')
    if (
      recovered.ok.call !== access.call ||
      tenantKey(recovered.ok.tenant) !== tenantKey(access.tenant)
    )
      return fail({ kind: 'denied', action: 'recover' })
    const qualified = await input.access.qualify({ ...recovered.ok, action: 'recover' })
    if (qualified.kind === 'denied') return fail({ kind: 'denied', action: 'recover' })
    return qualified.kind === 'allowed' ? recovered : deliveryUnavailable('delivery-access')
  }

  async function freeze(
    access: CallAccess<P>,
    base: DeliveryBase<B>,
    task: ToolTask,
  ): Reply<DeliveryRecord<B>> {
    const account = await input.accountAtFreeze(access)
    if ('failure' in account) return account
    const payload = structuredClone({ ...base, account: account.ok })
    const judged = judgeToolDelivery({ tenant: access.tenant, delivery: payload })
    if ('failure' in judged) return deliveryUnavailable('delivery-account')
    const freezeOperation = await input.identities.newOperation()
    if ('failure' in freezeOperation) return freezeOperation
    const release = await input.identities.newOperation()
    if ('failure' in release) return release
    const done = await input.identities.newOperation()
    if ('failure' in done) return done
    return state.save(
      access,
      {
        payload,
        digest: canonicalDigest(payload),
        task: task.operation,
        freeze: freezeOperation.ok,
        release: release.ok,
        done: done.ok,
        phase: { kind: 'frozen' },
      },
      null,
    )
  }

  async function push(
    access: CallAccess<P>,
    record: DeliveryRecord<B>,
    signal: AbortSignal,
  ): Reply<DeliveryRecord<B>> {
    if (record.phase.kind !== 'frozen') return succeed(record)
    const waiting = pacedAway(record)
    if (waiting !== null) return deliveryUnavailable(waiting.dependency)
    const qualified = await current(access)
    if ('failure' in qualified) return qualified
    const receiver = await receiverOf(access, record)
    if ('failure' in receiver) return receiver
    if (signal.aborted) return deliveryUnavailable('delivery-wait')
    const saved = await wait(
      receiver.ok.push({ access: qualified.ok, delivery: structuredClone(record.payload), signal }),
      signal,
    )
    if (saved === null) return deliveryUnavailable('delivery-receiver')
    if ('failure' in saved) {
      if (saved.failure.kind === 'unavailable') pace(access, record, saved.failure)
      else paced.delete(record.digest)
      return deliveryUnavailable('delivery-receiver')
    }
    paced.delete(record.digest)
    const evidence = judgeHandoff({ kind: 'retained', custody: saved.ok.evidence })
    if (
      canonicalDigest(saved.ok.key) !== canonicalDigest(record.payload.key) ||
      'failure' in evidence ||
      evidence.ok.kind !== 'retained' ||
      evidence.ok.custody.owner !== record.payload.consumer.owner
    )
      return deliveryUnavailable('delivery-receipt')
    return state.save(
      access,
      { ...record, phase: { kind: 'saved', evidence: evidence.ok.custody } },
      record,
    )
  }

  /** The wait of `record` while the last push was paced and the wait is not over; else null. */
  function pacedAway(record: DeliveryRecord<B>): Pace | null {
    const waiting = paced.get(record.digest)
    return waiting !== undefined && now() < waiting.until ? waiting : null
  }

  /** The receiver of the frozen consumer; an unavailable answer paces the next look. */
  async function receiverOf(
    access: CallAccess<P>,
    record: DeliveryRecord<B>,
  ): Reply<ToolResultReceiver<P, B>> {
    const receiver = await input.position.receiver(structuredClone(record.payload.consumer))
    if ('failure' in receiver && receiver.failure.kind === 'unavailable')
      pace(access, record, receiver.failure)
    return receiver
  }

  /**
   * Paces the next push of `record` and names the wait in one warning (R2-D273, R2-D282). The
   * first wait is `initialMs`, every later one doubles up to `maxMs`.
   */
  function pace(
    access: CallAccess<P>,
    record: DeliveryRecord<B>,
    cause: Readonly<{ dependency: string; diagnostic?: string }>,
  ): void {
    const last = paced.get(record.digest)
    const delay = last === undefined ? pacing.initialMs : Math.min(last.delay * 2, pacing.maxMs)
    paced.set(record.digest, { until: now() + delay, delay, dependency: cause.dependency })
    try {
      input.warn?.(
        `result delivery ${String(record.payload.delivery)} of call ${String(access.call)} stays owed: ` +
          `the receiver of the consumer owner ${record.payload.consumer.owner} is unavailable ` +
          `(${cause.dependency}${cause.diagnostic === undefined ? '' : `: ${cause.diagnostic}`}); the next push is in ${String(delay)} ms`,
      )
    } catch {
      // A warning that cannot be written does not change the delivery.
    }
  }

  async function released(access: CallAccess<P>, record: DeliveryRecord<B>): Promise<boolean> {
    const read = await input.store.read({ kind: 'call', tenant: access.tenant, call: access.call })
    if (read.kind !== 'complete') return false
    return read.records.some(
      row =>
        row.kind === 'result' &&
        row.result.call === access.call &&
        storedTenantKey(row.result.tenant) === tenantKey(access.tenant) &&
        row.result.result === record.payload.key.result &&
        row.result.delivery.kind === 'released' &&
        row.result.delivery.delivery === record.payload.delivery &&
        canonicalDigest(row.result.delivery.consumer) === canonicalDigest(record.payload.consumer),
    )
  }

  async function release(
    access: CallAccess<P>,
    record: DeliveryRecord<B>,
    signal: AbortSignal,
  ): Reply<DeliveryRecord<B>> {
    if (
      record.phase.kind === 'frozen' ||
      record.phase.kind === 'done' ||
      record.phase.kind === 'released'
    )
      return succeed(record)
    const qualified = await current(access)
    if ('failure' in qualified) return qualified
    if (signal.aborted) return deliveryUnavailable('delivery-wait')
    if (record.phase.kind === 'release-unknown') {
      const resolution = await input.reads.operation({ ...qualified.ok, operation: record.release })
      if ('failure' in resolution || resolution.ok.kind === 'unknown')
        return deliveryUnavailable('delivery-release')
      if (resolution.ok.kind === 'committed') {
        if (!(await released(access, record))) return deliveryUnavailable('delivery-release')
        return state.save(
          access,
          { ...record, phase: { kind: 'released', evidence: record.phase.evidence } },
          record,
        )
      }
    }
    const marked = await state.save(
      access,
      { ...record, phase: { kind: 'release-unknown', evidence: record.phase.evidence } },
      record,
    )
    if ('failure' in marked || marked.ok.phase.kind !== 'release-unknown') return marked
    if (signal.aborted) return deliveryUnavailable('delivery-wait')
    const attempt = marked.ok
    const answer = await input.commands.releaseDelivery({
      ...qualified.ok,
      operation: attempt.release,
      result: attempt.payload.key.result,
      delivery: attempt.payload.delivery,
      consumer: attempt.payload.consumer,
      evidence: { kind: 'retained', custody: record.phase.evidence },
    })
    if ('failure' in answer) return answer
    if (
      answer.ok.delivery !== attempt.payload.delivery ||
      canonicalDigest(answer.ok.consumer) !== canonicalDigest(attempt.payload.consumer)
    )
      return deliveryUnavailable('delivery-release')
    return state.save(
      access,
      { ...attempt, phase: { kind: 'released', evidence: record.phase.evidence } },
      attempt,
    )
  }

  async function deliver(
    access: CallAccess<P>,
    base: DeliveryBase<B>,
    task: ToolTask | undefined,
    signal: AbortSignal,
  ): Promise<boolean> {
    const loaded = await state.load(access, base)
    if ('failure' in loaded) return false
    const frozen =
      loaded.ok === null
        ? task === undefined
          ? null
          : await freeze(access, base, task)
        : succeed(loaded.ok)
    if (frozen === null || 'failure' in frozen || signal.aborted) return false
    if (task !== undefined && frozen.ok.task !== task.operation) return false
    const saved = await push(access, frozen.ok, signal)
    if ('failure' in saved || signal.aborted) return false
    const outcome = await release(access, saved.ok, signal)
    if (
      'failure' in outcome ||
      outcome.ok.phase.kind === 'frozen' ||
      outcome.ok.phase.kind === 'saved' ||
      outcome.ok.phase.kind === 'release-unknown'
    )
      return false
    if (outcome.ok.phase.kind === 'done') return true
    const finished = await state.save(
      access,
      { ...outcome.ok, phase: { kind: 'done', evidence: outcome.ok.phase.evidence } },
      outcome.ok,
    )
    return 'ok' in finished && finished.ok.phase.kind === 'done'
  }

  async function run(
    access: CallAccess<P>,
    signal: AbortSignal,
  ): Reply<Readonly<{ pending: number }>> {
    const qualified = await current(access)
    if ('failure' in qualified) return qualified
    const read = await input.store.read({ kind: 'call', tenant: access.tenant, call: access.call })
    if (read.kind !== 'complete') return deliveryUnavailable('delivery-store')
    const call = read.records.find(row => row.kind === 'call')
    if (
      call?.kind !== 'call' ||
      call.call.call !== access.call ||
      storedTenantKey(call.call.tenant) !== tenantKey(access.tenant)
    )
      return deliveryUnavailable('delivery-call')
    const tasks = read.records.flatMap(row =>
      row.kind === 'task' && (row.task.kind === 'deliver' || row.task.kind === 'account')
        ? [row.task]
        : [],
    )
    let pending = tasks.length
    for (const row of read.records) {
      if (row.kind !== 'result' || signal.aborted) continue
      const base = resultBase(call.call, row.result)
      if (
        base === null ||
        row.result.call !== access.call ||
        storedTenantKey(row.result.tenant) !== tenantKey(access.tenant)
      )
        continue
      const task = tasks.find(
        item =>
          item.kind === 'deliver' &&
          item.operation === row.result.settledBy &&
          item.result === row.result.result &&
          item.delivery === base.delivery &&
          canonicalDigest(item.consumer) === canonicalDigest(base.consumer),
      )
      if (task === undefined && row.result.delivery.kind !== 'released') continue
      if ((await deliver(qualified.ok, base, task, signal)) && task !== undefined) pending -= 1
    }
    return succeed({ pending })
  }

  /**
   * Where a new run of the tenant goes. A tenant without a run in flight takes one of the
   * `capacity` places. A tenant with one keeps its place: the run waits behind the running one,
   * in arrival order, as long as the tenant's running and queued runs stay within `capacity`.
   * Null when there is no place.
   */
  function admit(tenant: string): Turn | null {
    const turn = turns.get(tenant)
    if (turn !== undefined) return turn.queued + 1 < input.capacity ? turn : null
    if (turns.size >= input.capacity) return null
    const fresh: Turn = { last: null, queued: 0 }
    turns.set(tenant, fresh)
    return fresh
  }

  /**
   * Runs `work` after the last run of the tenant. The turn belongs to the worker: a caller that
   * stops observing leaves it in place (R2-D164). A turn that comes after close does not run.
   */
  function enqueue(
    turn: Turn,
    tenant: string,
    key: string,
    work: () => Reply<Readonly<{ pending: number }>>,
  ): Reply<Readonly<{ pending: number }>> {
    const previous = turn.last
    if (previous !== null) turn.queued += 1
    const start = (): Reply<Readonly<{ pending: number }>> => {
      if (previous !== null) turn.queued -= 1
      return shutdown.signal.aborted
        ? Promise.resolve(deliveryUnavailable('delivery-wait'))
        : work()
    }
    const running: Reply<Readonly<{ pending: number }>> = (previous ?? Promise.resolve())
      .then(start, start)
      .catch(() => deliveryUnavailable('delivery-worker'))
      .finally(() => {
        active.delete(key)
        if (turn.last === running) turns.delete(tenant)
      })
    turn.last = running
    active.set(key, running)
    return running
  }

  return Object.freeze({
    async drive(
      access: CallAccess<P> & Readonly<{ signal: AbortSignal }>,
    ): Reply<Readonly<{ pending: number }>> {
      const tenant = tenantKey(access.tenant)
      if (tenant === null) return Promise.resolve(fail({ kind: 'denied', action: 'recover' }))
      if (shutdown.signal.aborted || access.signal.aborted)
        return Promise.resolve(deliveryUnavailable('delivery-wait'))
      const key = JSON.stringify([tenant, access.call])
      let qualified
      try {
        qualified = await wait(
          input.access.qualify({ ...access, action: 'recover' }),
          AbortSignal.any([shutdown.signal, access.signal]),
        )
      } catch {
        return deliveryUnavailable('delivery-access')
      }
      if (qualified === null || qualified.kind === 'unavailable')
        return deliveryUnavailable('delivery-access')
      if (qualified.kind === 'denied') return fail({ kind: 'denied', action: 'recover' })
      if (shutdown.signal.aborted || access.signal.aborted)
        return deliveryUnavailable('delivery-wait')
      const existing = active.get(key)
      if (existing !== undefined)
        return (await wait(existing, access.signal)) ?? deliveryUnavailable('delivery-wait')
      const turn = admit(tenant)
      if (turn === null) return deliveryUnavailable('delivery-capacity')
      const running = enqueue(turn, tenant, key, () =>
        wait(run(access, shutdown.signal), shutdown.signal).then(
          answer => answer ?? deliveryUnavailable('delivery-wait'),
        ),
      )
      return (await wait(running, access.signal)) ?? deliveryUnavailable('delivery-wait')
    },
    async close(): Promise<void> {
      shutdown.abort()
      await Promise.all(active.values())
    },
  })
}
