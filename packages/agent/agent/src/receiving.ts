import { createHash } from 'node:crypto'
import type { Access, AgentExecutionId, Reply } from '@omne-harness/agent-contract'
import { decodeAgentOperationId } from '@omne-harness/agent-contract'
import {
  judgeModelDelivery,
  resolveModelInvocationRef,
  type ModelDelivery,
  type ModelDeliveryFailure,
  type ModelResultReceiver,
  type ModelSavedReceipt,
} from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { canonical } from './canonical.ts'
import {
  modelDeliveryMaterial,
  modelReceivedDraft,
  readModelDeliveryMaterial,
} from './receiving-material.ts'
import type { ModelReceiverDependencies, ModelReceptionTarget } from './receiving-types.ts'

import { createReceptionOutlet } from './receiving-outlet.ts'
import { createReceptionMaintenance } from './receiving-maintenance.ts'
import {
  bindingKey,
  diagnose as recordDiagnostic,
  receptionReport,
  retainTask,
  tenantKey,
  type Reception,
  type ModelReceiverState,
  type ModelReceiverReport,
} from './receiving-state.ts'
export { createModelReceiverState, ModelReceiverState } from './receiving-state.ts'
export type { ModelReceptionDiagnostic, ModelReceiverReport } from './receiving-state.ts'
export interface AgentModelReceiver<P> extends ModelResultReceiver<P> {
  recover(input: {
    access: Access<P>
    execution: AgentExecutionId
    signal: AbortSignal
  }): Reply<ModelReceiverReport>
  retry(input: {
    access: Access<P>
    execution: AgentExecutionId
    signal: AbortSignal
  }): Reply<ModelReceiverReport>
  inspect(): ModelReceiverReport
}
const unavailable = (dependency: string) =>
  fail<ModelDeliveryFailure>({ kind: 'unavailable', dependency })
const unknown = () => fail<ModelDeliveryFailure>({ kind: 'outcome-unknown' })
const invalid = (field: string, reason: string) =>
  fail<ModelDeliveryFailure>({ kind: 'invalid', field, reason })
function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
const receptionKey = <P>(access: Access<P>, delivery: ModelDelivery) =>
  canonical([tenantKey(access), delivery.key])

