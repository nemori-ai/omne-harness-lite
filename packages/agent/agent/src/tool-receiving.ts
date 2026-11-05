import { createHash } from 'node:crypto'
import {
  decodeAgentOperationId,
  type Access,
  type AgentExecutionId,
  type AgentJournalEntry,
  type Failure,
  type ReceivedCommitValue,
  type Reply,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  judgeToolDelivery,
  resolveToolInvocationRef,
  type ToolDelivery,
  type ToolDeliveryFailure,
  type ToolResultReceiver,
  type ToolSavedReceipt,
} from '@omne-harness/tool-contract'
import { canonical } from './canonical.ts'
import { actionPositionExecution } from './loop/identities.ts'
import { tenantKey } from './receiving-state.ts'
import {
  toolDeliveryMaterial,
  toolReceivedDraft,
  readToolDeliveryMaterial,
  toolValueText,
} from './tool-receiving-material.ts'
import type { ToolReceiverDependencies, ToolReceptionTarget } from './tool-receiving-types.ts'
import type {
  ToolReception,
  ToolReceiverReport,
  ToolReceiverState,
} from './tool-receiving-state.ts'

type Maintenance<P> = Readonly<{
  access: Access<P>
  execution: AgentExecutionId
  signal: AbortSignal
}>
type Saved = Outcome<ToolSavedReceipt, ToolDeliveryFailure>
type Rejected = Outcome<never, ToolDeliveryFailure>
type Maintained = Awaited<Reply<ToolReceiverReport>>
type Capacity = ReturnType<ToolReceiverDependencies<unknown>['capacity']>
/** What one push has settled before a reception is kept. */
type Pending<P> = Readonly<{
  access: Access<P>
  value: ToolDelivery<ContentBlock>
  target: ToolReceptionTarget
  recalled: boolean
  key: string
  tenant: string
}>
/** The target query of a delivery: the route comes from the position this owner registered. */
function targetQuery<P>(access: Access<P>, value: ToolDelivery<ContentBlock>) {
  const route = actionPositionExecution(value.consumer)
  return {
    access,
    consumer: value.consumer,
    reference: value.key.reference,
    ...(route === null ? {} : { execution: route }),
  }
}
export interface AgentToolReceiver<P> extends ToolResultReceiver<P, ContentBlock> {
  retry(input: Maintenance<P>): Reply<ToolReceiverReport>
  recover(input: Maintenance<P>): Reply<ToolReceiverReport>
  inspect(): ToolReceiverReport
}

const unavailable = (dependency: string): Rejected => fail({ kind: 'unavailable', dependency })
const unknown = (): Rejected => fail({ kind: 'outcome-unknown' })
const invalid = (field: string, reason: string) =>
  fail<ToolDeliveryFailure>({ kind: 'invalid', field, reason })
const keyOf = <P>(access: Access<P>, value: ToolDelivery<ContentBlock>) =>
  canonical([tenantKey(access), value.key])
const binding = <P>(access: Access<P>, target: ToolReceptionTarget) =>
  canonical([tenantKey(access), target])
const maintenanceFailure = (diagnostic: string): Maintained =>
  fail({ kind: 'unavailable', owner: 'agent-tool-receiver', diagnostic })
const receiveDenied = (): Maintained => fail({ kind: 'denied', action: 'receive-result' })

function attachments(value: unknown, found = new Set<string>()): number {
  if (typeof value === 'object' && value !== null) {
    if ('storage' in value && 'key' in value) found.add(canonical(value))
    for (const child of Object.values(value)) attachments(child, found)
  }
  return found.size
}

/** A push that failed for a reason other than an unknown outcome stops maintenance. */
function pushRejection(pushed: Saved): Maintained | null {
  if (!('failure' in pushed) || pushed.failure.kind === 'outcome-unknown') return null
  return pushed.failure.kind === 'denied'
    ? receiveDenied()
    : maintenanceFailure(pushed.failure.kind)
}

