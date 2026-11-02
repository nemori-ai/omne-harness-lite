import { createHash } from 'node:crypto'
import {
  decodeAgentOperationId,
  type Access,
  type AgentExecutionId,
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
export interface AgentToolReceiver<P> extends ToolResultReceiver<P, ContentBlock> {
  retry(input: Maintenance<P>): Reply<ToolReceiverReport>
  recover(input: Maintenance<P>): Reply<ToolReceiverReport>
  inspect(): ToolReceiverReport
}

const unavailable = (dependency: string): Saved => fail({ kind: 'unavailable', dependency })
const unknown = (): Saved => fail({ kind: 'outcome-unknown' })
const invalid = (field: string, reason: string) =>
  fail<ToolDeliveryFailure>({ kind: 'invalid', field, reason })
const keyOf = <P>(access: Access<P>, value: ToolDelivery<ContentBlock>) =>
  canonical([tenantKey(access), value.key])
const binding = <P>(access: Access<P>, target: ToolReceptionTarget) =>
  canonical([tenantKey(access), target])

function attachments(value: unknown, found = new Set<string>()): number {
  if (typeof value === 'object' && value !== null) {
    if ('storage' in value && 'key' in value) found.add(canonical(value))
    for (const child of Object.values(value)) attachments(child, found)
  }
  return found.size
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
      resolved = await dependencies.targets.resolve({
        access,
        consumer: value.consumer,
        reference: value.key.reference,
      })
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
    if ('failure' in result) {
      state.diagnostics.set(reception.operation, result.failure.kind)
      if (result.failure.kind === 'denied' || result.failure.kind === 'conflict')
        return fail({ kind: result.failure.kind })
      if (
        result.failure.kind === 'commit-unknown' ||
        (query && result.failure.kind === 'unavailable')
      ) {
        reception.commit = { kind: 'unknown' }
        return unknown()
      }
      return unavailable(
        !query && result.failure.kind === 'unavailable' ? 'material' : 'responsibility',
      )
    }
    if (result.ok.kind === 'unknown') {
      reception.commit = { kind: 'unknown' }
      return unknown()
    }
    if (result.ok.kind === 'excluded') {
      reception.commit = { kind: 'excluded' }
      return unavailable('responsibility')
    }
    const value = result.ok.value
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
  async function push(
    input: Parameters<ToolResultReceiver<P, ContentBlock>['push']>[0],
    recalled = false,
  ): Promise<Saved> {
    const access = { ...input.access },
      value = structuredClone(input.delivery)
    if (!tenantCodec.encode(access.tenant).ok) return fail({ kind: 'denied' })
    const ref = resolveToolInvocationRef(value.key.reference, access.tenant)
    if ('failure' in ref)
      return ref.failure.kind === 'malformed'
        ? invalid('key.reference', 'reference-malformed')
        : fail({ kind: 'denied' })
    const admitted = await admit(access, value)
    if ('failure' in admitted) return admitted
    const key = keyOf(access, value),
      tenant = tenantKey(access)
    let current = state.receptions.get(key)
    if (
      current &&
      (toolValueText(current.delivery) !== toolValueText(value) ||
        binding(current.access, current.target) !== binding(access, admitted.ok))
    )
      return fail({ kind: 'conflict' })
    if (!current && !recalled && input.signal.aborted)
      return fail({ kind: 'cancelled-before-accept' })
    const capacity = dependencies.capacity(access.tenant)
    if (Object.values(capacity).some(limit => !Number.isSafeInteger(limit) || limit < 0))
      return unavailable('capacity')
    const active = state.active.get(tenant) ?? 0
    if (active >= capacity.inFlight) return fail({ kind: 'backpressured', resource: 'in-flight' })
    if (state.writing.has(key)) return unknown()
    if (!current) {
      const bytes = Buffer.byteLength(toolValueText(value)),
        refs = attachments(value)
      const kept = [...state.receptions.values()].filter(item => tenantKey(item.access) === tenant)
      if (kept.length >= capacity.records)
        return fail({ kind: 'backpressured', resource: 'records' })
      if (kept.reduce((total, item) => total + item.bytes, bytes) > capacity.bytes)
        return fail({ kind: 'backpressured', resource: 'bytes' })
      if (kept.reduce((total, item) => total + item.attachments, refs) > capacity.attachments)
        return fail({ kind: 'backpressured', resource: 'attachments' })
      const operation = decodeAgentOperationId(
        `received-tool-${createHash('sha256').update(key).digest('hex')}`,
      )
      if ('failure' in operation) throw new Error('invalid derived Tool reception operation')
      current = {
        access,
        target: admitted.ok,
        delivery: value,
        operation: operation.ok,
        bytes,
        attachments: refs,
        commit: { kind: recalled ? 'unknown' : 'new' },
      }
      state.receptions.set(key, current)
    }
    current.access = access
    state.active.set(tenant, active + 1)
    state.writing.add(key)
    const reception = current,
      wasSaved = current.commit.kind === 'saved'
    const work = retain(
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
    if (wasSaved) return work
    const abort = Promise.withResolvers<Saved>()
    const stopped = () =>
      abort.resolve(
        reception.commit.kind === 'saved'
          ? succeed(
              structuredClone({
                key: reception.delivery.key,
                evidence: reception.commit.value.saved,
              }),
            )
          : unknown(),
      )
    input.signal.addEventListener('abort', stopped, { once: true })
    if (input.signal.aborted) stopped()
    try {
      return await Promise.race([work, abort.promise])
    } finally {
      input.signal.removeEventListener('abort', stopped)
    }
  }
  async function maintain(input: Maintenance<P>, recover: boolean): Reply<ToolReceiverReport> {
    const failure = (diagnostic: string) =>
      fail({ kind: 'unavailable' as const, owner: 'agent-tool-receiver', diagnostic })
    const denied = () => fail({ kind: 'denied' as const, action: 'receive-result' })
    const work = retain(
      (async (): Reply<ToolReceiverReport> => {
        if (input.signal.aborted) return failure('maintenance-cancelled')
        const found = await dependencies.targets.forExecution(input)
        if ('failure' in found)
          return found.failure.kind === 'denied' ? denied() : failure('association')
        const targets = structuredClone(found.ok)
        if (targets.length === 0 || targets.some(target => target.execution !== input.execution))
          return denied()
        const scope = new Set(targets.map(target => binding(input.access, target)))
        const check = async () => {
          for (const target of targets) {
            if (input.signal.aborted) return failure('maintenance-cancelled')
            const allowed = await qualify(input.access, target)
            if (allowed.kind !== 'allowed')
              return allowed.kind === 'denied' ? denied() : failure('access')
          }
          return succeed(undefined)
        }
        const allowed = await check()
        if ('failure' in allowed) return allowed
        if (recover) {
          const snapshot = await dependencies.provider.journal.load({
            ...input.access,
            execution: input.execution,
          })
          if ('failure' in snapshot)
            return snapshot.failure.kind === 'denied' ? denied() : failure('journal')
          if (!snapshot.ok.entries) return failure('journal-entries')
          for (const entry of snapshot.ok.entries) {
            if (input.signal.aborted) return failure('maintenance-cancelled')
            if (entry.kind !== 'received' || entry.delivery.producer !== 'tool') continue
            if (
              !targets.some(
                target =>
                  target.pending.reference === entry.delivery.key.reference &&
                  target.pending.consumption === entry.consumption &&
                  canonical(target.pending.position) === canonical(entry.consumer),
              )
            )
              continue
            const material = await dependencies.provider.materials.read({
              ...input.access,
              source: entry.material,
            })
            if ('failure' in material)
              return material.failure.kind === 'denied' ? denied() : failure('materials')
            const value = readToolDeliveryMaterial(input.access, material.ok, entry)
            if (!value) return failure('materials')
            if (input.signal.aborted) return failure('maintenance-cancelled')
            const pushed = await push(
              { access: input.access, delivery: value, signal: input.signal },
              true,
            )
            if ('failure' in pushed && pushed.failure.kind !== 'outcome-unknown')
              return pushed.failure.kind === 'denied' ? denied() : failure(pushed.failure.kind)
          }
        }
        const receptions = [...state.receptions.values()]
        for (const reception of receptions) {
          if (input.signal.aborted) return failure('maintenance-cancelled')
          if (
            reception.commit.kind !== 'unknown' ||
            !scope.has(binding(reception.access, reception.target))
          )
            continue
          const pushed = await push({
            access: input.access,
            delivery: reception.delivery,
            signal: input.signal,
          })
          if ('failure' in pushed && pushed.failure.kind !== 'outcome-unknown')
            return pushed.failure.kind === 'denied' ? denied() : failure(pushed.failure.kind)
        }
        const checked = await check()
        if ('failure' in checked) return checked
        return input.signal.aborted ? failure('maintenance-cancelled') : succeed(report(scope))
      })().catch(() => failure('maintenance')),
    )
    const abort = Promise.withResolvers<Awaited<Reply<ToolReceiverReport>>>()
    const stopped = () => abort.resolve(failure('maintenance-cancelled'))
    input.signal.addEventListener('abort', stopped, { once: true })
    if (input.signal.aborted) stopped()
    try {
      return await Promise.race([work, abort.promise])
    } finally {
      input.signal.removeEventListener('abort', stopped)
    }
  }
  return succeed({
    push,
    inspect: () => report(),
    retry: input => maintain(input, false),
    recover: input => maintain(input, true),
  })
}
