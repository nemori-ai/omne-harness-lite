import { pendingCalls } from './pending.ts'
import { createHash } from 'node:crypto'
import type {
  Access,
  AgentExecutionId,
  AgentInstanceId,
  AgentJournalEntries,
  AgentJournalEntry,
  AgentMaterials,
  AgentReceivedCommits,
  CommandReceipt,
  DurableEvidence,
  ExecutionMutation,
  Failure,
  JournalEntryRecord,
  Material,
  ReceivedCommitInput,
  ReceivedCommitValue,
  ReceivedCommitResult,
  ReceivedEntry,
} from '@omne-harness/agent-contract'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeConsumptionId,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { resolveToolInvocationRef } from '@omne-harness/tool-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ModelReceptionTarget, ModelReceptionTargets } from './reception-targets.ts'
import { canonical } from './canonical.ts'
import { jsonTree } from './material-value.ts'
import type { Attempt, JournalWrite, MemoryExecution, OperationRecord } from './journal.ts'
import { journalEvidence, semanticKey } from './journal-values.ts'

type Input<P> = ReceivedCommitInput<P, ContentBlock>
export type Kept = { entry: ReceivedEntry; receipt: CommandReceipt; saved: DurableEvidence | null }
export type Stored = {
  tenant: string
  execution: AgentExecutionId | null
  value: Material<ContentBlock>
}
type Qualification = 'allowed' | 'denied' | 'unavailable'
export type JournalReceivingControls<P> = ReturnType<typeof createJournalReceiving<P>>['controls']
/**
 * The scripted fault of the next `record` of one execution that reaches its write step; the same
 * shape as the conformance suite's `RecordFault`. `commit-unknown` with outcome `applied`: the
 * entry and its event are written, only the reply is lost. `unavailable`: the call fails before
 * publication and leaves neither.
 */
export type RecordFault =
  | Readonly<{ kind: 'commit-unknown'; outcome: 'applied' }>
  | Readonly<{ kind: 'unavailable' }>
type Hooks<P> = {
  authorize(input: Access<P>, action: string): Failure | undefined
  gate(): string | null
  custodian?(input: Access<P> & { execution: AgentExecutionId }): boolean
  owned(
    input: Access<P> & { execution: AgentExecutionId },
    action: string,
  ): Outcome<MemoryExecution, Failure>
  operations(): Map<string, OperationRecord>
  state(): ReceivingState
  mutate<T>(action: () => T): T
  touch(): void
  namespace: string
  operationKey(
    tenant: TenantId,
    execution: AgentExecutionId,
    operation: ExecutionMutation<P>['operation'],
  ): string | undefined
  write<R>(
    method: JournalWrite,
    input: ExecutionMutation<P>,
    key: string,
    prepare: () => Attempt<R>,
    beforeRecognition?: () => Failure | undefined,
  ): Promise<Outcome<R, Failure>>
  holds(
    execution: MemoryExecution,
    authority: NonNullable<JournalEntryRecord<P>['authority']>,
  ): boolean
  receiptOf(
    execution: MemoryExecution,
    operation: ExecutionMutation<P>['operation'],
    revision: number,
    evidence: DurableEvidence,
    state: CommandReceipt['state'],
  ): CommandReceipt
  nextEvidence(execution: MemoryExecution, what: string, revision: number): DurableEvidence
  /**
   * Allocates the `entry` event of a written entry inside the same transaction (SPEC "日志条目"
   * 6): the next sequence under the latest established attachment, `cause` the evidence of the
   * receipt; nothing after the execution ended.
   */
  projectEntry(execution: MemoryExecution, entry: AgentJournalEntry, cause: DurableEvidence): void
}
const unavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: 'memory-agent-journal',
  diagnostic,
})
const denied = (): Failure => ({ kind: 'denied', action: 'received-custody' })
const conflict = <P>(input: ExecutionMutation<P>): Failure => ({
  kind: 'conflict',
  operation: input.operation,
})
const invalid = (field: string): Failure => ({ kind: 'invalid', field, reason: 'invalid input' })
const tenantText = (tenant: TenantId) => {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? encoded.value : ''
}
const executionText = <P>(input: Access<P> & { execution: AgentExecutionId }) =>
  canonical([tenantText(input.tenant), input.execution])
