import { judgeCallAccount } from '@omne-harness/call-account'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  encodeToolCanonical,
  type ToolLedger,
  isTenantShape,
  type CallRecord,
  type ResultRecord,
  type ToolAccessGuard,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import {
  decodeToolOperationId,
  encodeToolInvocationRef,
  judgeToolDelivery,
  type ConsumerRef,
  type DurableEvidence,
  type FixedToolRequest,
  type Reply,
  type ToolCallId,
  type ToolDelivery,
  type ToolResultReceiver,
} from '@omne-harness/tool-contract'
import {
  judgeHandoff,
  type CallAccess,
  type ToolCommands,
  type ToolCanonicalFingerprint,
  type ToolOperationIdentities,
  type ToolReads,
  type ToolTask,
} from '@omne-harness/tool-contract/provider'
import {
  createDeliveryState,
  deliveryUnavailable,
  type DeliveryBase,
  type DeliveryRecord,
  type ResultValueCommitment,
} from './delivery-state.ts'
import { processMonotonicMs } from './clock.ts'
import { createDeliveryPacing, tenantKey, type Owed } from './delivery-pacing.ts'

export type DeliveryPosition<P, B extends ContentBlock> = Readonly<{
  access(input: Readonly<{ tenant: TenantId; call: ToolCallId }>): Reply<CallAccess<P>>
  receiver(consumer: ConsumerRef): Reply<ToolResultReceiver<P, B>>
}>
export type LocalDeliveryInput<P, B extends ContentBlock> = Readonly<{
  store: ToolLedgerStore
  commands: ToolCommands<P, B>
  reads: ToolReads<P, B>
  resultDelivery: ToolLedger<P, B>['delivery']
  identities: ToolOperationIdentities
  access: ToolAccessGuard<P>
  position: DeliveryPosition<P, B>
  accountAtFreeze(
    input: CallAccess<P>,
  ): Reply<Extract<ToolDelivery<B>, { kind: 'result' }>['account']>
  capacity: number
  pacing?: Readonly<{ initialMs: number; maxMs: number }>
  warn?: (message: string) => void
  now?: () => number
  forwardedCopies?: (
    call: Readonly<{ tenant: TenantId; call: ToolCallId; request: FixedToolRequest }>,
  ) => Promise<'released' | 'unavailable'>
}>

export const ABSENT_RECEIVER = 'tool-result-receiver'

type Turn = { last: Promise<unknown> | null; queued: number }

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

function placeholderPayload<B extends ContentBlock>(
  call: CallRecord,
  task: Extract<ToolTask, { kind: 'placeholder' }>,
): Extract<ToolDelivery<B>, { kind: 'placeholder' }> | null {
  const tenant = restoreTenant(call.tenant)
  if (tenant === null) return null
  const reference = encodeToolInvocationRef({ tenant, call: call.call, admission: call.admission })
  if ('failure' in reference) return null
  return {
    kind: 'placeholder',
    key: { kind: 'placeholder', producer: 'tool', reference: reference.ok },
    consumer: task.consumer,
    delivery: task.delivery,
    source: task.source,
    label: call.request.label,
    evidence: task.evidence,
  }
}

function resultDeliveryBase(call: CallRecord, result: ResultRecord): DeliveryBase | null {
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
    value: {
      fingerprint: fingerprintOf(result.value),
      original:
        result.value.original.kind === 'none'
          ? { kind: 'none' }
          : offloadedDescription(result.value.original),
    },
  }
}

function offloadedDescription(
  original: Extract<ResultRecord['value']['original'], { kind: 'offloaded' }>,
): Extract<ResultValueCommitment['original'], { kind: 'offloaded' }> {
  const { summary: _summary, ...description } = original
  return description
}

function fingerprintOf(value: ResultRecord['value']): ToolCanonicalFingerprint {
  const original = value.original
  const encoded = encodeToolCanonical({
    ...value,
    original:
      original.kind === 'none'
        ? original
        : { kind: 'offloaded', source: original.source, summary: original.summary },
  })
  if ('failure' in encoded) throw new Error('a committed result value is always encodable')
  return encoded.ok.fingerprint
}

function describeFailure(failure: object): string {
  const fields = failure as Record<string, unknown>
  const named = ['dependency', 'action', 'field', 'reason', 'diagnostic'].flatMap(name =>
    typeof fields[name] === 'string' ? [`${name} ${String(fields[name])}`] : [],
  )
  return `${String(fields.kind)}${named.length === 0 ? '' : ` (${named.join(', ')})`}`
}

