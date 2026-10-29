import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { resolveToolInvocationRef } from '@omne-harness/tool-contract'
import type { Failure } from './evaluation.ts'
import type { CommandReceipt, ExecutionMutation } from './execution.ts'
import {
  decodeAgentInstanceId,
  decodeExecutionAttachmentId,
  type Access,
  type Adoption,
  type AgentExecutionId,
  type DurableEvidence,
} from './identity.ts'
import type { AgentMaterials } from './passages.ts'
import type {
  AgentJournalEntries,
  AgentJournalEntry,
  JournalEntryRecord,
  ReceivedCommitInput,
  ReceivedCommitQuery,
  ReceivedCommitResult,
  ReceivedCommitValue,
  ReceivedEntry,
} from './receiving.ts'
import type { AgentJournalEntriesFixture, RecordFault } from './testing-journal-entries.ts'
import type { ReceivedCommitFixture } from './testing-received-fixture.ts'
import { canonicalText, doubleEvidence, tenantText } from './testing-case.ts'
import {
  conflict,
  deliveryKey,
  denied,
  executionKey,
  identity,
  mutationFailure,
  operationKey,
  receiptOf,
  receivedFailure,
  recordText,
  semanticText,
  sourceOf,
  unavailable,
  type KeptDelivery,
  type KeptMaterial,
  type MemoryExecution,
} from './testing-received-state.ts'

type Pause = { reached(source: DurableEvidence): void; released: Promise<void> }

/** The schema of the events the fixture allocates; a provider declares its own. */
const EVENT_SCHEMA: Adoption = Object.freeze({
  owner: 'memoryReceivedCommand',
  name: 'agent-event',
  revision: '1',
  digest: 'double:agent-event',
})

/**
 * Writes the entry and, in the same step, its `entry` event (SPEC "日志条目" 6). After the end
 * the entry is written alone: ended stays the last event.
 */
function writeEntry(state: MemoryExecution, entry: AgentJournalEntry, receipt: CommandReceipt) {
  state.entries.push(entry)
  if (state.ended) return
  state.events.push({
    execution: receipt.execution,
    sequence: String(state.events.length + 1),
    executionAttachment: state.authority.executionAttachment,
    schema: EVENT_SCHEMA,
    cause: receipt.evidence,
    body: { kind: 'entry', entry: structuredClone(entry) },
  })
}