function accepts(
  target: ToolReceptionTarget,
  entry: Extract<AgentJournalEntry, { kind: 'received' }>,
): boolean {
  return (
    entry.delivery.producer === 'tool' &&
    target.pending.reference === entry.delivery.key.reference &&
    target.pending.consumption === entry.consumption &&
    canonical(target.pending.position) === canonical(entry.consumer)
  )
}

/** Settles with `settle()` when the signal aborts first; the work itself keeps running. */
async function raceAbort<T>(work: Promise<T>, signal: AbortSignal, settle: () => T): Promise<T> {
  const abort = Promise.withResolvers<T>()
  const stopped = () => abort.resolve(settle())
  signal.addEventListener('abort', stopped, { once: true })
  if (signal.aborted) stopped()
  try {
    return await Promise.race([work, abort.promise])
  } finally {
    signal.removeEventListener('abort', stopped)
  }
}

export function createAgentToolReceiver<P>(
  dependencies: ToolReceiverDependencies<P>,
  state: ToolReceiverState<P>,
): Outcome<AgentToolReceiver<P>, { kind: 'unsupported' }> {
  const receivedPort = dependencies.provider.received
  if (receivedPort === null) return fail({ kind: 'unsupported' })
  const received = receivedPort
  function retain<T>(work: Promise<T>) {
    state.tasks.add(work)
    void work.then(
      () => state.tasks.delete(work),
      () => state.tasks.delete(work),
    )
    return work
  }
  function report(scope?: ReadonlySet<string>): ToolReceiverReport {
    const entries = [...state.receptions.values()].filter(
      item => !scope || scope.has(binding(item.access, item.target)),
    )
    return {
      pending: entries.filter(item => item.commit.kind === 'unknown').length,
      diagnostics: entries.flatMap(item => {
        const reason = state.diagnostics.get(item.operation)
        return reason === undefined ? [] : [{ operation: item.operation, reason }]
      }),
    }
  }
  async function qualify(access: Access<P>, target: ToolReceptionTarget) {
    return dependencies.access.check({
      access,
      operation: 'receive-result',
      target: { kind: 'execution', execution: target.execution },
    })
  }
  async function admit(
    access: Access<P>,
    value: ToolDelivery<ContentBlock>,
  ): Promise<Outcome<ToolReceptionTarget, ToolDeliveryFailure>> {
    let resolved
    try {
      resolved = await dependencies.targets.resolve(targetQuery(access, value))
    } catch {
      return fail({ kind: 'unavailable', dependency: 'association' })
    }
    if ('failure' in resolved)
      return fail(
        resolved.failure.kind === 'denied'
          ? { kind: 'denied' }
          : { kind: 'unavailable', dependency: 'association' },
      )
    if (resolved.ok === null) return invalid('key.reference', 'not-accepted')
    const target = structuredClone(resolved.ok)
    let allowed
    try {
      allowed = await qualify(access, target)
    } catch {
      return fail({ kind: 'unavailable', dependency: 'access' })
    }
    if (allowed.kind !== 'allowed')
      return fail(
        allowed.kind === 'denied'
          ? { kind: 'denied' }
          : { kind: 'unavailable', dependency: 'access' },
      )
    if (target.pending.reference !== value.key.reference)
      return invalid('key.reference', 'not-accepted')
    if (canonical(target.pending.position) !== canonical(value.consumer))
      return invalid('consumer', 'not-original')
    const judged = judgeToolDelivery({ tenant: access.tenant, delivery: value })
    if ('failure' in judged) return invalid(judged.failure.field, judged.failure.reason)
    return succeed(target)
  }
  function failedSave(reception: ToolReception<P>, failure: Failure, query: boolean): Saved {
    state.diagnostics.set(reception.operation, failure.kind)
    if (failure.kind === 'denied' || failure.kind === 'conflict')
      return fail({ kind: failure.kind })
    if (failure.kind === 'commit-unknown' || (query && failure.kind === 'unavailable')) {
      reception.commit = { kind: 'unknown' }
      return unknown()
    }
    return unavailable(!query && failure.kind === 'unavailable' ? 'material' : 'responsibility')
  }
  async function verifySaved(
    reception: ToolReception<P>,
    value: ReceivedCommitValue,
  ): Promise<Saved> {
    const expected = toolReceivedDraft(reception.delivery, reception.target.pending.consumption)
    const material = await dependencies.provider.materials.read({
      ...reception.access,
      source: value.entry.material,
    })
    const decoded =
      'ok' in material ? readToolDeliveryMaterial(reception.access, material.ok, expected) : null
    if (
      decoded === null ||
      toolValueText(decoded) !== toolValueText(reception.delivery) ||
      canonical(value.entry) !== canonical({ ...expected, material: value.entry.material }) ||
      value.saved.owner !== reception.delivery.consumer.owner ||
      value.receipt.execution !== reception.target.execution
    ) {
      reception.commit = { kind: 'unknown' }
      state.diagnostics.set(reception.operation, 'committed-material-or-responsibility-unavailable')
      return unknown()
    }
    reception.commit = { kind: 'saved', value }
    state.diagnostics.delete(reception.operation)
    return succeed(structuredClone({ key: reception.delivery.key, evidence: value.saved }))
  }
  async function finish(reception: ToolReception<P>, query: boolean): Promise<Saved> {
    const input = {
      ...reception.access,
      execution: reception.target.execution,
      operation: reception.operation,
    }
    let result
    try {
      result = query
        ? await received.query(input)
        : await received.commit({
            ...input,
            entry: toolReceivedDraft(reception.delivery, reception.target.pending.consumption),
            material: toolDeliveryMaterial(reception.access, reception.delivery),
          })
    } catch {
      reception.commit = { kind: 'unknown' }
      state.diagnostics.set(reception.operation, 'joint-commit-threw')
      return unknown()
    }
    if ('failure' in result) return failedSave(reception, result.failure, query)
    if (result.ok.kind === 'unknown') {
      reception.commit = { kind: 'unknown' }
      return unknown()
    }
    if (result.ok.kind === 'excluded') {
      reception.commit = { kind: 'excluded' }
      return unavailable('responsibility')
    }
    return verifySaved(reception, result.ok.value)
  }
  async function admitPush(
    access: Access<P>,
    value: ToolDelivery<ContentBlock>,
  ): Promise<Outcome<ToolReceptionTarget, ToolDeliveryFailure>> {
    if (!tenantCodec.encode(access.tenant).ok) return fail({ kind: 'denied' })
    const ref = resolveToolInvocationRef(value.key.reference, access.tenant)
    if ('failure' in ref)
      return ref.failure.kind === 'malformed'
        ? invalid('key.reference', 'reference-malformed')
        : fail({ kind: 'denied' })
    return admit(access, value)
  }
  /** Conflict, cancellation and capacity gates, in this order, before a reception is kept. */
  function gate(
    pending: Pending<P>,
    current: ToolReception<P> | undefined,
    signal: AbortSignal,
  ): Outcome<Readonly<{ capacity: Capacity; active: number }>, ToolDeliveryFailure> {
    const { access, value, target, recalled, key, tenant } = pending
    if (
      current &&
      (toolValueText(current.delivery) !== toolValueText(value) ||
        binding(current.access, current.target) !== binding(access, target))
    )
      return fail({ kind: 'conflict' })
    if (!current && !recalled && signal.aborted) return fail({ kind: 'cancelled-before-accept' })
    const capacity = dependencies.capacity(access.tenant)
    if (Object.values(capacity).some(limit => !Number.isSafeInteger(limit) || limit < 0))
      return unavailable('capacity')
    const active = state.active.get(tenant) ?? 0
    if (active >= capacity.inFlight) return fail({ kind: 'backpressured', resource: 'in-flight' })
    if (state.writing.has(key)) return unknown()
    return succeed({ capacity, active })
  }
  /** Records a first-seen delivery against the tenant's record, byte and attachment limits. */
  function keep(
    pending: Pending<P>,
    capacity: Capacity,
  ): Outcome<ToolReception<P>, ToolDeliveryFailure> {
    const { access, value, target, recalled, key, tenant } = pending
    const bytes = Buffer.byteLength(toolValueText(value)),
      refs = attachments(value)
    const kept = [...state.receptions.values()].filter(item => tenantKey(item.access) === tenant)
    if (kept.length >= capacity.records) return fail({ kind: 'backpressured', resource: 'records' })
    if (kept.reduce((total, item) => total + item.bytes, bytes) > capacity.bytes)
      return fail({ kind: 'backpressured', resource: 'bytes' })
    if (kept.reduce((total, item) => total + item.attachments, refs) > capacity.attachments)
      return fail({ kind: 'backpressured', resource: 'attachments' })
    const operation = decodeAgentOperationId(
      `received-tool-${createHash('sha256').update(key).digest('hex')}`,
    )
    if ('failure' in operation) throw new Error('invalid derived Tool reception operation')
    const reception: ToolReception<P> = {
      access,
      target,
      delivery: value,
      operation: operation.ok,
      bytes,
      attachments: refs,
      commit: { kind: recalled ? 'unknown' : 'new' },
    }
    state.receptions.set(key, reception)
    return succeed(reception)
  }
  /** Starts the write as a retained task; the writing slot is released when it ends. */
  function write(reception: ToolReception<P>, key: string, tenant: string): Promise<Saved> {
    return retain(
      (async () => {
        try {
          return await finish(reception, reception.commit.kind !== 'new')
        } catch {
          reception.commit = { kind: 'unknown' }
          state.diagnostics.set(reception.operation, 'material-verification-threw')
          return unknown()
        } finally {
          state.writing.delete(key)
          state.active.set(tenant, (state.active.get(tenant) ?? 1) - 1)
        }
      })(),
    )
  }
  async function push(
    input: Parameters<ToolResultReceiver<P, ContentBlock>['push']>[0],
    recalled = false,
  ): Promise<Saved> {
    const access = { ...input.access },
      value = structuredClone(input.delivery)
    const admitted = await admitPush(access, value)
    if ('failure' in admitted) return admitted
    const key = keyOf(access, value),
      tenant = tenantKey(access)
    let current = state.receptions.get(key)
    const pending = { access, value, target: admitted.ok, recalled, key, tenant }
    const gated = gate(pending, current, input.signal)
    if ('failure' in gated) return gated
    const { capacity, active } = gated.ok
    if (!current) {
      const created = keep(pending, capacity)
      if ('failure' in created) return created
      current = created.ok
    }
    current.access = access
    state.active.set(tenant, active + 1)
    state.writing.add(key)
    const reception = current,
      wasSaved = current.commit.kind === 'saved'
    const work = write(reception, key, tenant)
    if (wasSaved) return work
    return raceAbort(work, input.signal, () =>
      reception.commit.kind === 'saved'
        ? succeed(
            structuredClone({
              key: reception.delivery.key,
              evidence: reception.commit.value.saved,
            }),
          )
        : unknown(),
    )
  }
  /** Returns the failure that stops maintenance, or null when every target is allowed. */
  async function checkTargets(
    input: Maintenance<P>,
    targets: readonly ToolReceptionTarget[],
  ): Promise<Maintained | null> {
    for (const target of targets) {
      if (input.signal.aborted) return maintenanceFailure('maintenance-cancelled')
      const allowed = await qualify(input.access, target)
      if (allowed.kind !== 'allowed')
        return allowed.kind === 'denied' ? receiveDenied() : maintenanceFailure('access')
    }
    return null
  }
  async function replayEntry(
    input: Maintenance<P>,
    targets: readonly ToolReceptionTarget[],
    entry: AgentJournalEntry,
  ): Promise<Maintained | null> {
    if (entry.kind !== 'received' || !targets.some(target => accepts(target, entry))) return null
    const material = await dependencies.provider.materials.read({
      ...input.access,
      source: entry.material,
    })
    if ('failure' in material)
      return material.failure.kind === 'denied' ? receiveDenied() : maintenanceFailure('materials')
    const value = readToolDeliveryMaterial(input.access, material.ok, entry)
    if (!value) return maintenanceFailure('materials')
    if (input.signal.aborted) return maintenanceFailure('maintenance-cancelled')
    return pushRejection(
      await push({ access: input.access, delivery: value, signal: input.signal }, true),
    )
  }
  async function replayJournal(
    input: Maintenance<P>,
    targets: readonly ToolReceptionTarget[],
  ): Promise<Maintained | null> {
    // The received entries of each original consumption, from the entries port of the same
    // provider (agent-contract SPEC "日志条目" 6); the snapshot carries none.
    const entries: AgentJournalEntry[] = []
    for (const consumption of new Set(targets.map(target => target.pending.consumption))) {
      const read = await dependencies.provider.entries.receivedOf({
        ...input.access,
        execution: input.execution,
        consumption,
      })
      if ('failure' in read)
        return read.failure.kind === 'denied' ? receiveDenied() : maintenanceFailure('journal')
      entries.push(...read.ok)
    }
    for (const entry of entries) {
      if (input.signal.aborted) return maintenanceFailure('maintenance-cancelled')
      const stopped = await replayEntry(input, targets, entry)
      if (stopped) return stopped
    }
    return null
  }
  async function retryUnknown(
    input: Maintenance<P>,
    scope: ReadonlySet<string>,
  ): Promise<Maintained | null> {
    for (const reception of Array.from(state.receptions.values())) {
      if (input.signal.aborted) return maintenanceFailure('maintenance-cancelled')
      if (
        reception.commit.kind !== 'unknown' ||
        !scope.has(binding(reception.access, reception.target))
      )
        continue
      const stopped = pushRejection(
        await push({ access: input.access, delivery: reception.delivery, signal: input.signal }),
      )
      if (stopped) return stopped
    }
    return null
  }
  async function maintenance(input: Maintenance<P>, recover: boolean): Promise<Maintained> {
    if (input.signal.aborted) return maintenanceFailure('maintenance-cancelled')
    const found = await dependencies.targets.forExecution(input)
    if ('failure' in found)
      return found.failure.kind === 'denied' ? receiveDenied() : maintenanceFailure('association')
    const targets = structuredClone(found.ok)
    if (targets.length === 0 || targets.some(target => target.execution !== input.execution))
      return receiveDenied()
    const scope = new Set(targets.map(target => binding(input.access, target)))
    const allowed = await checkTargets(input, targets)
    if (allowed) return allowed
    const replayed = recover ? await replayJournal(input, targets) : null
    if (replayed) return replayed
    const retried = await retryUnknown(input, scope)
    if (retried) return retried
    const checked = await checkTargets(input, targets)
    if (checked) return checked
    return input.signal.aborted
      ? maintenanceFailure('maintenance-cancelled')
      : succeed(report(scope))
  }
  async function maintain(input: Maintenance<P>, recover: boolean): Reply<ToolReceiverReport> {
    const work = retain(maintenance(input, recover).catch(() => maintenanceFailure('maintenance')))
    return raceAbort(work, input.signal, () => maintenanceFailure('maintenance-cancelled'))
  }
  return succeed({
    push,
    inspect: () => report(),
    retry: input => maintain(input, false),
    recover: input => maintain(input, true),
  })
}
