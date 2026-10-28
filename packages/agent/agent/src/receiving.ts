import { createHash } from 'node:crypto'
import type {
  Access,
  AgentAccountHandoff,
  AgentAccountOutcome,
  AgentExecutionId,
  AgentOperationId,
  ReceivedCommitValue,
} from '@omne-harness/agent-contract'
import { decodeAgentOperationId } from '@omne-harness/agent-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
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

type CommitState =
  | { kind: 'new' }
  | { kind: 'unknown' }
  | { kind: 'saved'; value: ReceivedCommitValue }
  | { kind: 'excluded' }
type Reception<P> = {
  access: Access<P>
  target: ModelReceptionTarget
  delivery: ModelDelivery
  operation: AgentOperationId
  bytes: number
  attachments: number
  commit: CommitState
}
type Outbound<P> = {
  access: Access<P>
  execution: AgentExecutionId
  handoff: AgentAccountHandoff
} & ({ kind: 'pending' } | { kind: 'received' } | { kind: 'blocked'; reason: AgentAccountOutcome })
export type ModelReceptionDiagnostic = Readonly<{ operation: string; reason: string }>
/** Owned by the host, and passed unchanged when it reassembles a receiver. */
export class ModelReceiverState<P> {
  readonly receptions = new Map<string, Reception<P>>()
  readonly outbound = new Map<string, Outbound<P>>()
  readonly outletActive = new Set<string>()
  readonly active = new Map<string, number>()
  readonly writing = new Set<string>()
  readonly diagnostics = new Map<string, ModelReceptionDiagnostic>()
}
export const createModelReceiverState = <P>() => new ModelReceiverState<P>()
export type ModelReceiverReport = Readonly<{
  pending: number
  blocked: number
  diagnostics: readonly ModelReceptionDiagnostic[]
}>
export interface AgentModelReceiver<P> extends ModelResultReceiver<P> {
  recover(input: {
    access: Access<P>
    execution: AgentExecutionId
    signal: AbortSignal
  }): Promise<ModelReceiverReport>
  retry(input: {
    access: Access<P>
    execution: AgentExecutionId
    signal: AbortSignal
  }): Promise<ModelReceiverReport>
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
function tenantKey<P>(access: Access<P>) {
  const encoded = tenantCodec.encode(access.tenant)
  return encoded.ok ? encoded.value : ''
}
const receptionKey = <P>(access: Access<P>, delivery: ModelDelivery) =>
  canonical([tenantKey(access), delivery.key])
const sameExecution = <P>(
  value: { access: Access<P>; execution: AgentExecutionId },
  input: { access: Access<P>; execution: AgentExecutionId },
) => tenantKey(value.access) === tenantKey(input.access) && value.execution === input.execution

export function createAgentModelReceiver<P>(
  dependencies: ModelReceiverDependencies<P>,
  state: ModelReceiverState<P>,
): Outcome<AgentModelReceiver<P>, { kind: 'unsupported' }> {
  const receivedPort = dependencies.provider.received
  if (receivedPort === null) return fail({ kind: 'unsupported' })
  const received = receivedPort
  const diagnose = (operation: string, reason: unknown) =>
    state.diagnostics.set(operation, { operation, reason: canonical(reason) })
  const report = (): ModelReceiverReport => ({
    pending:
      [...state.outbound.values()].filter(value => value.kind === 'pending').length +
      [...state.receptions.values()].filter(value => value.commit.kind === 'unknown').length,
    blocked: [...state.outbound.values()].filter(value => value.kind === 'blocked').length,
    diagnostics: structuredClone([...state.diagnostics.values()]),
  })
  function enqueue(reception: Reception<P>, value: ReceivedCommitValue) {
    const delivery = reception.delivery
    const accounts =
      delivery.kind === 'result'
        ? delivery.accounts
        : [{ dispatch: delivery.key.dispatch, account: delivery.account }]
    for (const item of accounts) {
      if (item.account === null) continue
      const handoff: AgentAccountHandoff = {
        call: delivery.key.reference,
        dispatch: item.dispatch,
        account: item.account,
        resultVersion: delivery.kind === 'result' ? delivery.key.result : null,
        committed: value.saved,
      }
      const key = canonical([
        tenantKey(reception.access),
        handoff.call,
        handoff.dispatch,
        handoff.account.revision,
      ])
      const prior = state.outbound.get(key)
      if (prior) {
        if (canonical(prior.handoff.account) !== canonical(handoff.account))
          diagnose(key, 'account revision conflict')
        continue
      }
      state.outbound.set(key, {
        kind: 'pending',
        access: reception.access,
        execution: reception.target.execution,
        handoff,
      })
    }
  }
  async function drain(input: {
    access: Access<P>
    execution: AgentExecutionId
    signal: AbortSignal
  }) {
    for (const [key, item] of state.outbound) {
      if (
        input.signal.aborted ||
        item.kind !== 'pending' ||
        !sameExecution(item, input) ||
        state.outletActive.has(key)
      )
        continue
      state.outletActive.add(key)
      let result: AgentAccountOutcome
      try {
        result = await dependencies.outlet.deliver({
          access: input.access,
          handoff: structuredClone(item.handoff),
        })
      } catch (error) {
        diagnose(key, String(error))
        continue
      } finally {
        state.outletActive.delete(key)
      }
      if (result.kind === 'received') {
        state.outbound.set(key, { ...item, kind: 'received' })
        state.diagnostics.delete(key)
      } else if (result.kind === 'unknown' || result.kind === 'unavailable') diagnose(key, result)
      else {
        state.outbound.set(key, { ...item, kind: 'blocked', reason: result })
        diagnose(key, result)
      }
    }
  }
  async function finish(
    reception: Reception<P>,
    query: boolean,
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
      diagnose(reception.operation, String(error))
      return unknown()
    }
    if ('failure' in result) {
      diagnose(reception.operation, result.failure)
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
      diagnose(reception.operation, 'committed material or responsibility unavailable')
      return unknown()
    }
    reception.commit = { kind: 'saved', value }
    state.diagnostics.delete(reception.operation)
    enqueue(reception, value)
    return succeed(structuredClone({ key: reception.delivery.key, evidence: value.saved }))
  }
  const receiver: AgentModelReceiver<P> = {
    inspect: report,
    async push(original) {
      const input = { ...original, access: { ...original.access } }
      const delivery = freeze(structuredClone(input.delivery))
      const ref = resolveModelInvocationRef(delivery.key.reference, input.access.tenant)
      if ('failure' in ref)
        return ref.failure.kind === 'malformed'
          ? invalid('key.reference', 'reference-malformed')
          : fail({ kind: 'denied' })
      let target: ModelReceptionTarget
      try {
        const resolved = await dependencies.targets.resolve({
          access: input.access,
          reference: delivery.key.reference,
          consumer: delivery.consumer,
        })
        if ('failure' in resolved)
          return resolved.failure.kind === 'denied'
            ? fail({ kind: 'denied' })
            : unavailable('targets')
        target = resolved.ok
        const allowed = await dependencies.access.check({
          access: input.access,
          operation: 'receive-result',
          target: { kind: 'execution', instance: target.instance, execution: target.execution },
        })
        if (allowed.kind !== 'allowed')
          return allowed.kind === 'denied' ? fail({ kind: 'denied' }) : unavailable('access')
      } catch {
        return unavailable('access')
      }
      try {
        const original = resolveModelInvocationRef(target.pending.reference, input.access.tenant)
        const inspected = await dependencies.models.inspect({
          ...input.access,
          reference: target.pending.reference,
        })
        if ('failure' in inspected)
          return inspected.failure.kind === 'denied'
            ? fail({ kind: 'denied' })
            : unavailable('inspect')
        if (inspected.ok.kind !== 'found') return invalid('key.reference', 'not-accepted')
        if ('failure' in original || original.ok.admission !== ref.ok.admission)
          return invalid('key.reference', 'not-original')
        if (
          canonical(inspected.ok.state.consumer) !== canonical(delivery.consumer) ||
          canonical(target.pending.position) !== canonical(delivery.consumer)
        )
          return invalid('consumer', 'not-original')
        const judged = judgeModelDelivery({ tenant: input.access.tenant, delivery })
        if ('failure' in judged) return invalid(judged.failure.field, judged.failure.reason)
        const dispatches = await dependencies.models.dispatches({
          ...input.access,
          call: ref.ok.call,
        })
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
      } catch {
        return unavailable('dispatches')
      }
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
          sameTenant.reduce((sum, item) => sum + item.attachments, attachments) >
          capacity.attachments
        )
          return fail({ kind: 'backpressured', resource: 'attachments' })
        const operation = decodeAgentOperationId(
          `received-${createHash('sha256').update(key).digest('hex')}`,
        )
        if ('failure' in operation) throw new Error('invalid derived reception operation')
        reception = {
          access: input.access,
          target,
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
          )
          if ('ok' in outcome)
            await drain({ access: input.access, execution: target.execution, signal: input.signal })
          return outcome
        } finally {
          state.active.set(tenant, (state.active.get(tenant) ?? 1) - 1)
          state.writing.delete(key)
        }
      })().catch(error => {
        current.commit = { kind: 'unknown' }
        diagnose(current.operation, String(error))
        return unknown()
      })
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
    },
    async retry(input) {
      for (const reception of state.receptions.values()) {
        if (input.signal.aborted) break
        if (
          sameExecution(
            { access: reception.access, execution: reception.target.execution },
            input,
          ) &&
          reception.commit.kind === 'unknown'
        )
          await receiver.push({
            access: input.access,
            delivery: reception.delivery,
            signal: input.signal,
          })
      }
      await drain(input)
      return report()
    },
    async recover(input) {
      const snapshot = await dependencies.provider.journal.load({
        ...input.access,
        execution: input.execution,
      })
      if ('failure' in snapshot || snapshot.ok.entries === undefined) {
        diagnose(input.execution, 'received entries unavailable')
        return report()
      }
      for (const entry of snapshot.ok.entries) {
        if (input.signal.aborted) break
        if (entry.kind !== 'received' || entry.delivery.producer !== 'model') continue
        const { material: source, ...expected } = entry
        const material = await dependencies.provider.materials.read({ ...input.access, source })
        if ('failure' in material) {
          diagnose(input.execution, material.failure)
          continue
        }
        const delivery = readModelDeliveryMaterial(input.access, material.ok, expected)
        if (!delivery) {
          diagnose(input.execution, 'invalid received material')
          continue
        }
        await receiver.push({ access: input.access, delivery, signal: input.signal })
      }
      return receiver.retry(input)
    },
  }
  return succeed(receiver)
}