/** Explicit test setup; this is not a full AgentJournal or a production storage provider. */
export function memoryReceivedCommitFixture<P, B extends ContentBlock = ContentBlock>(
  access: Access<P>,
  otherAccess: Access<P>,
): AgentJournalEntriesFixture<P> &
  Readonly<{
    durability: 'none'
    joint: ReceivedCommitFixture<P, B>
  }> {
  const executions = new Map<string, MemoryExecution>()
  const deliveries = new Map<string, KeptDelivery>()
  const bindings = new Map<string, { execution: AgentExecutionId; text: string; entry: string }>()
  const scopedDelivery = (input: Access<P>, entry: Omit<ReceivedEntry, 'material'>) =>
    canonicalText([tenantText(input.tenant), deliveryKey(entry)])
  const materials = new Map<string, KeptMaterial<B>>()
  const custody = new Map<string, AgentExecutionId>()
  const pauses = new Map<string, Pause>()
  const faults = new Map<string, 'before-publish' | 'after-publish'>()
  const recordFaults: RecordFault[] = []
  let generation = 0
  const stateOf = (input: Pick<ExecutionMutation<P>, 'tenant' | 'execution'>) =>
    executions.get(executionKey(input))
  const requireState = (input: Pick<ExecutionMutation<P>, 'tenant' | 'execution'>) => {
    const state = stateOf(input)
    if (!state) throw new TypeError('reference execution is not open')
    return state
  }
  const qualified = (
    input: Access<P> & { execution: AgentExecutionId },
  ): Outcome<MemoryExecution, Failure> => {
    const state = stateOf(input)
    if (!state) return fail(denied())
    const qualification = state.qualifications.get(input.principal)
    if (qualification === 'unavailable') return fail(unavailable('qualification-unavailable'))
    if (qualification !== 'allowed') return fail(denied())
    return succeed(state)
  }
  const permitted = (input: ExecutionMutation<P>): Outcome<MemoryExecution, Failure> => {
    const invalid = mutationFailure(input)
    return invalid ? fail(invalid) : qualified(input)
  }
  const readMaterial = (
    input: Access<P>,
    source: DurableEvidence,
  ): Outcome<KeptMaterial<B>, Failure> => {
    const kept = materials.get(canonicalText(source))
    if (!kept || kept.tenant !== tenantText(input.tenant))
      return fail(unavailable('material-unreadable'))
    const permission = qualified({ ...input, execution: kept.execution })
    return 'failure' in permission ? permission : succeed(kept)
  }
  const richValue = (
    input: Access<P>,
    kept: KeptDelivery,
  ): Outcome<ReceivedCommitValue, Failure> => {
    if ('failure' in readMaterial(input, kept.entry.material))
      return fail(unavailable('material-unreadable'))
    if (!kept.saved) return fail({ kind: 'unsupported' })
    return succeed({ receipt: kept.receipt, entry: kept.entry, saved: kept.saved })
  }
  const recognize = (
    state: MemoryExecution,
    input: ReceivedCommitInput<P, B>,
  ): Outcome<ReceivedCommitResult, Failure> | null => {
    const text = semanticText(input)
    const previous = state.operations.get(input.operation)
    if (previous?.kind === 'excluded')
      return previous.text === text
        ? succeed({ kind: 'excluded', evidence: previous.evidence })
        : fail(conflict(input))
    if (previous?.kind === 'received') {
      if (previous.text !== text) return fail(conflict(input))
      if ('failure' in readMaterial(input, previous.value.entry.material))
        return fail(unavailable('material-unreadable'))
      return succeed({ kind: 'committed', value: previous.value })
    }
    if (
      previous?.kind === 'record' &&
      (previous.entry.kind !== 'received' ||
        canonicalText({ ...input.entry, material: previous.entry.material }) !==
          canonicalText(previous.entry))
    ) {
      return fail(conflict(input))
    }
    const delivery = deliveries.get(scopedDelivery(input, input.entry))
    if (!delivery) return previous ? fail(conflict(input)) : null
    if (delivery.receipt.execution !== input.execution) return fail(conflict(input))
    if (
      canonicalText({ ...input.entry, material: delivery.entry.material }) !==
      canonicalText(delivery.entry)
    )
      return fail(conflict(input))
    const keptMaterial = readMaterial(input, delivery.entry.material)
    if ('failure' in keptMaterial) return fail(unavailable('material-unreadable'))
    if (canonicalText(keptMaterial.ok.value) !== canonicalText(input.material))
      return fail(conflict(input))
    const rich = richValue(input, delivery)
    if ('failure' in rich) return rich
    state.operations.set(input.operation, { kind: 'received', text, value: rich.ok })
    return succeed({ kind: 'committed', value: rich.ok })
  }
  const preflight = (input: ReceivedCommitInput<P, B>): Outcome<MemoryExecution, Failure> => {
    const allowed = permitted(input)
    if ('failure' in allowed) return allowed
    const invalid = receivedFailure(input)
    if (invalid) return fail(invalid)
    const binding = bindings.get(scopedDelivery(input, input.entry))
    if (binding === undefined) return fail(denied())
    if (binding.execution !== input.execution || binding.text !== semanticText(input))
      return fail(conflict(input))
    return allowed
  }
  const commit = async (
    original: ReceivedCommitInput<P, B>,
  ): Promise<Outcome<ReceivedCommitResult, Failure>> => {
    let allowed = preflight(original)
    if ('failure' in allowed) return allowed
    const input = {
      ...original,
      entry: structuredClone(original.entry),
      material: structuredClone(original.material),
    }
    const recalled = recognize(allowed.ok, input)
    if (recalled) return structuredClone(recalled)
    const source = sourceOf(input)
    const key = operationKey(input)
    const pause = pauses.get(key)
    if (pause) {
      pauses.delete(key)
      pause.reached(source)
      await pause.released
      allowed = preflight(input)
      if ('failure' in allowed) return allowed
      const raced = recognize(allowed.ok, input)
      if (raced) return structuredClone(raced)
    }
    const fault = faults.get(key)
    faults.delete(key)
    if (fault === 'before-publish') return fail(unavailable('injected-before-publish'))
    const state = allowed.ok
    const receipt = receiptOf(state, input)
    const entry = { ...input.entry, material: source }
    const saved = doubleEvidence(
      input.entry.consumer.owner,
      canonicalText({ entry, material: input.material, receipt, consumption: entry.consumption }),
      String(receipt.revision),
    )
    const value: ReceivedCommitValue = { receipt, entry, saved }
    materials.set(canonicalText(source), {
      tenant: tenantText(input.tenant),
      execution: input.execution,
      value: input.material,
    })
    writeEntry(state, entry, receipt)
    state.revision += 1
    deliveries.set(scopedDelivery(input, entry), { entry, receipt, saved })
    state.operations.set(input.operation, { kind: 'received', text: semanticText(input), value })
    if (fault === 'after-publish')
      return fail({ kind: 'commit-unknown', operation: input.operation })
    return succeed(structuredClone({ kind: 'committed', value }))
  }
  const query = async (
    input: ExecutionMutation<P>,
  ): Promise<Outcome<ReceivedCommitQuery, Failure>> => {
    const allowed = permitted(input)
    if ('failure' in allowed) return allowed
    const operation = allowed.ok.operations.get(input.operation)
    if (!operation) return succeed({ kind: 'unknown' })
    if (operation.kind === 'excluded')
      return succeed(structuredClone({ kind: 'excluded', evidence: operation.evidence }))
    if (operation.kind === 'received') {
      if ('failure' in readMaterial(input, operation.value.entry.material))
        return fail(unavailable('material-unreadable'))
      return succeed(structuredClone({ kind: 'committed', value: operation.value }))
    }
    if (operation.entry.kind !== 'received') return fail({ kind: 'unsupported' })
    const delivery = deliveries.get(scopedDelivery(input, operation.entry))
    if (!delivery?.saved) return fail({ kind: 'unsupported' })
    const value = richValue(input, delivery)
    return 'failure' in value
      ? value
      : succeed(structuredClone({ kind: 'committed', value: value.ok }))
  }
  const record = async (
    input: JournalEntryRecord<P>,
  ): Promise<Outcome<CommandReceipt, Failure>> => {
    const fault = recordFaults.shift()
    const outcome = await attemptRecord(input)
    // The scripted fault: the write took effect as usual, only the reply is lost.
    return fault !== undefined && 'ok' in outcome
      ? fail({ kind: 'commit-unknown', operation: input.operation })
      : outcome
  }
  const attemptRecord = async (
    input: JournalEntryRecord<P>,
  ): Promise<Outcome<CommandReceipt, Failure>> => {
    const allowed = permitted(input)
    if ('failure' in allowed) return allowed
    const state = allowed.ok
    const advancing = input.entry.kind !== 'received'
    if (advancing !== (input.authority !== null))
      return fail({ kind: 'invalid', field: 'authority', reason: 'mismatch' })
    if (input.entry.kind === 'received') {
      const delivery = input.entry.delivery
      const resolved =
        delivery.producer === 'model'
          ? resolveModelInvocationRef(delivery.key.reference, input.tenant)
          : resolveToolInvocationRef(delivery.key.reference, input.tenant)
      if (!('ok' in resolved)) return fail(denied())
    }
    const prior = state.operations.get(input.operation)
    const text = recordText(input.entry, input.authority)
    if (prior?.kind === 'record')
      return prior.text === text ? succeed(structuredClone(prior.receipt)) : fail(conflict(input))
    if (prior?.kind === 'received')
      return input.entry.kind === 'received' &&
        canonicalText(input.entry) === canonicalText(prior.value.entry)
        ? succeed(structuredClone(prior.value.receipt))
        : fail(conflict(input))
    if (prior) return fail(conflict(input))
    if (input.entry.kind === 'received') {
      const found = deliveries.get(scopedDelivery(input, input.entry))
      const binding = bindings.get(scopedDelivery(input, input.entry))
      const { material: _source, ...draft } = input.entry
      if (
        binding &&
        (binding.execution !== input.execution || binding.entry !== canonicalText(draft))
      )
        return fail(conflict(input))
      if (found) {
        if (found.receipt.execution !== input.execution) return fail(conflict(input))
        if (canonicalText(found.entry) !== canonicalText(input.entry)) return fail(conflict(input))
        state.operations.set(input.operation, {
          kind: 'record',
          text,
          entry: found.entry,
          receipt: found.receipt,
        })
        return succeed(structuredClone(found.receipt))
      }
    } else {
      if (state.ended) return fail({ kind: 'terminal' })
      if (
        !input.authority ||
        state.detached ||
        input.authority.executionAttachment !== state.authority.executionAttachment ||
        input.authority.generation !== state.authority.generation
      )
        return fail({ kind: 'stale-advance' })
    }
    const receipt = receiptOf(state, input)
    const entry = structuredClone(input.entry)
    writeEntry(state, entry, receipt)
    state.revision += 1
    state.operations.set(input.operation, { kind: 'record', text, entry, receipt })
    if (entry.kind === 'received')
      deliveries.set(scopedDelivery(input, entry), { entry, receipt, saved: null })
    return succeed(structuredClone(receipt))
  }
  const entries: AgentJournalEntries<P> = { record }
  const materialPort: AgentMaterials<P, B> = {
    async preserve(input) {
      const execution = custody.get(canonicalText([tenantText(input.tenant), input.consumer]))
      if (!execution) return fail(denied())
      const permission = qualified({ ...input, execution })
      if ('failure' in permission) return permission
      const source = doubleEvidence(
        'memoryPreservedMaterial',
        canonicalText([tenantText(input.tenant), input.identity, input.consumer]),
        '1',
      )
      const key = canonicalText(source)
      const prior = materials.get(key)
      if (prior && canonicalText(prior.value) !== canonicalText(input.value))
        return fail({ kind: 'invalid', field: 'identity', reason: 'material identity conflict' })
      materials.set(key, {
        tenant: tenantText(input.tenant),
        execution,
        value: structuredClone(input.value),
      })
      return succeed(source)
    },
    async read(input) {
      const result = readMaterial(input, input.source)
      return 'failure' in result ? result : succeed(structuredClone(result.ok.value))
    },
  }
  const joint: ReceivedCommitFixture<P, B> = {
    entries,
    materials: materialPort,
    received: { commit, query },
    journal: {
      async query(input) {
        const allowed = permitted(input)
        if ('failure' in allowed) return allowed
        const operation = allowed.ok.operations.get(input.operation)
        if (!operation) return succeed({ kind: 'unknown' })
        if (operation.kind === 'excluded')
          return succeed(structuredClone({ kind: 'excluded', evidence: operation.evidence }))
        return succeed(
          structuredClone({
            kind: 'committed',
            receipt: operation.kind === 'received' ? operation.value.receipt : operation.receipt,
          }),
        )
      },
    },
    async bind(input) {
      requireState(input)
      const key = scopedDelivery(input, input.entry)
      const text = semanticText(input)
      const prior = bindings.get(key)
      if (prior && (prior.execution !== input.execution || prior.text !== text))
        throw new TypeError('frozen binding cannot change')
      const delivered = deliveries.get(key)
      if (
        delivered &&
        (delivered.receipt.execution !== input.execution ||
          canonicalText({ ...input.entry, material: delivered.entry.material }) !==
            canonicalText(delivered.entry))
      )
        throw new TypeError('established delivery binding cannot change')
      const consumerKey = canonicalText([tenantText(input.tenant), input.entry.consumer])
      const owner = custody.get(consumerKey)
      if (owner !== undefined && owner !== input.execution)
        throw new TypeError('frozen consumer execution cannot change')
      bindings.set(key, { execution: input.execution, text, entry: canonicalText(input.entry) })
      custody.set(consumerKey, input.execution)
    },
    material: name => ({
      kind: 'facts',
      schema: { owner: 'suite', name: 'payload', revision: '1', digest: 'fixture' },
      value: { kind: 'string', value: name },
    }),
    async inspect(who, execution) {
      const state = requireState({ ...who, execution })
      return {
        revision: state.revision,
        entries: state.entries.length,
        materials: [...materials.values()].filter(
          value => value.tenant === tenantText(who.tenant) && value.execution === execution,
        ).length,
      }
    },
    pause(input) {
      const reached = Promise.withResolvers<DurableEvidence>()
      const released = Promise.withResolvers<void>()
      const key = operationKey(input)
      if (pauses.has(key)) throw new TypeError('operation already paused')
      pauses.set(key, { reached: reached.resolve, released: released.promise })
      return { reached: reached.promise, release: () => released.resolve() }
    },
    fault(input, point) {
      faults.set(operationKey(input), point)
    },
    async exclude(input, evidence) {
      const state = requireState(input)
      if (state.operations.has(input.operation))
        throw new TypeError('cannot exclude an established operation')
      state.operations.set(input.operation, {
        kind: 'excluded',
        text: semanticText(input),
        evidence: structuredClone(evidence),
      })
    },
    qualify(who, execution, status) {
      requireState({ ...who, execution }).qualifications.set(who.principal, status)
    },
    retainSaved(input, saved) {
      const state = requireState(input)
      const operation = state.operations.get(input.operation)
      if (operation?.kind !== 'record' || operation.entry.kind !== 'received')
        throw new TypeError('legacy received operation required')
      const delivery = deliveries.get(scopedDelivery(input, operation.entry))
      if (!delivery || saved.owner !== delivery.entry.consumer.owner)
        throw new TypeError('original consumer saved evidence required')
      delivery.saved = structuredClone(saved)
    },
    loseMaterial(source) {
      materials.delete(canonicalText(source))
    },
  }
  const authority = (execution: AgentExecutionId) => {
    generation += 1
    return {
      execution,
      instance: identity(decodeAgentInstanceId('joint-instance')),
      executionAttachment: identity(decodeExecutionAttachmentId(`joint-attachment-${generation}`)),
      generation: String(generation),
      source: doubleEvidence('test-grant', String(generation), '1'),
    }
  }
  return {
    durability: 'none',
    entries,
    joint,
    access,
    otherAccess,
    async open(who, execution) {
      const key = executionKey({ ...who, execution })
      if (executions.has(key)) throw new TypeError('execution already open')
      const grant = authority(execution)
      executions.set(key, {
        authority: grant,
        detached: false,
        ended: false,
        revision: 0,
        entries: [],
        events: [],
        operations: new Map(),
        qualifications: new Map([[who.principal, 'allowed']]),
      })
      return grant
    },
    async supersede(who, execution) {
      const grant = authority(execution)
      const state = requireState({ ...who, execution })
      state.authority = grant
      state.detached = false
      return grant
    },
    async detach(who, execution) {
      requireState({ ...who, execution }).detached = true
    },
    async end(who, execution) {
      requireState({ ...who, execution }).ended = true
    },
    failNextRecord(_who, _execution, fault) {
      recordFaults.push(fault)
    },
    async read(who, execution) {
      const state = stateOf({ ...who, execution })
      return state?.qualifications.get(who.principal) === 'allowed'
        ? structuredClone(state.entries)
        : undefined
    },
    async events(who, execution) {
      return structuredClone(requireState({ ...who, execution }).events)
    },
  }
}