const deliveryText = <P>(
  input: Access<P> & { execution: AgentExecutionId },
  entry: Omit<ReceivedEntry, 'material'>,
) =>
  canonical([
    tenantText(input.tenant),
    input.execution,
    entry.delivery.producer,
    entry.delivery.key,
  ])
const textOf = <P>(input: Input<P>) =>
  `received:${canonical({ entry: input.entry, material: input.material })}`
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function shape<P>(input: Input<P>): Failure | undefined {
  if (!tenantCodec.encode(input.tenant).ok) return invalid('tenant')
  if ('failure' in decodeAgentExecutionId(input.execution)) return invalid('execution')
  if ('failure' in decodeAgentOperationId(input.operation)) return invalid('operation')
  if (!object(input.entry) || input.entry.kind !== 'received') return invalid('entry')
  if (!object(input.entry.consumer)) return invalid('entry.consumer')
  for (const field of ['owner', 'work', 'position', 'purpose'] as const)
    if (typeof input.entry.consumer[field] !== 'string' || !input.entry.consumer[field])
      return invalid(`entry.consumer.${field}`)
  if ('failure' in decodeConsumptionId(input.entry.consumption)) return invalid('entry.consumption')
  if (!object(input.entry.delivery) || !object(input.entry.delivery.key))
    return invalid('entry.delivery')
  const { delivery } = input.entry
  const resolved =
    delivery.producer === 'model'
      ? resolveModelInvocationRef(delivery.key.reference, input.tenant)
      : resolveToolInvocationRef(delivery.key.reference, input.tenant)
  if ('failure' in resolved)
    return resolved.failure.kind === 'foreign-tenant'
      ? denied()
      : invalid('entry.delivery.key.reference')
  if (!object(input.material)) return invalid('material')
  if (input.material.kind === 'facts') {
    if (!object(input.material.schema)) return invalid('material.schema')
    for (const field of ['owner', 'name', 'revision', 'digest'] as const)
      if (typeof input.material.schema[field] !== 'string' || !input.material.schema[field])
        return invalid(`material.schema.${field}`)
    if (!jsonTree(input.material.value)) return invalid('material.value')
  } else if (input.material.kind !== 'model' && input.material.kind !== 'tool')
    return invalid('material.kind')
  return undefined
}

export type ReceivingState = {
  materials: Map<string, Stored>
  deliveries: Map<string, Kept>
  aliases: Map<string, Kept>
  bindings: Map<string, { execution: AgentExecutionId; text: string }>
  consumerExecutions: Map<string, AgentExecutionId>
  pendingBindings: Map<
    string,
    readonly {
      execution: AgentExecutionId
      pending: import('@omne-harness/agent-contract').PendingCall
    }[]
  >
  targets: Map<string, ModelReceptionTarget>
  callTargets: Map<string, ModelReceptionTarget>
  executionTargets: Map<string, ModelReceptionTarget[]>
}
export function emptyReceivingState(): ReceivingState {
  return {
    materials: new Map(),
    deliveries: new Map(),
    aliases: new Map(),
    bindings: new Map(),
    consumerExecutions: new Map(),
    pendingBindings: new Map(),
    targets: new Map(),
    callTargets: new Map(),
    executionTargets: new Map(),
  }
}

