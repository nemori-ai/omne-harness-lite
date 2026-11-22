import { SharedMap } from '../journal/shared-map.ts'
import { MaterialTable, type Stored } from './material-table.ts'
import { pendingCalls } from './pending.ts'
import { createHash } from 'node:crypto'
import type {
  PendingCall,
  Adoption,
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
  MaterialReaders,
  ReceivedCommitInput,
  ReceivedCommitValue,
  ReceivedCommitResult,
  ReceivedEntry,
} from '@omne-harness/agent-contract'
import {
  type AgentOperationId,
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeConsumptionId,
  decodeCompactionOutcome,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { resolveToolInvocationRef } from '@omne-harness/tool-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  ModelReceptionTarget,
  ModelReceptionTargets,
  ToolReceptionTarget,
  ToolReceptionTargets,
} from './reception-targets.ts'
import { canonical } from './canonical.ts'
import { entriesFrom } from './closed-rows.ts'
import { jsonTree } from './material-value.ts'
import type { Attempt, JournalWrite, MemoryExecution, OperationRecord } from './journal.ts'
import { JOURNAL_OWNER, semanticKey } from './journal-values.ts'
import {
  type Blob,
  type ExecutionView,
  blobOf,
  materialReleased,
  refOf,
  stampOfReceipt,
  type FactBody,
  type ProducerCall,
} from '../journal/index.ts'

type Input<P> = ReceivedCommitInput<P, ContentBlock>
import {
  closedMaterial,
  closedReceived,
  receivedEntries,
  deliveryOf,
  keyVersion,
  preservedSource,
  receivedMaterialSource,
  type Kept,
  type ReleasedMaterial,
} from './received-records.ts'
import {
  bindTarget,
  closedPendings,
  modelTarget,
  targetKey,
  toolTarget,
  type ClosedBinding,
} from './binding-targets.ts'
export type { Kept } from './received-records.ts'
export type { Stored } from './material-table.ts'
type Qualification = 'allowed' | 'denied' | 'unavailable'
export type JournalReceivingControls<P> = ReturnType<typeof createJournalReceiving<P>>['controls']
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
  // What an operation answered when this core no longer holds its record.
  answered(input: ExecutionMutation<P>, need?: boolean): OperationRecord | undefined
  // The binding of a call reference this core no longer holds open.
  closedBinding(
    input: Access<P> & { execution: AgentExecutionId },
    reference: string,
  ): ClosedBinding | undefined
  // The closed items this core read back, and the open view of an execution.
  closed(): Parameters<typeof closedReceived>[0]
  viewOf(execution: AgentExecutionId): ExecutionView
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
  ownEvidence(execution: AgentExecutionId, key: string, revision: number): DurableEvidence
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
) => deliveryOf(tenantText(input.tenant), input.execution, entry)
const textOf = <P>(input: Input<P>) =>
  `received:sha256:${createHash('sha256')
    .update(canonical({ entry: input.entry, material: input.material }))
    .digest('hex')}`
function receivedCall(entry: ReceivedEntry): ProducerCall {
  if (entry.delivery.producer === 'compaction')
    return {
      producer: 'compaction',
      task: entry.delivery.key.task,
      version: entry.delivery.key.result.version,
      delivery: null,
      source: structuredClone(entry.delivery.key.result.evidence),
    }
  const key = entry.delivery.key
  return {
    producer: entry.delivery.producer,
    call: String(key.reference),
    version: keyVersion(key),
    delivery: key.kind,
    source: structuredClone(entry.material),
  }
}

function receivedFact(
  entry: ReceivedEntry,
  saved: DurableEvidence,
  material: Material<ContentBlock> | null,
): FactBody {
  return {
    kind: 'result.received',
    consumption: entry.consumption,
    delivery: saved.record,
    result: receivedCall(entry),
    consumer: structuredClone(entry.consumer),
    custody: refOf(entry),
    saved: structuredClone(saved),
    material: material === null ? null : refOf(material),
  }
}

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
  if ('failure' in deliveryRef(input.entry.delivery, input.tenant))
    return invalid('entry.delivery.key.reference')
  if (!object(input.material)) return invalid('material')
  if (input.material.kind === 'facts') {
    if (!object(input.material.schema)) return invalid('material.schema')
    for (const field of ['owner', 'name', 'revision', 'digest'] as const)
      if (typeof input.material.schema[field] !== 'string' || !input.material.schema[field])
        return invalid(`material.schema.${field}`)
    if (!jsonTree(input.material.value)) return invalid('material.value')
  } else if (input.material.kind === 'compaction') {
    if (
      delivery.producer !== 'compaction' ||
      input.material.result.producer.kind !== 'compaction' ||
      canonical(input.material.result.producer.task) !== canonical(delivery.key.task) ||
      input.material.result.version !== delivery.key.result.version ||
      canonical(input.material.result.source) !== canonical(delivery.key.result.evidence) ||
      'failure' in decodeCompactionOutcome(JSON.stringify(input.material.outcome))
    )
      return invalid('material.compaction')
  } else if (input.material.kind !== 'model' && input.material.kind !== 'tool')
    return invalid('material.kind')
  return undefined
}