export function createAgentModelReceiver<P>(
  dependencies: ModelReceiverDependencies<P>,
  state: ModelReceiverState<P>,
): Outcome<AgentModelReceiver<P>, { kind: 'unsupported' }> {
  const receivedPort = dependencies.provider.received
  if (receivedPort === null) return fail({ kind: 'unsupported' })
  const received = receivedPort
  const diagnose = (operation: string, reason: unknown, reception?: Reception<P>) =>
    recordDiagnostic(
      state,
      operation,
      reason,
      reception ? bindingKey(reception.access, reception.target) : null,
    )
  const outlet = createReceptionOutlet(dependencies, state)
  async function finish(
    reception: Reception<P>,
    query: boolean,
    stopped?: AbortSignal,
  ): Promise<Outcome<ModelSavedReceipt, ModelDeliveryFailure>> {
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
            entry: modelReceivedDraft(reception.delivery, reception.target.pending.consumption),
            material: modelDeliveryMaterial(reception.access, reception.delivery),
          })
    } catch (error) {
      reception.commit = { kind: 'unknown' }
      diagnose(reception.operation, String(error), reception)
      return unknown()
    }
    if ('failure' in result) {
      diagnose(reception.operation, result.failure, reception)
      if (result.failure.kind === 'denied') return fail({ kind: 'denied' })
      if (result.failure.kind === 'conflict') return fail({ kind: 'conflict' })
      if (
        result.failure.kind === 'commit-unknown' ||
        (query && result.failure.kind === 'unavailable')
      ) {
        reception.commit = { kind: 'unknown' }
        return unknown()
      }
      return unavailable('responsibility')
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
    if (stopped?.aborted) {
      if (reception.commit.kind !== 'saved') reception.commit = { kind: 'unknown' }
      return unknown()
    }
    const material = await dependencies.provider.materials.read({
      ...reception.access,
      source: value.entry.material,
    })
    const expected = modelReceivedDraft(reception.delivery, reception.target.pending.consumption)
    if (
      'failure' in material ||
      !readModelDeliveryMaterial(reception.access, material.ok, expected) ||
      canonical(value.entry) !== canonical({ ...expected, material: value.entry.material }) ||
      value.saved.owner !== reception.delivery.consumer.owner
    ) {
      reception.commit = { kind: 'unknown' }
      diagnose(reception.operation, 'committed material or responsibility unavailable', reception)
      return unknown()
    }
    reception.commit = { kind: 'saved', value }
    state.diagnostics.delete(reception.operation)
    outlet.enqueue(reception, value)
    return succeed(structuredClone({ key: reception.delivery.key, evidence: value.saved }))
  }
  async function admit(
    access: Access<P>,
    delivery: ModelDelivery,
    stopped?: AbortSignal,
  ): Promise<Outcome<ModelReceptionTarget, ModelDeliveryFailure>> {
    const key = receptionKey(access, delivery)
    const failed = (dependency: string, error: unknown, target?: ModelReceptionTarget) => {
      recordDiagnostic(
        state,
        `admission:${dependency}:${key}`,
        String(error),
        target ? bindingKey(access, target) : null,
      )
      return unavailable(dependency)
    }
    if (stopped?.aborted) return fail({ kind: 'cancelled-before-accept' })
    let resolved
    try {
      resolved = await dependencies.targets.resolve({
        access,
        reference: delivery.key.reference,
        consumer: delivery.consumer,
      })
    } catch (error) {
      return failed('targets', error)
    }
    if ('failure' in resolved)
      return resolved.failure.kind === 'denied' ? fail({ kind: 'denied' }) : unavailable('targets')
    const target = resolved.ok
    if (stopped?.aborted) return fail({ kind: 'cancelled-before-accept' })
    let allowed
    try {
      allowed = await dependencies.access.check({
        access,
        operation: 'receive-result',
        target: { kind: 'execution', execution: target.execution },
      })
    } catch (error) {
      return failed('access', error)
    }
    if (allowed.kind !== 'allowed')
      return allowed.kind === 'denied' ? fail({ kind: 'denied' }) : unavailable('access')
    if (stopped?.aborted) return fail({ kind: 'cancelled-before-accept' })
    let inspected
    try {
      inspected = await dependencies.models.inspect({
        ...access,
        reference: target.pending.reference,
      })
    } catch (error) {
      return failed('inspect', error, target)
    }
    if ('failure' in inspected)
      return inspected.failure.kind === 'denied' ? fail({ kind: 'denied' }) : unavailable('inspect')
    if (inspected.ok.kind !== 'found') return invalid('key.reference', 'not-accepted')
    const original = resolveModelInvocationRef(target.pending.reference, access.tenant)
    const ref = resolveModelInvocationRef(delivery.key.reference, access.tenant)
    if ('failure' in original || 'failure' in ref || original.ok.admission !== ref.ok.admission)
      return invalid('key.reference', 'not-original')
    if (
      canonical(inspected.ok.state.consumer) !== canonical(delivery.consumer) ||
      canonical(target.pending.position) !== canonical(delivery.consumer)
    )
      return invalid('consumer', 'not-original')
    const judged = judgeModelDelivery({ tenant: access.tenant, delivery })
    if ('failure' in judged) return invalid(judged.failure.field, judged.failure.reason)
    if (stopped?.aborted) return fail({ kind: 'cancelled-before-accept' })
    let dispatches
    try {
      dispatches = await dependencies.models.dispatches({ ...access, call: ref.ok.call })
    } catch (error) {
      return failed('dispatches', error, target)
    }
    if ('failure' in dispatches) return unavailable('dispatches')
    const ids = new Set(dispatches.ok.map(value => value.dispatch))
    if (
      delivery.kind === 'result' &&
      (delivery.accounts.length !== ids.size ||
        delivery.accounts.some(item => !ids.has(item.dispatch)))
    )
      return invalid('accounts', 'dispatch-set-mismatch')
    if (delivery.kind === 'account' && !ids.has(delivery.key.dispatch))
      return invalid('key.dispatch', 'not-original')
    return succeed(structuredClone(target))
  }
  async function push(
    original: Parameters<ModelResultReceiver<P>['push']>[0],
    maintenance = false,
  ): ReturnType<ModelResultReceiver<P>['push']> {
    const input = { ...original, access: { ...original.access } }
    const delivery = freeze(structuredClone(input.delivery))
    const ref = resolveModelInvocationRef(delivery.key.reference, input.access.tenant)
    if ('failure' in ref)
      return ref.failure.kind === 'malformed'
        ? invalid('key.reference', 'reference-malformed')
        : fail({ kind: 'denied' })
    const before = await admit(input.access, delivery, maintenance ? input.signal : undefined)
    if ('failure' in before) return before
    if (maintenance && input.signal.aborted) return unknown()
    const target = before.ok
    const key = receptionKey(input.access, delivery),
      tenant = tenantKey(input.access)
    let reception = state.receptions.get(key)
    if (reception && canonical(reception.delivery) !== canonical(delivery))
      return fail({ kind: 'conflict' })
    if (!reception && input.signal.aborted) return fail({ kind: 'cancelled-before-accept' })
    const capacity = dependencies.capacity(input.access.tenant)
    if (Object.values(capacity).some(value => !Number.isSafeInteger(value) || value < 0))
      return unavailable('capacity')
    const active = state.active.get(tenant) ?? 0
    if (active >= capacity.inFlight) return fail({ kind: 'backpressured', resource: 'in-flight' })
    if (state.writing.has(key)) return unknown()
    if (!reception) {
      const bytes = Buffer.byteLength(canonical(delivery))
      const references = new Set<string>()
      const visit = (value: unknown): void => {
        if (typeof value !== 'object' || value === null) return
        if ('storage' in value && 'key' in value) references.add(canonical(value))
        for (const child of Object.values(value)) visit(child)
      }
      visit(delivery)
      const attachments = references.size
      const sameTenant = [...state.receptions.values()].filter(
        item => tenantKey(item.access) === tenant,
      )
      if (sameTenant.length >= capacity.records)
        return fail({ kind: 'backpressured', resource: 'records' })
      if (sameTenant.reduce((sum, item) => sum + item.bytes, bytes) > capacity.bytes)
        return fail({ kind: 'backpressured', resource: 'bytes' })
      if (
        sameTenant.reduce((sum, item) => sum + item.attachments, attachments) > capacity.attachments
      )
        return fail({ kind: 'backpressured', resource: 'attachments' })
      const operation = decodeAgentOperationId(
        `received-${createHash('sha256').update(key).digest('hex')}`,
      )
      if ('failure' in operation) throw new Error('invalid derived reception operation')
      reception = {
        access: input.access,
        target,
        binding: bindingKey(input.access, target),
        delivery,
        operation: operation.ok,
        bytes,
        attachments,
        commit: { kind: 'new' },
      }
      state.receptions.set(key, reception)
    }
    reception.access = input.access
    state.active.set(tenant, active + 1)
    state.writing.add(key)
    const current = reception
    const previouslySaved = current.commit.kind === 'saved'
    const work = (async () => {
      try {
        const outcome = await finish(
          current,
          current.commit.kind === 'unknown' ||
            current.commit.kind === 'saved' ||
            current.commit.kind === 'excluded',
          maintenance ? input.signal : undefined,
        )
        if ('ok' in outcome)
          outlet.drain(input.access, new Set([bindingKey(input.access, target)]), input.signal)
        return outcome
      } finally {
        state.active.set(tenant, (state.active.get(tenant) ?? 1) - 1)
        state.writing.delete(key)
      }
    })().catch(error => {
      current.commit = { kind: 'unknown' }
      diagnose(current.operation, String(error), current)
      return unknown()
    })
    retainTask(state, work)
    if (previouslySaved) return work
    if (input.signal.aborted)
      return current.commit.kind === 'saved'
        ? succeed(
            structuredClone({ key: current.delivery.key, evidence: current.commit.value.saved }),
          )
        : unknown()
    const abort = Promise.withResolvers<Outcome<ModelSavedReceipt, ModelDeliveryFailure>>()
    const onAbort = () =>
      abort.resolve(
        current.commit.kind === 'saved'
          ? succeed(
              structuredClone({
                key: current.delivery.key,
                evidence: current.commit.value.saved,
              }),
            )
          : unknown(),
      )
    input.signal.addEventListener('abort', onAbort, { once: true })
    try {
      return await Promise.race([work, abort.promise])
    } finally {
      input.signal.removeEventListener('abort', onAbort)
    }
  }
  const receiver: AgentModelReceiver<P> = {
    inspect: () => receptionReport(state),
    push,
    retry: input => maintenance.retry(input),
    recover: input => maintenance.recover(input),
  }
  const maintenance = createReceptionMaintenance(
    dependencies,
    state,
    input => push(input, true),
    outlet,
  )
  return succeed(receiver)
}
