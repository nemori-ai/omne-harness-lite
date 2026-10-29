import { pendingCalls } from './pending.ts'
export { pendingCalls } from './pending.ts'
import { corrupt, unavailable } from './history-failure.ts'
export { HistoryFailure, corrupt, unavailable } from './history-failure.ts'
import { normalizeControl } from './control.ts'
import { humanWaiting } from './human.ts'
import type {
  AgentEvent,
  Authority,
  PendingCall,
  ProducedResult as AgentResult,
} from '@omne-harness/agent-contract'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { resolveToolInvocationRef } from '@omne-harness/tool-contract'
import type {
  SessionAttemptRecord,
  SessionHistoryIndex,
  SessionHistoryReads,
  SessionInputScope,
  InputId,
  SessionLogConsequence,
  BatchId,
  ConsumptionId,
  SessionCallRegistration,
  CallBinding,
  ProducedResult,
  WorkSnapshot,
  DurableEvidence,
  SessionBatchRecord,
  SessionTakenRecord,
} from '@omne-harness/session-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { digestOf, canonical } from './session-values.ts'
import type { CommonRoot, JournalCell } from './root.ts'
import type { MemoryExecution } from './journal.ts'

export function executionKey(root: CommonRoot, execution: string): string {
  const tenant = root.session?.snapshot.tenant
  if (!tenant) unavailable('Session has not been initialized')
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) corrupt('tenant')
  return JSON.stringify([encoded.value, execution])
}
export function grantAttempt(
  root: CommonRoot,
  execution: string,
  grant: DurableEvidence | null,
): SessionAttemptRecord {
  if (grant === null) unavailable('original Session grant')
  const found = root.sources.grants.get(canonical(grant))
  if (!found || found.execution !== execution) unavailable('grant does not identify original SE15')
  return found
}
export function authorityAttempt(
  root: CommonRoot,
  execution: string,
  authority: Authority,
): SessionAttemptRecord {
  return (
    root.agent.authorities.get(`${execution}\0${canonical(authority)}`) ??
    unavailable('original Authority to grant relationship')
  )
}
export function originalPending(
  root: CommonRoot,
  execution: MemoryExecution,
  pending: PendingCall,
): { pending: PendingCall; authority: Authority } {
  const originals = execution.effects.filter(
    effect => effect.pending.consumption === pending.consumption,
  )
  if (
    originals.some(
      effect =>
        effect.action !== pending.action ||
        canonical(effect.pending.position) !== canonical(pending.position) ||
        canonical(effect.pending.fixed) !== canonical(pending.fixed),
    )
  )
    corrupt('consumption changed its original action, consumer or request')
  const effects = originals.filter(effect => effect.action === pending.action)
  const effect = effects.find(
    effect =>
      canonical(effect.pending.position) === canonical(pending.position) &&
      canonical(effect.pending.fixed) === canonical(pending.fixed),
  )
  if (!effect) unavailable('original pending effect Authority')
  const initial = effect.pending
  if (initial.kind !== pending.kind || initial.purpose !== pending.purpose)
    corrupt('pending differs from original kind or purpose')
  if (
    initial.kind === 'model' &&
    (pending.kind !== 'model' || initial.reference !== pending.reference)
  )
    corrupt('Model invocation changed')
  if (
    initial.kind === 'tool' &&
    initial.association === 'associated' &&
    (pending.kind !== 'tool' ||
      pending.association !== 'associated' ||
      initial.reference !== pending.reference)
  )
    corrupt('Tool invocation changed')
  authorityAttempt(root, execution.id, effect.authority)
  return { pending, authority: effect.authority }
}
export function registration(
  root: CommonRoot,
  execution: MemoryExecution,
  pending: PendingCall,
): SessionCallRegistration {
  const original = originalPending(root, execution, pending)
  const attempt = authorityAttempt(root, execution.id, original.authority)
  if (pending.kind === 'tool' && pending.association === 'intent')
    return {
      kind: 'tool-intent',
      action: pending.action,
      consumer: pending.position,
      request: pending.fixed,
      initiatingAttempt: attempt.attempt,
      purpose: 'action',
    }
  const resolved =
    pending.kind === 'model'
      ? resolveModelInvocationRef(pending.reference, execution.tenant)
      : resolveToolInvocationRef(pending.reference, execution.tenant)
  if ('failure' in resolved) corrupt('pending.reference')
  const fixed = {
    action: pending.action,
    consumer: pending.position,
    request: pending.fixed,
    initiatingAttempt: attempt.attempt,
  }
  return pending.kind === 'model'
    ? {
        kind: 'associated',
        purpose: pending.purpose,
        binding: { ...fixed, producer: { kind: 'model', call: pending.reference } },
      }
    : {
        kind: 'associated',
        purpose: 'action',
        binding: { ...fixed, producer: { kind: 'tool', call: pending.reference } },
      }
}
export function normalizedResult(
  root: CommonRoot,
  execution: MemoryExecution,
  consumption: string,
  result: AgentResult,
): { binding: CallBinding; result: ProducedResult; pending: PendingCall } {
  const matching = pendingCalls(execution).filter(
    pending => pending.consumption === consumption && pending.kind === result.producer.kind,
  )
  const identities = new Set(
    matching.map(pending =>
      canonical({
        action: pending.action,
        position: pending.position,
        fixed: pending.fixed,
        purpose: pending.purpose,
      }),
    ),
  )
  if (identities.size > 1) corrupt('ambiguous original Pending for consumption')
  const candidates = matching.filter(
    pending => pending.kind === 'model' || pending.association === 'associated',
  )
  const pending = candidates.find(pending => {
    if (pending.kind === 'tool' && pending.association === 'intent') return false
    const ref =
      pending.kind === 'model'
        ? resolveModelInvocationRef(pending.reference, execution.tenant)
        : resolveToolInvocationRef(pending.reference, execution.tenant)
    return 'ok' in ref && ref.ok.call === result.producer.call
  })
  if (!pending) unavailable('result original pending and invocation')
  const registered = registration(root, execution, pending)
  if (registered.kind !== 'associated') unavailable('result original association')
  return {
    binding: registered.binding,
    result: { ...result, producer: registered.binding.producer },
    pending,
  }
}
function callConsequences(
  root: CommonRoot,
  execution: MemoryExecution,
  event: AgentEvent,
  pending: PendingCall,
): SessionLogConsequence[] {
  const key = `${execution.id}\0${pending.consumption}`,
    origin = root.agent.callOrigins.get(key)
  if (!origin) unavailable('original call event registration')
  const result: SessionLogConsequence[] = [],
    consumption = String(pending.consumption) as ConsumptionId
  if (origin.first === event.sequence)
    result.push({
      kind: 'call-registration',
      consumption,
      registration: registration(root, execution, origin.pending),
    })
  if (origin.association?.sequence === event.sequence) {
    const associated = registration(root, execution, origin.association.pending)
    if (associated.kind !== 'associated') corrupt('original association')
    result.push({
      kind: 'call-association',
      consumption,
      binding: associated.binding,
      source: origin.association.source,
    })
  }
  return result
}
function normalizeOriginal(
  root: CommonRoot,
  execution: MemoryExecution,
  event: AgentEvent,
): readonly SessionLogConsequence[] {
  const state = root.session
  if (!state) unavailable('Session')
  if (event.execution !== execution.id) corrupt('event.execution')
  const original = root.agent.eventReceipts.get(`${execution.id}\0${event.sequence}`)
  if (!original || canonical(original.evidence) !== canonical(event.cause))
    unavailable('event original commit')
  const body = event.body
  switch (body.kind) {
    case 'input-taken':
      return [
        {
          kind: 'input-taken',
          batch: {
            id: String(body.batch.id) as BatchId,
            watermark: body.batch.watermark,
            ordered: body.batch.ordered.map(input => String(input) as InputId),
          },
        },
      ]
    case 'message':
    case 'stream':
      return [{ kind: 'observed' }]
    case 'ended':
      return [
        {
          kind: 'ended',
          outcome:
            body.conclusion.kind === 'complete'
              ? 'completed'
              : body.conclusion.kind === 'fail'
                ? 'failed'
                : 'cancelled',
          cause: body.conclusion.kind === 'complete' ? null : body.conclusion.cause,
          disposition: body.disposition,
        },
      ]
    case 'waiting': {
      const consequences: SessionLogConsequence[] = []
      const calls: Extract<
        SessionLogConsequence,
        { kind: 'registered-waiting' }
      >['calls'][number][] = []
      const other: Extract<
        SessionLogConsequence,
        { kind: 'registered-waiting' }
      >['other'][number][] = []
      for (const wait of body.waits) {
        if (wait.kind === 'producer') {
          const consumption = String(wait.pending.consumption) as ConsumptionId
          consequences.push(...callConsequences(root, execution, event, wait.pending))
          calls.push({ consumption, position: wait.pending.position.position })
        } else if (wait.kind === 'human') {
          const fragments = root.agent.human.get(`${execution.id}\0${event.sequence}`)
          if (!fragments) corrupt('missing original human event material')
          const fragment = fragments.find(item => item.passage.id === wait.passage)
          if (
            !fragment ||
            canonical(fragment.cards.map(item => item.card.card)) !== canonical(wait.cards)
          )
            corrupt('human event material differs from original cards')
          other.push(humanWaiting(fragment))
        } else other.push(wait)
      }
      return [...consequences, { kind: 'registered-waiting', calls, other }]
    }
    case 'producer': {
      const pending = root.agent.pendingEvents
        .get(`${execution.id}\0${event.sequence}`)
        ?.find(item => item.consumption === body.consumption)
      if (!pending) unavailable('original producer pending')
      const registered = registration(root, execution, pending)
      if (registered.kind !== 'associated') corrupt('producer without original association')
      const value = {
        pending,
        binding: registered.binding,
        result: { ...body.result, producer: registered.binding.producer },
      }
      const consumption = String(body.consumption) as ConsumptionId
      return [
        ...callConsequences(root, execution, event, value.pending),
        { kind: 'producer', consumption, binding: value.binding, result: value.result },
      ]
    }
    case 'control':
      return normalizeControl(root, execution, event)
  }
}
const normalized = new WeakMap<AgentEvent, readonly SessionLogConsequence[]>()
export function normalize(
  root: CommonRoot,
  execution: MemoryExecution,
  event: AgentEvent,
): readonly SessionLogConsequence[] {
  if (event.body.kind === 'control') return normalizeOriginal(root, execution, event)
  const held = normalized.get(event)
  if (held) return held
  const value = normalizeOriginal(root, execution, event)
  normalized.set(event, value)
  return value
}
export function history<P>(
  cell: JournalCell<P>,
  snapshot: WorkSnapshot,
  scope: SessionInputScope,
  extra: readonly string[] = [],
  through?: ReadonlyMap<string, string>,
): { index: SessionHistoryIndex; reads: SessionHistoryReads } {
  const root = cell.state(),
    state = root.session
  if (!state) unavailable('Session')
  const runs = root.sources.runs
  const allAdmissions = root.agent.admissions
  const needed = new Set<string>(extra)
  const inputIds = new Set(scope.inputs)
  for (const input of inputIds)
    for (const admission of allAdmissions.get(input) ?? []) needed.add(admission.execution)
  for (const input of inputIds) {
    for (const batch of root.agent.inputBatches.get(input) ?? [])
      for (const member of batch.batch.ordered) inputIds.add(member)
    for (const admission of allAdmissions.get(input) ?? []) needed.add(admission.execution)
  }
  const attempts = [...needed].flatMap(id => root.sources.attemptsByExecution.get(id) ?? [])
  const inputs = [...inputIds].map(input => {
    const records = allAdmissions.get(input) ?? []
    return {
      input,
      directory: `${cell.namespace}/${input}`,
      version: String(records.length),
      count: String(records.length),
      source: {
        owner: 'session-history',
        record: `${cell.namespace}/${input}`,
        revision: String(records.length),
        digest: digestOf(records),
      },
      members: records.map(({ ordinal, run, execution, operation, accepted, attempt }) => ({
        ordinal,
        run,
        execution,
        operation,
        accepted,
        attempt,
      })),
    }
  })
  const executions: SessionHistoryIndex['executions'][number][] = []
  const prefixes: SessionHistoryReads['prefixes'][number][] = []
  const batches: SessionBatchRecord[] = []
  const taken: SessionTakenRecord[] = []
  for (const id of needed) {
    const execution = root.agent.executions.get(executionKey(root, id))
    const run = runs.get(id)
    if (!execution || !run) unavailable('execution original history')
    const records = root.agent.originals.get(id) ?? [],
      head = records.at(-1)?.receipt
    if (!head) unavailable('execution original head receipt')
    const reference =
      snapshot.run.kind === 'active' && snapshot.run.run === run.run
        ? snapshot.run.execution
        : snapshot.executions?.find(item => item.run === run.run)?.execution
    if (!reference) unavailable('original execution reference')
    const upper =
      through === undefined
        ? String(execution.events.length)
        : (through.get(id) ?? reference.readThrough)
    if (!cell.historyReadable(id) && BigInt(upper) > BigInt(reference.readThrough))
      unavailable('original history temporarily unreadable')
    const facts = Array.from(
      execution.events.slice(Number(reference.readThrough), Number(upper)),
    ).map(event => {
      if (!event) corrupt('confirmed original event gap')
      return {
        sequence: event.sequence,
        source: event.cause,
        consequences: normalize(root, execution, event),
      }
    })
    const ended = root.agent.ended.get(id)
    executions.push({
      run: run.run,
      execution: id,
      started: run.source,
      revision: String(execution.revision),
      executionEvidence: head.evidence,
      emittedThrough: String(execution.events.length),
      readThrough: reference.readThrough,
      interpreted:
        reference.readThrough === '0'
          ? null
          : (root.sources.cursors.get(id)?.commit ??
            unavailable('original interpretation receipt')),
      ended: ended ? { sequence: ended.sequence, source: ended.source } : null,
      facts: facts.map(fact => ({
        sequence: fact.sequence,
        source: fact.source,
        kinds: fact.consequences.map(item => item.kind),
      })),
    })
    prefixes.push({
      execution: id,
      run: run.run,
      after: reference.readThrough,
      through: upper,
      facts: facts.filter(fact => BigInt(fact.sequence) > BigInt(reference.readThrough)),
    })
    batches.push(...(root.agent.batches.get(id) ?? []))
    taken.push(...(root.sources.takenByExecution.get(id) ?? []))
  }
  const boundary = {
    tenant: cell.tenant,
    session: cell.session,
    position: String(root.position),
    source: {
      owner: 'session-memory-journal',
      record: cell.namespace,
      revision: String(root.position),
      digest: digestOf([cell.namespace, String(root.position)]),
    },
  }
  return {
    index: { root: boundary, inputs, executions, attempts, batches, taken },
    reads: {
      root: boundary,
      scope,
      admissions: inputs.flatMap(input => {
        const records = allAdmissions.get(input.input) ?? []
        return records.length
          ? [
              {
                input: input.input,
                directory: input.directory,
                version: input.version,
                offset: '0',
                next: null,
                records,
              },
            ]
          : []
      }),
      prefixes,
      attempts,
      taken,
    },
  }
}