export type ReceivingState = {
  materials: MaterialTable
  deliveries: SharedMap<string, Kept>
  aliases: SharedMap<string, Kept>
  bindings: SharedMap<string, { execution: AgentExecutionId; text: string }>
  pendingBindings: SharedMap<
    string,
    readonly {
      execution: AgentExecutionId
      pending: import('@omne-harness/agent-contract').PendingCall
    }[]
  >
  targets: SharedMap<string, ModelReceptionTarget>
  callTargets: SharedMap<string, ModelReceptionTarget>
  executionTargets: SharedMap<string, ModelReceptionTarget[]>
  toolTargets: SharedMap<string, ToolReceptionTarget>
}
const materialSourceOf = (key: string): DurableEvidence => JSON.parse(key) as DurableEvidence

export function emptyReceivingState(): ReceivingState {
  return {
    materials: new MaterialTable(),
    deliveries: new SharedMap(),
    aliases: new SharedMap(),
    bindings: new SharedMap(),
    pendingBindings: new SharedMap(),
    targets: new SharedMap(),
    callTargets: new SharedMap(),
    executionTargets: new SharedMap(),
    toolTargets: new SharedMap(),
  }
}

function boundCompaction<P>(execution: MemoryExecution, input: Input<P>): Failure | undefined {
  const task = execution.checkpoint.compaction
  const delivery = input.entry.delivery
  return task !== null &&
    delivery.producer === 'compaction' &&
    canonical(task.task) === canonical(delivery.key.task) &&
    task.consumption === input.entry.consumption &&
    canonical(task.consumer) === canonical(input.entry.consumer)
    ? undefined
    : denied()
}

function boundPending<P>(
  originals: ReceivingState['pendingBindings'] extends Map<string, infer V> ? V : never,
  input: Input<P>,
): Failure | undefined {
  if (originals.length === 0) return denied()
  if (originals.length !== 1) return conflict(input)
  const target = originals[0]!
  return target.execution === input.execution &&
    target.pending.consumption === input.entry.consumption &&
    canonical(target.pending.position) === canonical(input.entry.consumer)
    ? undefined
    : conflict(input)
}

function deliveryRef(delivery: ReceivedEntry['delivery'], tenant: TenantId) {
  return delivery.producer === 'compaction'
    ? succeed(undefined)
    : delivery.producer === 'model'
      ? resolveModelInvocationRef(delivery.key.reference, tenant)
      : resolveToolInvocationRef(delivery.key.reference, tenant)
}

// A repeat of a saved delivery under a new operation recognizes the operation that saved it.
const recognizing = <R>(
  kept: Kept,
  asking: Readonly<{ operation: AgentOperationId }>,
  value: () => R,
): Attempt<R> => {
  const at = stampOfReceipt(kept.receipt)
  if (at === undefined)
    return { kind: 'answer', value: fail(unavailable('the saved delivery names no batch')) }
  // The operation that saved the delivery has its batch: it is answered without a second one.
  if (at.op === asking.operation) return { kind: 'answer', value: succeed(value()) }
  return {
    kind: 'batch',
    facts: [
      {
        kind: 'op.recognized',
        target: at.op,
        at: { pub: at.pub, digest: at.digest, revision: at.revision },
        recalls: true,
      },
    ],
    blobs: [],
    kinds: [],
    derive: value,
    project: () => {},
  }
}