export function createJournalReceiving<P>(hooks: Hooks<P>) {
  const qualifications = new Map<string, Map<P, Qualification>>()
  const pauses = new Map<
    string,
    { reached(source: DurableEvidence): void; released: Promise<void> }
  >()
  const faults = new Map<string, 'before-publish' | 'after-publish'>()
  const recordFaults = new Map<string, RecordFault>()
  const operationKey = (input: ExecutionMutation<P>) =>
    hooks.operationKey(input.tenant, input.execution, input.operation) ?? ''
  const targetKey = (access: Pick<Access<P>, 'tenant'>, reference: string) =>
    canonical([tenantText(access.tenant), reference])
  const qualified = (
    input: Access<P> & { execution: AgentExecutionId },
    custody = true,
  ): Outcome<MemoryExecution, Failure> => {
    const found = hooks.owned(input, 'received-custody')
    if ('failure' in found) return found
    if (custody && hooks.custodian && !hooks.custodian(input)) return fail(denied())
    const status = qualifications.get(executionText(input))?.get(input.principal)
    if (status === 'unavailable') return fail(unavailable('qualification-unavailable'))
    return status === 'denied' ? fail(denied()) : found
  }
  const readMaterial = (
    access: Access<P>,
    source: DurableEvidence,
  ): Outcome<Material<ContentBlock>, Failure> => {
    const refusal = hooks.authorize(access, 'materials.read')
    if (refusal) return fail(refusal)
    const stored = hooks.state().materials.get(canonical(source))
    if (!stored || stored.tenant !== tenantText(access.tenant))
      return fail(unavailable('material-unreadable'))
    if (stored.execution !== null) {
      const check = qualified({ ...access, execution: stored.execution }, false)
      if ('failure' in check) return check
    }
    return succeed(structuredClone(stored.value))
  }
  const rich = (access: Access<P>, kept: Kept): Outcome<ReceivedCommitValue, Failure> => {
    const material = readMaterial(access, kept.entry.material)
    if ('failure' in material) return material
    if (kept.saved === null) return fail({ kind: 'unsupported' })
    return succeed(structuredClone({ entry: kept.entry, receipt: kept.receipt, saved: kept.saved }))
  }
  const bound = (input: Input<P>): Failure | undefined => {
    const binding = hooks.state().bindings.get(deliveryText(input, input.entry))
    if (binding)
      return binding.execution === input.execution && binding.text === textOf(input)
        ? undefined
        : conflict(input)
    const originals =
      hooks.state().pendingBindings.get(targetKey(input, input.entry.delivery.key.reference)) ?? []
    if (originals.length === 0) return denied()
    if (originals.length !== 1) return conflict(input)
    const target = originals[0]!
    return target.execution === input.execution &&
      target.pending.consumption === input.entry.consumption &&
      canonical(target.pending.position) === canonical(input.entry.consumer)
      ? undefined
      : conflict(input)
  }
  const alias = (input: ExecutionMutation<P>, key: string, kept: Kept) => {
    hooks.touch()
    hooks.state().aliases.set(operationKey(input), kept)
    hooks.operations().set(operationKey(input), {
      kind: 'committed',
      key,
      value: { kind: 'committed', value: kept },
      receipt: kept.receipt,
    })
  }
  const sourceOf = (input: Input<P>) =>
    journalEvidence(
      canonical([
        hooks.namespace,
        'received-material',
        executionText(input),
        input.entry.delivery.key,
        input.entry.consumer,
        input.entry.consumption,
      ]),
      1,
    )
  const received: AgentReceivedCommits<P, ContentBlock> = {
    async commit(original) {
      const malformed = shape(original)
      if (malformed) return fail(malformed)
      const input = {
        ...original,
        entry: structuredClone(original.entry),
        material: structuredClone(original.material),
      }
      const text = textOf(input)
      const check = () => {
        const permission = qualified(input)
        return 'failure' in permission ? permission.failure : bound(input)
      }
      const first = check()
      if (first) return fail(first)
      const pause = pauses.get(operationKey(input))
      if (pause) {
        pauses.delete(operationKey(input))
        pause.reached(sourceOf(input))
        await pause.released
      }
      const fault = faults.get(operationKey(input))
      faults.delete(operationKey(input))
      if (fault === 'before-publish') return fail(unavailable('injected-before-publish'))
      const outcome = await hooks.write<ReceivedCommitResult>(
        'received',
        input,
        text,
        () => {
          const permission = qualified(input)
          if ('failure' in permission) return { kind: 'answer', value: permission }
          const execution = permission.ok
          const previous = hooks.operations().get(operationKey(input))
          if (previous?.kind === 'excluded')
            return {
              kind: 'answer',
              value:
                previous.key === text
                  ? succeed({ kind: 'excluded' as const, evidence: previous.evidence })
                  : fail(conflict(input)),
            }
          if (previous?.kind === 'committed' && previous.key !== text) {
            const old = hooks.state().aliases.get(operationKey(input))
            if (
              !old ||
              canonical(old.entry) !== canonical({ ...input.entry, material: old.entry.material })
            )
              return { kind: 'answer', value: fail(conflict(input)) }
          }
          const kept = hooks.state().deliveries.get(deliveryText(input, input.entry))
          if (kept) {
            if (
              kept.receipt.execution !== input.execution ||
              canonical(kept.entry) !== canonical({ ...input.entry, material: kept.entry.material })
            )
              return { kind: 'answer', value: fail(conflict(input)) }
            const material = readMaterial(input, kept.entry.material)
            if ('failure' in material) return { kind: 'answer', value: material }
            if (canonical(material.ok) !== canonical(input.material))
              return { kind: 'answer', value: fail(conflict(input)) }
            const value = rich(input, kept)
            if ('failure' in value) return { kind: 'answer', value }
            alias(input, text, kept)
            return {
              kind: 'answer',
              value: succeed({ kind: 'committed' as const, value: value.ok }),
            }
          }
          if (previous) return { kind: 'answer', value: fail(conflict(input)) }
          const revision = execution.revision + 1
          const receipt = hooks.receiptOf(
            execution,
            input.operation,
            revision,
            hooks.nextEvidence(execution, 'received', revision),
            'applied',
          )
          const entry: ReceivedEntry = { ...input.entry, material: sourceOf(input) }
          const saved: DurableEvidence = {
            owner: entry.consumer.owner,
            record: `received:${createHash('sha256').update(deliveryText(input, entry)).digest('hex')}`,
            revision: String(revision),
            digest: createHash('sha256')
              .update(canonical([entry, input.material, receipt]))
              .digest('hex'),
          }
          const value = { receipt, entry, saved }
          return {
            kind: 'write',
            receipt,
            value: { kind: 'committed' as const, value: structuredClone(value) },
            apply() {
              hooks.state().materials.set(canonical(entry.material), {
                tenant: tenantText(input.tenant),
                execution: input.execution,
                value: input.material,
              })
              execution.entries.push(entry)
              execution.revision = revision
              hooks.state().deliveries.set(deliveryText(input, entry), value)
              hooks.state().aliases.set(operationKey(input), value)
              hooks.projectEntry(execution, entry, receipt.evidence)
            },
          }
        },
        check,
      )
      return fault === 'after-publish' && 'ok' in outcome
        ? fail({ kind: 'commit-unknown', operation: input.operation })
        : outcome
    },
    async query(input) {
      if (!tenantCodec.encode(input.tenant).ok) return fail(invalid('tenant'))
      if ('failure' in decodeAgentExecutionId(input.execution)) return fail(invalid('execution'))
      if ('failure' in decodeAgentOperationId(input.operation)) return fail(invalid('operation'))
      const found = qualified(input)
      if ('failure' in found) return found
      const operation = hooks.operations().get(operationKey(input))
      if (!operation || operation.kind === 'pending') return succeed({ kind: 'unknown' })
      if (operation.kind === 'excluded')
        return succeed({ kind: 'excluded', evidence: structuredClone(operation.evidence) })
      const kept = hooks.state().aliases.get(operationKey(input))
      if (!kept || kept.saved === null) return fail({ kind: 'unsupported' })
      const value = rich(input, kept)
      return 'failure' in value ? value : succeed({ kind: 'committed', value: value.ok })
    },
  }
  const entries: AgentJournalEntries<P> = {
    async record(original) {
      const input = { ...original, entry: structuredClone(original.entry) }
      const text = semanticKey('record', { entry: input.entry, authority: input.authority })
      // The scripted fault this call consumed at its write step, if any; a refused call and a
      // call that recalls an original receipt never reach that step.
      let scripted: RecordFault | undefined
      const outcome = await hooks.write('record', input, text, () => {
        const found = qualified(input, input.entry.kind === 'received')
        if ('failure' in found) return { kind: 'answer', value: found }
        const execution = found.ok
        if ((input.entry.kind === 'received') !== (input.authority === null))
          return { kind: 'answer', value: fail(invalid('authority')) }
        if (input.entry.kind !== 'received') {
          if (execution.state.kind === 'ended')
            return { kind: 'answer', value: fail({ kind: 'terminal' }) }
          if (!input.authority || !hooks.holds(execution, input.authority))
            return { kind: 'answer', value: fail({ kind: 'stale-advance' }) }
        } else {
          const ref =
            input.entry.delivery.producer === 'model'
              ? resolveModelInvocationRef(input.entry.delivery.key.reference, input.tenant)
              : resolveToolInvocationRef(input.entry.delivery.key.reference, input.tenant)
          if ('failure' in ref) return { kind: 'answer', value: fail(denied()) }
        }
        const previous = hooks.operations().get(operationKey(input))
        if (previous) {
          const old = hooks.state().aliases.get(operationKey(input))
          if (
            previous.kind !== 'committed' ||
            (previous.key !== text && (!old || canonical(old.entry) !== canonical(input.entry)))
          )
            return { kind: 'answer', value: fail(conflict(input)) }
          return { kind: 'answer', value: succeed(structuredClone(previous.receipt)) }
        }
        if (input.entry.kind === 'received') {
          const kept = hooks.state().deliveries.get(deliveryText(input, input.entry))
          if (kept) {
            if (
              kept.receipt.execution !== input.execution ||
              canonical(kept.entry) !== canonical(input.entry)
            )
              return { kind: 'answer', value: fail(conflict(input)) }
            alias(input, text, kept)
            return { kind: 'answer', value: succeed(structuredClone(kept.receipt)) }
          }
        }
        // The write step: the only place a scripted fault of this execution is consumed.
        scripted = recordFaults.get(executionText(input))
        if (scripted !== undefined) {
          recordFaults.delete(executionText(input))
          if (scripted.kind === 'unavailable')
            return { kind: 'answer', value: fail(unavailable('record is scripted unavailable')) }
        }
        const revision = execution.revision + 1
        const receipt = hooks.receiptOf(
          execution,
          input.operation,
          revision,
          hooks.nextEvidence(execution, 'record', revision),
          'applied',
        )
        return {
          kind: 'write',
          receipt,
          value: structuredClone(receipt),
          apply() {
            execution.entries.push(input.entry)
            execution.revision = revision
            if (input.entry.kind === 'received') {
              const kept = { entry: input.entry, receipt, saved: null }
              hooks.state().deliveries.set(deliveryText(input, input.entry), kept)
              hooks.touch()
              hooks.state().aliases.set(operationKey(input), kept)
            }
            hooks.projectEntry(execution, input.entry, receipt.evidence)
          },
        }
      })
      // A lost reply: the write took effect, the caller gets commit-unknown and recalls it by
      // the same operation.
      return scripted?.kind === 'commit-unknown' && 'ok' in outcome
        ? fail({ kind: 'commit-unknown', operation: input.operation })
        : outcome
    },
  }
  const materialPort: AgentMaterials<P, ContentBlock> = {
    async preserve(input) {
      const refusal = hooks.authorize(input, 'materials.preserve')
      if (refusal) return fail(refusal)
      if (hooks.gate() !== null) return fail(unavailable('quarantined scope'))
      return hooks.mutate(() => {
        if (!tenantCodec.encode(input.tenant).ok) return fail(denied())
        const source = journalEvidence(
          canonical([
            hooks.namespace,
            'material',
            tenantText(input.tenant),
            input.identity,
            input.consumer,
          ]),
          1,
        )
        const old = hooks.state().materials.get(canonical(source))
        if (old && canonical(old.value) !== canonical(input.value)) return fail(invalid('identity'))
        const execution =
          hooks
            .state()
            .consumerExecutions.get(canonical([tenantText(input.tenant), input.consumer])) ?? null
        if (execution !== null) {
          const permission = qualified({ ...input, execution })
          if ('failure' in permission) return permission
        }
        if (old) return succeed(source)
        hooks.state().materials.set(canonical(source), {
          tenant: tenantText(input.tenant),
          execution,
          value: structuredClone(input.value),
        })
        hooks.touch()
        return succeed(source)
      })
    },
    async read(input) {
      return readMaterial(input, input.source)
    },
  }
  const controls = {
    async bind(input: Input<P>) {
      return hooks.mutate(() => {
        const key = deliveryText(input, input.entry),
          text = textOf(input)
        const old = hooks.state().bindings.get(key)
        if (old && (old.text !== text || old.execution !== input.execution))
          throw new TypeError('frozen binding cannot change')
        hooks.state().bindings.set(key, { execution: input.execution, text })
        hooks
          .state()
          .consumerExecutions.set(
            canonical([tenantText(input.tenant), input.entry.consumer]),
            input.execution,
          )
        hooks.touch()
      })
    },
    material: (name: string): Material<ContentBlock> => ({
      kind: 'facts',
      schema: { owner: 'suite', name: 'payload', revision: '1', digest: 'fixture' },
      value: { kind: 'string', value: name },
    }),
    async inspect(access: Access<P>, execution: AgentExecutionId) {
      const found = hooks.owned({ ...access, execution }, 'inspect')
      if ('failure' in found) throw new Error('execution unavailable')
      return {
        revision: found.ok.revision,
        entries: found.ok.entries.length,
        materials: [...hooks.state().materials.values()].filter(
          value => value.tenant === tenantText(access.tenant) && value.execution === execution,
        ).length,
      }
    },
    pause(input: ExecutionMutation<P>) {
      const reached = Promise.withResolvers<DurableEvidence>(),
        released = Promise.withResolvers<void>()
      pauses.set(operationKey(input), { reached: reached.resolve, released: released.promise })
      return { reached: reached.promise, release: () => released.resolve() }
    },
    fault(input: ExecutionMutation<P>, point: 'before-publish' | 'after-publish') {
      faults.set(operationKey(input), point)
    },
    /**
     * Scripts the next `record` on `execution` that reaches its write step. A refused call and a
     * call that recalls an original receipt do not consume it; the fault of a later arrangement
     * replaces an unconsumed one.
     */
    failNextRecord(input: Access<P> & { execution: AgentExecutionId }, fault: RecordFault) {
      recordFaults.set(executionText(input), fault)
    },
    async exclude(input: Input<P>, evidence: DurableEvidence) {
      return hooks.mutate(() => {
        hooks.operations().set(operationKey(input), {
          kind: 'excluded',
          key: textOf(input),
          evidence: structuredClone(evidence),
        })
        hooks.touch()
      })
    },
    qualify(input: Access<P>, execution: AgentExecutionId, status: Qualification) {
      const key = executionText({ ...input, execution }),
        map = qualifications.get(key) ?? new Map<P, Qualification>()
      map.set(input.principal, status)
      qualifications.set(key, map)
    },
    retainSaved(input: ExecutionMutation<P>, saved: DurableEvidence) {
      hooks.mutate(() => {
        const kept = hooks.state().aliases.get(operationKey(input))
        if (!kept || kept.entry.consumer.owner !== saved.owner)
          throw new Error('original consumer saved evidence required')
        const updated = { ...kept, saved: structuredClone(saved) }
        for (const [key, value] of hooks.state().aliases)
          if (value === kept) hooks.state().aliases.set(key, updated)
        for (const [key, value] of hooks.state().deliveries)
          if (value === kept) hooks.state().deliveries.set(key, updated)
        hooks.touch()
      })
    },
    loseMaterial(source: DurableEvidence) {
      hooks.mutate(() => {
        hooks.state().materials.delete(canonical(source))
        hooks.touch()
      })
    },
  }
  const targetPort: ModelReceptionTargets<P> = {
    async forExecution(input) {
      const access = { ...input.access, execution: input.execution }
      const permission = qualified(access)
      if ('failure' in permission) return permission
      return succeed(
        structuredClone(hooks.state().executionTargets.get(executionText(access)) ?? []),
      )
    },
    async resolve(input) {
      const requested = resolveModelInvocationRef(input.reference, input.access.tenant)
      if ('failure' in requested) return fail(denied())
      const found = hooks.state().callTargets.get(targetKey(input.access, requested.ok.call))
      if (!found) return fail(denied())
      const permission = qualified({ ...input.access, execution: found.execution })
      return 'failure' in permission ? permission : succeed(structuredClone(found))
    },
  }
  return {
    ports: { entries, materials: materialPort, received },
    queryQualification(input: ExecutionMutation<P>): Failure | undefined {
      const at = operationKey(input)
      if (
        !hooks.state().aliases.has(at) &&
        !hooks.operations().get(at)?.key.startsWith('received:')
      )
        return undefined
      const permission = qualified(input)
      return 'failure' in permission ? permission.failure : undefined
    },
    controls,
    targets: targetPort,
    remember(execution: MemoryExecution, instance: AgentInstanceId) {
      for (const pending of pendingCalls(execution)) {
        if (pending.kind === 'tool' && pending.association === 'intent') continue
        const bindingKey = targetKey(execution, pending.reference),
          prior = hooks.state().pendingBindings.get(bindingKey) ?? []
        if (
          !prior.some(
            item =>
              item.execution === execution.id && canonical(item.pending) === canonical(pending),
          )
        )
          hooks
            .state()
            .pendingBindings.set(bindingKey, [
              ...prior,
              { execution: execution.id, pending: structuredClone(pending) },
            ])
        hooks
          .state()
          .consumerExecutions.set(
            canonical([tenantText(execution.tenant), pending.position]),
            execution.id,
          )
        if (pending.kind !== 'model') continue
        const key = targetKey({ tenant: execution.tenant }, pending.reference)
        if (!hooks.state().targets.has(key)) {
          const target = { execution: execution.id, instance, pending: structuredClone(pending) }
          hooks.state().targets.set(key, target)
          const reference = resolveModelInvocationRef(pending.reference, execution.tenant)
          if ('ok' in reference) {
            const callKey = targetKey(execution, reference.ok.call)
            if (!hooks.state().callTargets.has(callKey)) {
              hooks.state().callTargets.set(callKey, target)
              const at = executionText({
                tenant: execution.tenant,
                principal: null,
                execution: execution.id,
              })
              const originals = hooks.state().executionTargets.get(at) ?? []
              hooks.state().executionTargets.set(at, [...originals, target])
            }
          }
        }
        hooks
          .state()
          .consumerExecutions.set(
            canonical([tenantText(execution.tenant), pending.position]),
            execution.id,
          )
      }
    },
  }
}