function describeError(error: unknown): string {
  let text: string
  try {
    text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  } catch {
    text = 'an exception that has no text'
  }
  return text.length > 200 ? `${text.slice(0, 200)}...` : text
}

type Sweep = { owed: Set<string>; certain: boolean }

const OWED_TASKS: ReadonlySet<ToolTask['kind']> = new Set(['deliver', 'account', 'placeholder'])

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
  const turns = new Map<string, Turn>()
  const pacing = input.pacing ?? { initialMs: 1000, maxMs: 60_000 }
  const now = input.now ?? processMonotonicMs

  function say(message: string): void {
    try {
      input.warn?.(message)
    } catch {}
  }
  const paced = createDeliveryPacing({ pacing, now, say })

  async function current(access: CallAccess<P>): Reply<CallAccess<P>> {
    const denied = () => {
      paced.forget(access)
      return fail({ kind: 'denied', action: 'recover' } as const)
    }
    const recovered = await input.position.access({ tenant: access.tenant, call: access.call })
    if ('failure' in recovered)
      return recovered.failure.kind === 'denied'
        ? denied()
        : deliveryUnavailable('delivery-position')
    if (
      recovered.ok.call !== access.call ||
      tenantKey(recovered.ok.tenant) !== tenantKey(access.tenant)
    )
      return denied()
    const qualified = await input.access.qualify({ ...recovered.ok, action: 'recover' })
    if (qualified.kind === 'denied') return denied()
    return qualified.kind === 'allowed' ? recovered : deliveryUnavailable('delivery-access')
  }

  async function freeze(
    access: CallAccess<P>,
    base: DeliveryBase,
    task: ToolTask,
  ): Reply<DeliveryRecord> {
    const account = await input.accountAtFreeze(access)
    if ('failure' in account) return account
    const payload = structuredClone({ ...base, account: account.ok })
    if (
      payload.account !== null &&
      (!('ok' in judgeCallAccount(payload.account)) ||
        payload.account.subject.kind !== 'tool_execution' ||
        payload.account.subject.id !== access.call)
    )
      return deliveryUnavailable('delivery-account')
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
    record: DeliveryRecord,
    signal: AbortSignal,
  ): Reply<DeliveryRecord> {
    if (record.phase.kind !== 'frozen') return succeed(record)
    const waiting = paced.away(access, record)
    if (waiting !== null) return deliveryUnavailable(waiting.dependency)
    const qualified = await current(access)
    if ('failure' in qualified) return qualified
    const receiver = await receiverOf(access, record)
    if ('failure' in receiver) return receiver
    if (signal.aborted) return deliveryUnavailable('delivery-wait')
    const value = await input.resultDelivery.read({
      ...qualified.ok,
      result: record.payload.key.result,
    })
    if ('failure' in value) return value
    const original = value.ok.original
    const description =
      original.kind === 'offloaded' ? offloadedDescription(original) : { kind: 'none' as const }
    if (
      canonicalDigest(fingerprintOf(value.ok)) !==
        canonicalDigest(record.payload.value.fingerprint) ||
      canonicalDigest(description) !== canonicalDigest(record.payload.value.original)
    )
      return deliveryUnavailable('delivery-value')
    const payload = { ...record.payload, value: value.ok }
    if ('failure' in judgeToolDelivery({ tenant: access.tenant, delivery: payload }))
      return deliveryUnavailable('delivery-value')
    const custody = await exchange(access, record, receiver.ok, payload, signal)
    if ('failure' in custody) return custody
    return state.save(access, { ...record, phase: { kind: 'saved', evidence: custody.ok } }, record)
  }

  async function exchange(
    access: CallAccess<P>,
    owed: Owed,
    receiver: ToolResultReceiver<P, B>,
    delivery: ToolDelivery<B>,
    signal: AbortSignal,
  ): Reply<DurableEvidence> {
    const ready = await current(access)
    if ('failure' in ready) return ready
    if (signal.aborted) return deliveryUnavailable('delivery-wait')
    let saved
    try {
      saved = await wait(
        receiver.push({ access: ready.ok, delivery: structuredClone(delivery), signal }),
        signal,
      )
    } catch (error) {
      paced.failed(access, owed, `the push threw ${describeError(error)}`)
      return deliveryUnavailable('delivery-receiver')
    }
    if (saved === null) return deliveryUnavailable('delivery-receiver')
    if ('failure' in saved) {
      if (saved.failure.kind === 'unavailable') paced.unavailable(access, owed, saved.failure)
      else paced.failed(access, owed, `the push answered ${describeFailure(saved.failure)}`)
      return deliveryUnavailable('delivery-receiver')
    }
    paced.settled(access, owed)
    const evidence = judgeHandoff({ kind: 'retained', custody: saved.ok.evidence })
    if (
      canonicalDigest(saved.ok.key) !== canonicalDigest(delivery.key) ||
      'failure' in evidence ||
      evidence.ok.kind !== 'retained' ||
      evidence.ok.custody.owner !== delivery.consumer.owner
    )
      return deliveryUnavailable('delivery-receipt')
    return succeed(evidence.ok.custody)
  }

  async function receiverOf(access: CallAccess<P>, record: Owed): Reply<ToolResultReceiver<P, B>> {
    let receiver
    try {
      receiver = await input.position.receiver(structuredClone(record.payload.consumer))
    } catch (error) {
      paced.failed(access, record, `the lookup threw ${describeError(error)}`)
      return deliveryUnavailable('delivery-receiver')
    }
    if ('failure' in receiver) {
      if (receiver.failure.kind === 'unavailable')
        paced.unavailable(access, record, receiver.failure)
      else paced.failed(access, record, `the lookup answered ${describeFailure(receiver.failure)}`)
    }
    return receiver
  }

  async function released(access: CallAccess<P>, record: DeliveryRecord): Promise<boolean> {
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
    record: DeliveryRecord,
    signal: AbortSignal,
  ): Reply<DeliveryRecord> {
    if (record.phase.kind !== 'saved' && record.phase.kind !== 'release-unknown')
      return succeed(record)
    const qualified = await current(access)
    if ('failure' in qualified) return qualified
    if (signal.aborted) return deliveryUnavailable('delivery-wait')
    const evidence = record.phase.evidence
    if (record.phase.kind === 'release-unknown') {
      const recalled = await recallRelease(access, qualified.ok, record, evidence)
      if (recalled !== null) return recalled
    }
    return sendRelease(access, qualified.ok, record, evidence, signal)
  }

  async function recallRelease(
    access: CallAccess<P>,
    qualified: CallAccess<P>,
    record: DeliveryRecord,
    evidence: DurableEvidence,
  ): Promise<Awaited<Reply<DeliveryRecord>> | null> {
    const resolution = await input.reads.operation({ ...qualified, operation: record.release })
    if ('failure' in resolution || resolution.ok.kind === 'unknown')
      return deliveryUnavailable('delivery-release')
    if (resolution.ok.kind !== 'committed') return null
    if (!(await released(access, record))) return deliveryUnavailable('delivery-release')
    return state.save(access, { ...record, phase: { kind: 'released', evidence } }, record)
  }

  async function sendRelease(
    access: CallAccess<P>,
    qualified: CallAccess<P>,
    record: DeliveryRecord,
    evidence: DurableEvidence,
    signal: AbortSignal,
  ): Reply<DeliveryRecord> {
    const marked = await state.save(
      access,
      { ...record, phase: { kind: 'release-unknown', evidence } },
      record,
    )
    if ('failure' in marked || marked.ok.phase.kind !== 'release-unknown') return marked
    if (signal.aborted) return deliveryUnavailable('delivery-wait')
    const attempt = marked.ok
    const answer = await input.commands.releaseDelivery({
      ...qualified,
      operation: attempt.release,
      result: attempt.payload.key.result,
      delivery: attempt.payload.delivery,
      consumer: attempt.payload.consumer,
      evidence: { kind: 'retained', custody: evidence },
    })
    if ('failure' in answer) return answer
    if (
      answer.ok.delivery !== attempt.payload.delivery ||
      canonicalDigest(answer.ok.consumer) !== canonicalDigest(attempt.payload.consumer)
    )
      return deliveryUnavailable('delivery-release')
    return state.save(access, { ...attempt, phase: { kind: 'released', evidence } }, attempt)
  }

  async function frozenRecord(
    access: CallAccess<P>,
    base: DeliveryBase,
    task: ToolTask | undefined,
    sweep: Sweep,
  ): Promise<DeliveryRecord | null> {
    const loaded = await state.load(access, base)
    if ('failure' in loaded) {
      sweep.certain = false
      return null
    }
    if (loaded.ok !== null) return loaded.ok
    if (task === undefined) return null
    const frozen = await freeze(access, base, task)
    if ('failure' in frozen) {
      sweep.certain = false
      return null
    }
    return frozen.ok
  }

  async function pushOwed(
    access: CallAccess<P>,
    frozen: DeliveryRecord,
    task: ToolTask | undefined,
    signal: AbortSignal,
    sweep: Sweep,
  ): Promise<DeliveryRecord | null> {
    if (frozen.phase.kind === 'frozen') sweep.owed.add(frozen.digest)
    if (task !== undefined && frozen.task !== task.operation) return null
    const saved = await push(access, frozen, signal)
    if ('failure' in saved) return null
    if (saved.ok.phase.kind !== 'frozen') sweep.owed.delete(frozen.digest)
    return saved.ok
  }

  async function finish(
    access: CallAccess<P>,
    request: FixedToolRequest,
    record: DeliveryRecord,
  ): Promise<boolean> {
    if (record.phase.kind !== 'released') return record.phase.kind === 'done'
    if (
      input.forwardedCopies !== undefined &&
      (await input.forwardedCopies({ tenant: access.tenant, call: access.call, request })) !==
        'released'
    )
      return false
    const finished = await state.save(
      access,
      { ...record, phase: { kind: 'done', evidence: record.phase.evidence } },
      record,
    )
    return 'ok' in finished && finished.ok.phase.kind === 'done'
  }

  // The placeholder goes first: while it is owed, no result of the call is pushed.
  async function deliverPlaceholder(
    access: CallAccess<P>,
    call: CallRecord,
    tasks: readonly ToolTask[],
    signal: AbortSignal,
    sweep: Sweep,
  ): Promise<'none' | 'released' | 'owed'> {
    const task = tasks.find(item => item.kind === 'placeholder')
    if (task?.kind !== 'placeholder') return 'none'
    const payload = placeholderPayload<B>(call, task)
    const operation = decodeToolOperationId(`${task.operation}/release-placeholder`)
    if (payload === null || 'failure' in operation) return 'owed'
    const owed: Owed = { digest: canonicalDigest(payload), payload }
    sweep.owed.add(owed.digest)
    if (paced.away(access, owed) !== null) return 'owed'
    if ('failure' in judgeToolDelivery({ tenant: access.tenant, delivery: payload })) return 'owed'
    const receiver = await receiverOf(access, owed)
    if ('failure' in receiver) return 'owed'
    const custody = await exchange(access, owed, receiver.ok, payload, signal)
    if ('failure' in custody) return 'owed'
    const released = await input.commands.releasePlaceholder({
      ...access,
      operation: operation.ok,
      delivery: task.delivery,
      consumer: task.consumer,
      evidence: { kind: 'retained', custody: custody.ok },
    })
    return 'ok' in released ? 'released' : 'owed'
  }

  async function deliver(
    access: CallAccess<P>,
    request: FixedToolRequest,
    base: DeliveryBase,
    task: ToolTask | undefined,
    signal: AbortSignal,
    sweep: Sweep,
  ): Promise<boolean> {
    const frozen = await frozenRecord(access, base, task, sweep)
    if (frozen === null || signal.aborted) return false
    const saved = await pushOwed(access, frozen, task, signal, sweep)
    if (saved === null || signal.aborted) return false
    const outcome = await release(access, saved, signal)
    return 'ok' in outcome && (await finish(access, request, outcome.ok))
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
      row.kind === 'task' && OWED_TASKS.has(row.task.kind) ? [row.task] : [],
    )
    let pending = tasks.length
    const sweep: Sweep = { owed: new Set(), certain: true }
    const first = await deliverPlaceholder(qualified.ok, call.call, tasks, signal, sweep)
    if (first === 'released') pending -= 1
    for (const row of first === 'owed' ? [] : read.records) {
      if (row.kind !== 'result' || signal.aborted) continue
      const base = resultDeliveryBase(call.call, row.result)
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
      if (
        (await deliver(qualified.ok, call.call.request, base, task, signal, sweep)) &&
        task !== undefined
      )
        pending -= 1
    }
    if (!signal.aborted && sweep.certain) paced.retain(qualified.ok, sweep.owed)
    return succeed({ pending })
  }

  function admit(tenant: string): Turn | null {
    const turn = turns.get(tenant)
    if (turn !== undefined) return turn.queued + 1 < input.capacity ? turn : null
    if (turns.size >= input.capacity) return null
    const fresh: Turn = { last: null, queued: 0 }
    turns.set(tenant, fresh)
    return fresh
  }

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
      if (qualified.kind === 'denied') {
        paced.forget(access)
        return fail({ kind: 'denied', action: 'recover' })
      }
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
    pacedEntries(): number {
      return paced.entries()
    },
    release(call: Readonly<{ tenant: TenantId; call: ToolCallId }>): void {
      paced.forget(call)
    },
    async close(): Promise<void> {
      shutdown.abort()
      await Promise.all(active.values())
      paced.clear()
    },
  })
}