// What a committed delivery kept: the record of its open result, else the answer it gave; a
// recognition answers with the receipt of the delivery it recognized, which keeps it.
function keptOf<P>(
  hooks: Hooks<P>,
  input: ExecutionMutation<P>,
  previous: Extract<OperationRecord, { kind: 'committed' }>,
  need = false,
): Kept | undefined {
  const keyOf = (of: ExecutionMutation<P>) =>
    hooks.operationKey(of.tenant, of.execution, of.operation) ?? ''
  const own =
    hooks.state().aliases.get(keyOf(input)) ?? (previous.value as { value?: Kept } | null)?.value
  if (own !== undefined || previous.receipt.operation === input.operation) return own
  const target = { ...input, operation: previous.receipt.operation }
  const recognized = hooks.operations().get(keyOf(target)) ?? hooks.answered(target, need)
  if (recognized?.kind !== 'committed') return undefined
  return (
    hooks.state().aliases.get(keyOf(target)) ?? (recognized.value as { value?: Kept } | null)?.value
  )
}

// A delivery of a result this core no longer holds open is read back with the result.
function delivered<P>(
  hooks: Hooks<P>,
  input: Access<P> & { execution: AgentExecutionId },
  entry: Omit<ReceivedEntry, 'material'>,
): Kept | undefined {
  const text = deliveryText(input, entry)
  const held = hooks.state().deliveries.get(text)
  if (held !== undefined) return held
  const result = { consumption: entry.consumption, version: keyVersion(entry.delivery.key) }
  const closed = closedReceived(hooks.closed(), mintOf(hooks), input, result, false)
  return closed?.delivery === text ? closed.kept : undefined
}

const mintOf = <P>(hooks: Hooks<P>) => ({ owner: JOURNAL_OWNER, session: hooks.namespace })

// A material by its source: the one this core holds, else the closed one read back (or peeked).
const materialOf = <P>(hooks: Hooks<P>, access: Access<P>, source: DurableEvidence, need = true) =>
  hooks.state().materials.get(canonical(source)) ??
  closedMaterial(hooks.closed(), mintOf(hooks), access.tenant, source, need)

type Preserve<P> = Parameters<AgentMaterials<P, ContentBlock>['preserve']>[0]

const readersOf = (held: Readonly<{ readers?: MaterialReaders }>): MaterialReaders =>
  held.readers ?? 'after-release'

function sameMaterial<P>(old: Stored | ReleasedMaterial, input: Preserve<P>): boolean {
  if ('released' in old)
    return readersOf(input) === 'until-release' && old.released.digest === refOf(input.value).digest
  return readersOf(old) === readersOf(input) && canonical(old.value) === canonical(input.value)
}

function sameContentOf<P>(hooks: Hooks<P>, input: Preserve<P>): string | undefined {
  if (readersOf(input) === 'until-release') return undefined
  const content = canonical(input.value)
  return hooks.state().materials.sameContent(tenantText(input.tenant), input.execution, content)
}

const preservedFact = <P>(source: DurableEvidence, input: Preserve<P>): FactBody => ({
  kind: 'material.preserved',
  source,
  value: refOf(input.value),
  consumer: structuredClone(input.consumer),
  readers: readersOf(input),
})

function released<P>(hooks: Hooks<P>, stored: Stored, source: DurableEvidence): boolean {
  if (stored.readers !== 'until-release') return false
  const key = canonical(source)
  const view = hooks.viewOf(stored.execution)
  const item = view.materials.get(key)
  return item === undefined || materialReleased(item, view, key)
}

