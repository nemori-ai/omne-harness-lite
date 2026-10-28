import { createHash } from 'node:crypto'
import type {
  Access,
  AgentExecutionId,
  AgentInstanceId,
  AgentJournalEntries,
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
import type { ModelReceptionTarget, ModelReceptionTargets } from '../receiving-types.ts'
import { canonical } from '../canonical.ts'
import { jsonTree } from '../receiving-values.ts'
import type { Attempt, JournalWrite, MemoryExecution, OperationRecord } from './journal.ts'
import { journalEvidence, semanticKey } from './journal-values.ts'

type Input<P> = ReceivedCommitInput<P, ContentBlock>
type Kept = { entry: ReceivedEntry; receipt: CommandReceipt; saved: DurableEvidence | null }
type Stored = { tenant: string; execution: AgentExecutionId | null; value: Material<ContentBlock> }
type Qualification = 'allowed' | 'denied' | 'unavailable'
export type JournalReceivingControls<P> = ReturnType<typeof createJournalReceiving<P>>['controls']
type Hooks<P> = {
  custodian?(input: Access<P> & { execution: AgentExecutionId }): boolean
  owned(
    input: Access<P> & { execution: AgentExecutionId },
    action: string,
  ): Outcome<MemoryExecution, Failure>
  operations: Map<string, OperationRecord>
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
const deliveryText = <P>(input: Access<P>, entry: Omit<ReceivedEntry, 'material'>) =>
  canonical([tenantText(input.tenant), entry.delivery.producer, entry.delivery.key])
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

export function createJournalReceiving<P>(hooks: Hooks<P>) {
  const materials = new Map<string, Stored>()
  const deliveries = new Map<string, Kept>()
  const aliases = new Map<string, Kept>()
  const bindings = new Map<string, { execution: AgentExecutionId; text: string }>()
  const consumerExecutions = new Map<string, AgentExecutionId>()
  const targets = new Map<string, ModelReceptionTarget>()
  const callTargets = new Map<string, ModelReceptionTarget>()
  const executionTargets = new Map<string, ModelReceptionTarget[]>()
  const qualifications = new Map<string, Map<P, Qualification>>()
  const pauses = new Map<
    string,
    { reached(source: DurableEvidence): void; released: Promise<void> }
  >()
  const faults = new Map<string, 'before-publish' | 'after-publish'>()
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
    const stored = materials.get(canonical(source))
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
    const binding = bindings.get(deliveryText(input, input.entry))
    if (binding)
      return binding.execution === input.execution && binding.text === textOf(input)
        ? undefined
        : conflict(input)
    const target = targets.get(targetKey(input, input.entry.delivery.key.reference))
    if (!target) return denied()
    return target.execution === input.execution &&
      target.pending.consumption === input.entry.consumption &&
      canonical(target.pending.position) === canonical(input.entry.consumer)
      ? undefined
      : conflict(input)
  }
  const alias = (input: ExecutionMutation<P>, key: string, kept: Kept) => {
    aliases.set(operationKey(input), kept)
    hooks.operations.set(operationKey(input), {
      kind: 'committed',
      key,
      value: { kind: 'committed', value: kept },
      receipt: kept.receipt,
    })
  }
  const sourceOf = (input: Input<P>) =>
    journalEvidence(
      canonical([
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
          const previous = hooks.operations.get(operationKey(input))
          if (previous?.kind === 'excluded')
            return {
              kind: 'answer',
              value:
                previous.key === text
                  ? succeed({ kind: 'excluded' as const, evidence: previous.evidence })
                  : fail(conflict(input)),
            }
          if (previous?.kind === 'committed' && previous.key !== text) {
            const old = aliases.get(operationKey(input))
            if (
              !old ||
              canonical(old.entry) !== canonical({ ...input.entry, material: old.entry.material })
            )
              return { kind: 'answer', value: fail(conflict(input)) }
          }
          const kept = deliveries.get(deliveryText(input, input.entry))
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
              materials.set(canonical(entry.material), {
                tenant: tenantText(input.tenant),
                execution: input.execution,
                value: input.material,
              })
              execution.entries.push(entry)
              execution.revision = revision
              deliveries.set(deliveryText(input, entry), value)
              aliases.set(operationKey(input), value)
              for (const wake of execution.waiters) wake()
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
      const operation = hooks.operations.get(operationKey(input))
      if (!operation || operation.kind === 'pending') return succeed({ kind: 'unknown' })
      if (operation.kind === 'excluded')
        return succeed({ kind: 'excluded', evidence: structuredClone(operation.evidence) })
      const kept = aliases.get(operationKey(input))
      if (!kept || kept.saved === null) return fail({ kind: 'unsupported' })
      const value = rich(input, kept)
      return 'failure' in value ? value : succeed({ kind: 'committed', value: value.ok })
    },
  }
  const entries: AgentJournalEntries<P> = {
    async record(original) {
      const input = { ...original, entry: structuredClone(original.entry) }
      const text = semanticKey('record', { entry: input.entry, authority: input.authority })
      return hooks.write('record', input, text, () => {
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
        const previous = hooks.operations.get(operationKey(input))
        if (previous) {
          const old = aliases.get(operationKey(input))
          if (
            previous.kind !== 'committed' ||
            (previous.key !== text && (!old || canonical(old.entry) !== canonical(input.entry)))
          )
            return { kind: 'answer', value: fail(conflict(input)) }
          return { kind: 'answer', value: succeed(structuredClone(previous.receipt)) }
        }
        if (input.entry.kind === 'received') {
          const kept = deliveries.get(deliveryText(input, input.entry))
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
              deliveries.set(deliveryText(input, input.entry), kept)
              aliases.set(operationKey(input), kept)
            }
          },
        }
      })
    },
  }
  const materialPort: AgentMaterials<P, ContentBlock> = {
    async preserve(input) {
      if (!tenantCodec.encode(input.tenant).ok) return fail(denied())
      const source = journalEvidence(
        canonical(['material', tenantText(input.tenant), input.identity, input.consumer]),
        1,
      )
      const old = materials.get(canonical(source))
      if (old && canonical(old.value) !== canonical(input.value)) return fail(invalid('identity'))
      const execution =
        consumerExecutions.get(canonical([tenantText(input.tenant), input.consumer])) ?? null
      if (execution !== null) {
        const permission = qualified({ ...input, execution })
        if ('failure' in permission) return permission
      }
      materials.set(canonical(source), {
        tenant: tenantText(input.tenant),
        execution,
        value: structuredClone(input.value),
      })
      return succeed(source)
    },
    async read(input) {
      return readMaterial(input, input.source)
    },
  }
  const controls = {
    async bind(input: Input<P>) {
      const key = deliveryText(input, input.entry),
        text = textOf(input)
      const old = bindings.get(key)
      if (old && (old.text !== text || old.execution !== input.execution))
        throw new TypeError('frozen binding cannot change')
      bindings.set(key, { execution: input.execution, text })
      consumerExecutions.set(
        canonical([tenantText(input.tenant), input.entry.consumer]),
        input.execution,
      )
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
        materials: [...materials.values()].filter(
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
    async exclude(input: Input<P>, evidence: DurableEvidence) {
      hooks.operations.set(operationKey(input), {
        kind: 'excluded',
        key: textOf(input),
        evidence: structuredClone(evidence),
      })
    },
    qualify(input: Access<P>, execution: AgentExecutionId, status: Qualification) {
      const key = executionText({ ...input, execution }),
        map = qualifications.get(key) ?? new Map<P, Qualification>()
      map.set(input.principal, status)
      qualifications.set(key, map)
    },
    retainSaved(input: ExecutionMutation<P>, saved: DurableEvidence) {
      const kept = aliases.get(operationKey(input))
      if (!kept || kept.entry.consumer.owner !== saved.owner)
        throw new Error('original consumer saved evidence required')
      kept.saved = structuredClone(saved)
    },
    loseMaterial(source: DurableEvidence) {
      materials.delete(canonical(source))
    },
  }
  const targetPort: ModelReceptionTargets<P> = {
    async forExecution(input) {
      const access = { ...input.access, execution: input.execution }
      const permission = qualified(access)
      if ('failure' in permission) return permission
      return succeed(structuredClone(executionTargets.get(executionText(access)) ?? []))
    },
    async resolve(input) {
      const requested = resolveModelInvocationRef(input.reference, input.access.tenant)
      if ('failure' in requested) return fail(denied())
      const found = callTargets.get(targetKey(input.access, requested.ok.call))
      if (!found) return fail(denied())
      const permission = qualified({ ...input.access, execution: found.execution })
      return 'failure' in permission ? permission : succeed(structuredClone(found))
    },
  }
  return {
    ports: { entries, materials: materialPort, received },
    queryQualification(input: ExecutionMutation<P>): Failure | undefined {
      const at = operationKey(input)
      if (!aliases.has(at) && !hooks.operations.get(at)?.key.startsWith('received:'))
        return undefined
      const permission = qualified(input)
      return 'failure' in permission ? permission.failure : undefined
    },
    controls,
    targets: targetPort,
    remember(execution: MemoryExecution, instance: AgentInstanceId) {
      for (const pending of execution.checkpoint.calls) {
        if (pending.kind !== 'model') continue
        const key = targetKey({ tenant: execution.tenant }, pending.reference)
        if (!targets.has(key)) {
          const target = { execution: execution.id, instance, pending: structuredClone(pending) }
          targets.set(key, target)
          const reference = resolveModelInvocationRef(pending.reference, execution.tenant)
          if ('ok' in reference) {
            const callKey = targetKey(execution, reference.ok.call)
            if (!callTargets.has(callKey)) {
              callTargets.set(callKey, target)
              const at = executionText({
                tenant: execution.tenant,
                principal: null,
                execution: execution.id,
              })
              const originals = executionTargets.get(at) ?? []
              originals.push(target)
              executionTargets.set(at, originals)
            }
          }
        }
        consumerExecutions.set(
          canonical([tenantText(execution.tenant), pending.position]),
          execution.id,
        )
      }
    },
  }
}