function readable<P>(hooks: Hooks<P>, stored: Stored | ReleasedMaterial, source: DurableEvidence) {
  if ('released' in stored || released(hooks, stored, source))
    return fail({ kind: 'reclaimed' as const })
  return succeed(structuredClone(stored.value))
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
    const stored = materialOf(hooks, access, source)
    if (!stored || stored.tenant !== tenantText(access.tenant))
      return fail(unavailable('material-unreadable'))
    const check = qualified({ ...access, execution: stored.execution }, false)
    if ('failure' in check) return check
    return readable(hooks, stored, source)
  }
  const rich = (access: Access<P>, kept: Kept): Outcome<ReceivedCommitValue, Failure> => {
    const material = readMaterial(access, kept.entry.material)
    if ('failure' in material) return material
    if (kept.saved === null) return fail({ kind: 'unsupported' })
    return succeed(structuredClone({ entry: kept.entry, receipt: kept.receipt, saved: kept.saved }))
  }
  const recommitted = (
    input: Input<P>,
    previous: ReturnType<ReturnType<Hooks<P>['operations']>['get']>,
    text: string,
  ): Outcome<{ kind: 'committed'; value: ReceivedCommitValue }, Failure> | undefined => {
    if (previous?.kind !== 'committed' || previous.key !== text) return undefined
    const original = keptOf(hooks, input, previous)
    if (!original) return undefined
    const value = rich(input, original)
    return 'failure' in value ? value : succeed({ kind: 'committed' as const, value: value.ok })
  }
  const bound = (input: Input<P>): Failure | undefined => {
    const binding = hooks.state().bindings.get(deliveryText(input, input.entry))
    if (binding)
      return binding.execution === input.execution && binding.text === textOf(input)
        ? undefined
        : conflict(input)
    if (input.entry.delivery.producer === 'compaction') {
      const execution = qualified(input)
      return 'failure' in execution ? execution.failure : boundCompaction(execution.ok, input)
    }
    const { reference } = input.entry.delivery.key
    const held = hooks.state().pendingBindings.get(targetKey(input, reference))
    return boundPending(held ?? closedPendings(hooks, input, reference), input)
  }
  const sourceOf = (input: Input<P>) =>
    receivedMaterialSource(hooks.namespace, tenantText(input.tenant), input.execution, input.entry)
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
          const previous = hooks.operations().get(operationKey(input)) ?? hooks.answered(input)
          if (previous?.kind === 'excluded')
            return {
              kind: 'answer',
              value:
                previous.key === text
                  ? succeed({ kind: 'excluded' as const, evidence: previous.evidence })
                  : fail(conflict(input)),
            }
          const original = recommitted(input, previous, text)
          if (original) return { kind: 'answer', value: original }
          if (previous?.kind === 'committed' && previous.key !== text) {
            const old = keptOf(hooks, input, previous)
            if (
              !old ||
              canonical(old.entry) !== canonical({ ...input.entry, material: old.entry.material })
            )
              return { kind: 'answer', value: fail(conflict(input)) }
          }
          const kept = delivered(hooks, input, input.entry)
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
            return recognizing(kept, input, () => ({ kind: 'committed' as const, value: value.ok }))
          }
          if (previous) return { kind: 'answer', value: fail(conflict(input)) }
          const revision = execution.revision + 1
          const receipt = hooks.receiptOf(
            execution,
            input.operation,
            revision,
            hooks.ownEvidence(execution.id, text, revision),
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
            kind: 'batch',
            facts: [receivedFact(entry, saved, input.material)],
            blobs: [blobOf(entry), blobOf(input.material)],
            kinds: [],
            derive: derived => {
              if (derived.kind !== 'received' || canonical(derived.receipt) !== canonical(receipt))
                throw new TypeError('a received batch answered another receipt than it judged')
              return { kind: 'committed' as const, value: structuredClone(value) }
            },
            project: (_batch, view) => {
              hooks.state().materials.set(canonical(entry.material), {
                tenant: tenantText(input.tenant),
                execution: input.execution,
                value: input.material,
              })
              execution.entries.push(entry)
              execution.revision = view.revision
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
      const operation = hooks.operations().get(operationKey(input)) ?? hooks.answered(input, true)
      if (!operation || operation.kind === 'pending') return succeed({ kind: 'unknown' })
      if (operation.kind === 'excluded')
        return succeed({ kind: 'excluded', evidence: structuredClone(operation.evidence) })
      const kept =
        operation.kind === 'committed' ? keptOf(hooks, input, operation, true) : undefined
      if (!kept || kept.saved === null) return fail({ kind: 'unsupported' })
      const value = rich(input, kept)
      return 'failure' in value ? value : succeed({ kind: 'committed', value: value.ok })
    },
  }
  const entries: AgentJournalEntries<P> = {
    async record(original) {
      const input = { ...original, entry: structuredClone(original.entry) }
      const text = semanticKey('record', { entry: input.entry, authority: input.authority })
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
          if ('failure' in deliveryRef(input.entry.delivery, input.tenant))
            return { kind: 'answer', value: fail(denied()) }
        }
        const previous = hooks.operations().get(operationKey(input)) ?? hooks.answered(input)
        if (previous) {
          const old = previous.kind === 'committed' ? keptOf(hooks, input, previous) : undefined
          const same =
            previous.kind === 'committed' &&
            (previous.match === canonical(input.entry) ||
              (old !== undefined && canonical(old.entry) === canonical(input.entry)))
          if (previous.kind !== 'committed' || (previous.key !== text && !same))
            return { kind: 'answer', value: fail(conflict(input)) }
          return { kind: 'answer', value: succeed(structuredClone(previous.receipt)) }
        }
        if (input.entry.kind === 'received') {
          const kept = delivered(hooks, input, input.entry)
          if (kept) {
            if (
              kept.receipt.execution !== input.execution ||
              canonical(kept.entry) !== canonical(input.entry)
            )
              return { kind: 'answer', value: fail(conflict(input)) }
            return recognizing(kept, input, () => structuredClone(kept.receipt))
          }
        }
        scripted = recordFaults.get(executionText(input))
        if (scripted !== undefined) {
          recordFaults.delete(executionText(input))
          if (scripted.kind === 'unavailable')
            return { kind: 'answer', value: fail(unavailable('record is scripted unavailable')) }
        }
        const evidence = hooks.ownEvidence(execution.id, text, execution.revision + 1)
        const entry = input.entry
        const fact: FactBody =
          entry.kind === 'received'
            ? receivedFact(entry, evidence, null)
            : {
                kind: 'fence.started',
                operation: entry.operation,
                guard: structuredClone(entry.guard),
                fence: structuredClone(entry.fence),
              }
        let written: CommandReceipt | undefined
        return {
          kind: 'batch',
          facts: [fact],
          blobs: entry.kind === 'received' ? [blobOf(entry)] : [],
          kinds: [],
          derive: derived => {
            if (!('receipt' in derived)) throw new TypeError('a record answers its receipt')
            written = derived.receipt
            return structuredClone(derived.receipt)
          },
          match: canonical(input.entry),
          project: (_batch, view) => {
            if (written === undefined)
              throw new TypeError('append derives the receipt before it projects the batch')
            const receipt = written
            execution.entries.push(input.entry)
            execution.revision = view.revision
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
      return scripted?.kind === 'commit-unknown' && 'ok' in outcome
        ? fail({ kind: 'commit-unknown', operation: input.operation })
        : outcome
    },
    read: async input => {
      const found = qualified(input, false)
      if ('failure' in found) return found
      const list = found.ok.entries
      const from = input.after === null ? 0 : Number(input.after)
      if (
        !Number.isSafeInteger(input.limit) ||
        input.limit < 1 ||
        (input.after !== null && (!/^(0|[1-9][0-9]*)$/.test(input.after) || from > list.length))
      )
        return fail({ kind: 'invalid', field: 'after', reason: 'not a position of the entries' })
      const read = entriesFrom(hooks.closed(), found.ok, from, input.limit)
      if (read === null) return fail(unavailable('an entry of the execution is not readable'))
      const items = read.map((entry, index) => ({
        sequence: String(from + index + 1),
        entry: structuredClone(entry),
      }))
      return succeed({
        items,
        next: items.at(-1)?.sequence ?? input.after,
        caughtUp: from + items.length >= list.length,
      })
    },
    receivedOf: async input => {
      const found = qualified(input, false)
      if ('failure' in found) return found
      const view = hooks.viewOf(found.ok.id)
      return succeed(structuredClone(receivedEntries(hooks.closed(), view, input.consumption)))
    },
  }
  const materialPort: AgentMaterials<P, ContentBlock> = {
    async preserve(input) {
      if (!tenantCodec.encode(input.tenant).ok) return fail(denied())
      const source = preservedSource(
        hooks.namespace,
        tenantText(input.tenant),
        input.execution,
        input.identity,
        input.consumer,
      )
      const operation = `preserve:${createHash('sha256')
        .update(source.record)
        .digest('hex')}` as ExecutionMutation<P>['operation']
      const key = semanticKey('preserve', {
        execution: input.execution,
        identity: input.identity,
        consumer: input.consumer,
        value: input.value,
        readers: readersOf(input),
      })
      const mutation: ExecutionMutation<P> = {
        principal: input.principal,
        tenant: input.tenant,
        execution: input.execution,
        operation,
      }
      return hooks.write('preserve', mutation, key, () => {
        const answer = (value: Outcome<DurableEvidence, Failure>): Attempt<DurableEvidence> => ({
          kind: 'answer',
          value,
        })
        const old = materialOf(hooks, input, source, false)
        if (old && !sameMaterial(old, input)) return answer(fail(invalid('identity')))
        const permission = qualified(input)
        if ('failure' in permission) return answer(permission)
        if (old) return answer(succeed(source))
        const kept = sameContentOf(hooks, input)
        if (kept !== undefined && hooks.viewOf(input.execution).materials.has(kept))
          return answer(succeed(materialSourceOf(kept)))
        return {
          kind: 'batch',
          facts: [preservedFact(source, input)],
          blobs: [blobOf(input.value)],
          kinds: [],
          derive: () => source,
          project: () => {
            hooks.state().materials.set(canonical(source), {
              tenant: tenantText(input.tenant),
              execution: input.execution,
              value: structuredClone(input.value),
              readers: readersOf(input),
            })
          },
        }
      })
    },
    async read(input) {
      return readMaterial(input, input.source)
    },
    async describe(input) {
      const material = readMaterial(input, input.source)
      if ('failure' in material) return material
      const text = canonical(material.ok)
      return succeed({
        digest: `sha256:${createHash('sha256').update(text).digest('hex')}`,
        size: Buffer.byteLength(text, 'utf8'),
        kind: material.ok.kind,
      })
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
    failNextRecord(input: Access<P> & { execution: AgentExecutionId }, fault: RecordFault) {
      recordFaults.set(executionText(input), fault)
    },
    async exclude(input: Input<P>, evidence: DurableEvidence) {
      return hooks.mutate(() => {
        hooks.operations().set(operationKey(input), {
          kind: 'excluded',
          key: textOf(input),
          execution: input.execution,
          operation: input.operation,
          reason: 'reception',
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
      const found = modelTarget(hooks, input, requested.ok.call)
      if (!found || (input.execution !== undefined && input.execution !== found.execution))
        return fail(denied())
      const permission = qualified({ ...input.access, execution: found.execution })
      return 'failure' in permission ? permission : succeed(structuredClone(found))
    },
  }
  const toolTargetPort: ToolReceptionTargets<P> = {
    async forExecution(input) {
      const access = { ...input.access, execution: input.execution }
      const permission = qualified(access)
      if ('failure' in permission) return permission
      return succeed(
        structuredClone(
          [...hooks.state().toolTargets.values()].filter(
            target =>
              target.execution === input.execution &&
              'ok' in resolveToolInvocationRef(target.pending.reference, input.access.tenant),
          ),
        ),
      )
    },
    async resolve(input) {
      if ('failure' in resolveToolInvocationRef(input.reference, input.access.tenant))
        return fail(denied())
      const found = toolTarget(hooks, input)
      const route = input.execution ?? found?.execution
      if (route === undefined) return fail(denied())
      const permission = qualified({ ...input.access, execution: route })
      if ('failure' in permission) return permission
      if (found === undefined) return succeed(null)
      if (found.execution !== route) return fail(denied())
      return succeed(structuredClone(found))
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
    toolTargets: toolTargetPort,
    newBindings(
      execution: Pick<MemoryExecution, 'id' | 'tenant' | 'checkpoint' | 'effects'>,
      instance: AgentInstanceId,
    ): NewBindings {
      const facts: FactBody[] = []
      const blobs: Blob[] = []
      const pendings: PendingCall[] = []
      const seen = new Set<string>()
      for (const pending of pendingCalls(execution as MemoryExecution)) {
        if (pending.kind === 'tool' && pending.association === 'intent') continue
        const bindingKey = targetKey(execution, pending.reference)
        const text = canonical(pending)
        const prior = hooks.state().pendingBindings.get(bindingKey) ?? []
        if (
          seen.has(`${bindingKey}\0${text}`) ||
          prior.some(item => item.execution === execution.id && canonical(item.pending) === text)
        )
          continue
        seen.add(`${bindingKey}\0${text}`)
        const value = structuredClone(pending)
        pendings.push(value)
        blobs.push(blobOf(value))
        facts.push({
          kind: 'target.bound',
          reference: pending.reference,
          pending: refOf(value),
          consumption: pending.consumption,
          instance,
        })
      }
      return {
        instance,
        definition: structuredClone(execution.checkpoint.definition),
        facts,
        blobs,
        pendings,
      }
    },
    applyBindings(execution: Pick<MemoryExecution, 'id' | 'tenant'>, bound: NewBindings) {
      for (const pending of bound.pendings)
        bindTarget(hooks.state(), execution, bound.instance, bound.definition, pending)
    },
  }
}

export type NewBindings = Readonly<{
  instance: AgentInstanceId
  definition: Adoption
  facts: readonly FactBody[]
  blobs: readonly Blob[]
  pendings: readonly PendingCall[]
}>
